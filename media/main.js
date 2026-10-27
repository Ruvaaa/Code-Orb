(() => {
  const stage = document.getElementById('orb-stage');
  const orb = document.getElementById('orb');
  const image = document.getElementById('orb-frame');
  const vscode = acquireVsCodeApi();
  let frames = {};
  let frameUrls = {};
  let visible = true;
  let reducedMotion = false;
  let reducedFromSetting = false;
  let size = 260;
  let current = null;
  let queue = [];
  let rafId = 0;
  let lastTime = 0;
  let elapsed = 0;
  let frameIndex = 0;
  let idleTimer = 0;
  let previousBehavior = '';
  let sleepHold = false;
  let roamEnabled = true;
  let roamX = 0;
  let roamTargetX = 0;
  let roamTimer = 0;
  let motionX = 0;
  let motionY = 0;
  let roamedFrame = '';

  const sequenceFrames = {
    blink: [1,2,3,2,1], double_blink: [1,2,3,2,3,2,1], alert: [1,4,1],
    curious: [1,7,33,7,1], bounce: [1,27,5,6,16,6,8,48,1], hop: [1,27,25,26,8,48,1],
    big_bounce: [1,44,45,16,45,8,48,1], look_around: [1,9,29,11,30,10,32,17,31,9,1],
    wobble: [14,1,15,1,14,1,15,1], wink: [1,18,1], poke: [1,21,1,22,1,19,48,1],
    loading_pulse: [1,20,19,20,1], thinking: [1,24,41,24,42,24,1], worried: [1,23,40,23,1],
    celebrate: [1,27,25,43,16,43,26,8,48,1], fall_asleep: [1,36,12,13], wake_up: [13,12,36,1,4,1],
    focus: [1,24,1], shy: [1,39,1], sad: [1,40,1]
  };
  const priorities = { loading_pulse: 20, fall_asleep: 30, wake_up: 30, poke: 40, big_bounce: 35, celebrate: 35, worried: 25, bounce: 10, hop: 15, loading: 20, focus: 18 };
  const bounceIndices = new Set([6,16]);

  async function preload() {
    const response = await fetch(window.__CODEORB__.framesUri);
    frames = await response.json();
    const entries = Object.entries(frames);
    await Promise.all(entries.map(async ([name, file]) => {
      const url = `${window.__CODEORB__.assetRoot}/frames/${file}`;
      frameUrls[name] = url;
      await new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = url; });
    }));
    setFrame('idle');
    scheduleIdle();
    if (!rafId && visible) rafId = requestAnimationFrame(tick);
    vscode.postMessage({ type: 'ready' });
  }

  function setFrame(name) {
    const url = frameUrls[name];
    if (url && image.src !== url) image.src = url;
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function play(name, priority) {
    if (reducedMotion) {
      if (name !== 'fall_asleep') setFrame(name === 'loading_pulse' ? 'idle' : name === 'wake_up' ? 'idle' : sequenceFrames[name]?.includes(24) ? 'focus' : 'idle');
      if (['bounce','hop','big_bounce','celebrate'].includes(name)) setFrame('pop');
      return new Promise(resolve => setTimeout(() => { setFrame('idle'); resolve(); }, 180));
    }
    if (!sequenceFrames[name]) return Promise.resolve();
    const suppliedPriority = priority ?? priorities[name] ?? 10;
    if (current && suppliedPriority < current.priority) return Promise.resolve();
    if (current && suppliedPriority === current.priority && current.name !== name) return Promise.resolve();
    if (current && suppliedPriority > current.priority) { current.interrupted = true; }
    const indices = sequenceFrames[name];
    const loop = name === 'loading_pulse' || name === 'thinking';
    current = { name, indices, loop, priority: suppliedPriority, hold: name === 'fall_asleep', resolve: null };
    frameIndex = 0;
    elapsed = 0;
    showCurrentFrame();
    if (!rafId && visible) rafId = requestAnimationFrame(tick);
  }

  function tick(time) {
    if (!visible) { rafId = 0; return; }
    if (!lastTime) lastTime = time;
    const delta = time - lastTime;
    elapsed += delta;
    lastTime = time;
    updateRoam(delta);
    if (!current) { rafId = requestAnimationFrame(tick); return; }
    const numberDuration = current.name === 'blink' || current.name === 'double_blink' ? 55 : 95;
    if (elapsed >= numberDuration) {
      elapsed %= numberDuration;
      if (!advanceFrame()) { lastTime = time; return; }
    }
    rafId = requestAnimationFrame(tick);
  }

  function advanceFrame() {
    if (!current) return false;
    const interrupted = current.interrupted;
    frameIndex++;
    if (frameIndex >= current.indices.length) {
      if (current.loop && !interrupted) { frameIndex = 0; showCurrentFrame(); return true; }
      if (current.hold && sleepHold) { showCurrentFrame(); return true; }
      finishSequence();
      return !!rafId;
    }
    showCurrentFrame(interrupted);
    return true;
  }

  function finishSequence() {
    if (current?.hold && sleepHold) return;
    const interrupted = current?.interrupted;
    current = null;
    stopLoop();
    setFrame('idle');
    if (!interrupted) scheduleIdle();
    else if (queue.length) play(queue.shift().name);
  }

  function showCurrentFrame(interrupted) {
    if (!current) return;
    const index = current.indices[frameIndex];
    const names = Object.keys(frames).find(name => frameIndexName(current.indices, index, frameIndex, name));
    const frameName = Object.entries(frames).find(([, file]) => Number(file.match(/^([0-9]+)_/)?.[1]) === index)?.[0] || 'idle';
    setFrame(frameName);
    motionY = 0;
    if (current.name === 'bounce' && bounceIndices.has(index) && !interrupted) motionY = index === 16 ? -18 : -9;
    if (['hop','celebrate'].includes(current.name) && (index === 25 || index === 43)) motionY = -16;
    applyPosition();
  }

  function frameIndexName(indices, index, position, name) { return false; }

  function applyPosition() {
    const scale = size / 256;
    orb.style.transform = `translate(${(roamX + motionX).toFixed(2)}px, ${(motionY - 48).toFixed(2)}px)`;
    image.style.setProperty('--orb-fit', scale.toString());
  }

  function chooseRoamTarget() {
    if (!roamEnabled || !visible) return;
    const half = Math.max(0, (stage.clientWidth - size) / 2 - 10);
    roamTargetX = -half + Math.random() * half * 2;
    const frame = roamTargetX < roamX ? 'lean_left' : 'lean_right';
    setFrame(frame);
    roamedFrame = frame;
    roamTimer = setTimeout(() => {
      setFrame('settle');
      setTimeout(() => { if (!current) setFrame('idle'); }, 380);
    }, 1200 + Math.random() * 1400);
    roamTimer = setTimeout(chooseRoamTarget, 3000 + Math.random() * 4000);
  }

  function updateRoam(delta) {
    if (!roamEnabled || !visible || current) return;
    roamX += (roamTargetX - roamX) * Math.min(1, delta * 0.0015);
    applyPosition();
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    if (!visible || sleepHold) return;
    idleTimer = setTimeout(() => {
      const enabled = window.__CODEORB_SETTINGS__.idleBehaviors || [];
      const choices = enabled.length ? enabled : ['blink','look_around','curious','wobble','wink','blink'];
      let name = choices[Math.floor(Math.random() * choices.length)];
      if (name === previousBehavior) name = choices.find(choice => choice !== previousBehavior) || name;
      previousBehavior = name;
      play(name); setTimeout(scheduleIdle, 400);
    }, 2000 + Math.random() * 4000);
  }

  function mouseLook(event) {
    if (!visible) return;
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 2 - 1;
    const y = (event.clientY - rect.top) / rect.height * 2 - 1;
    if (Math.abs(x) < .25 && Math.abs(y) < .25) { setFrame('idle'); return; }
    let name = 'idle';
    if (y < -.25) name = x < -.25 ? 'look_up_left' : x > .25 ? 'look_up_right' : 'look_up';
    else if (y > .25) name = x < -.25 ? 'look_down_left' : x > .25 ? 'look_down_right' : 'look_down';
    else name = x < 0 ? 'look_left' : 'look_right';
    setFrame(name);
  }

  let clicks = 0;
  let clickTimer = 0;
  stage.addEventListener('pointermove', mouseLook);
  stage.addEventListener('pointerleave', () => setFrame('idle'));
  stage.addEventListener('click', () => {
    clicks++;
    clearTimeout(clickTimer);
    if (clicks === 1) clickTimer = setTimeout(() => { play('poke'); clicks = 0; }, 220);
    else { clicks = 0; play('big_bounce'); }
  });
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (!visible) stopLoop(); else if (!rafId) rafId = requestAnimationFrame(tick);
  });
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'settings') {
      const maximum = Math.max(64, Math.min(280, stage.clientHeight - 12));
      size = Math.max(64, Math.min(maximum, message.size));
      orb.style.width = `${size}px`; orb.style.height = `${size}px`;
      image.style.setProperty('--orb-fit', String(size / 256));
      reducedFromSetting = !!message.reduceMotion;
      reducedMotion = reducedFromSetting || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      roamEnabled = !!message.roam;
      window.__CODEORB_SETTINGS__.size = message.size;
      window.__CODEORB_SETTINGS__.idleBehaviors = message.idleBehaviors || [];
      stage.hidden = message.enabled === false;
      if (roamEnabled && !roamTimer) chooseRoamTarget();
    } else if (message.type === 'visibility') visible = message.visible;
    else if (message.type === 'sequence') play(message.name);
    else if (message.type === 'idle') { current = null; stopLoop(); setFrame('idle'); scheduleIdle(); }
  });
  window.__CODEORB_SETTINGS__ = {};
  new ResizeObserver(() => {
    const maximum = Math.max(64, Math.min(280, stage.clientHeight - 12));
    const requested = window.__CODEORB_SETTINGS__.size || 260;
    size = Math.max(64, Math.min(maximum, requested));
    orb.style.width = `${size}px`; orb.style.height = `${size}px`;
    image.style.setProperty('--orb-fit', String(size / 256));
    applyPosition();
  }).observe(stage);
  preload().catch(() => setFrame('idle'));
})();
