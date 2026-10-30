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
  let cursorPosition = null;
  let cursorFrame = '';
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
  let targetMotionY = 0;
  let roamedFrame = '';

  const sequenceFrames = {
    blink: [1,2,3,4,1], double_blink: [1,2,3,4,3,2,1], alert: [1,5,1],
    curious: [1,40,42,40,43,1], bounce: [1,49,44,45,50,45,46,71,1],
    hop: [1,49,47,48,46,71,1], big_bounce: [1,51,52,50,52,46,71,1],
    turn_left: [1,17,18,19,20,21,22,16,15,14,13,12,1],
    turn_right: [1,12,13,14,15,16,22,21,20,19,18,17,1],
    look_around: [1,40,42,41,43,40,43,41,40,1], wobble: [57,1,58,1,57,1,58,1],
    wink: [1,10,1], poke: [1,54,53,54,53,71,1], loading_pulse: [1,54,53,54,1],
    thinking: [1,63,64,63,65,63,1], worried: [1,59,60,59,1],
    celebrate: [1,49,47,66,50,66,48,46,71,1], fall_asleep: [1,61,62], wake_up: [62,61,1,5,1],
    focus: [1,63,1], shy: [1,68,1], sad: [1,60,1]
  };
  const priorities = { loading_pulse: 20, fall_asleep: 30, wake_up: 30, poke: 40, big_bounce: 35, celebrate: 35, worried: 25, bounce: 10, hop: 15, loading: 20, focus: 18 };
  const bounceIndices = new Set([44,50]);

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
      if (name !== 'fall_asleep') setFrame(name === 'loading_pulse' ? 'idle' : name === 'wake_up' ? 'idle' : sequenceFrames[name]?.includes(63) ? 'focus' : 'idle');
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
    const verticalDistance = targetMotionY - motionY;
    if (Math.abs(verticalDistance) > 0.1) {
      motionY += verticalDistance * Math.min(1, delta * 0.02);
      applyPosition();
    } else if (motionY !== targetMotionY) {
      motionY = targetMotionY;
      applyPosition();
    }
    if (!current) {
      if (roamEnabled || Math.abs(targetMotionY - motionY) > 0.1) rafId = requestAnimationFrame(tick);
      else rafId = 0;
      return;
    }
    const numberDuration = current.name === 'blink' || current.name === 'double_blink' ? 45 : 68;
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
    cursorFrame = '';
    applyCursorLook();
    if (!interrupted) scheduleIdle();
    else if (queue.length) play(queue.shift().name);
    if (visible && !rafId && (roamEnabled || Math.abs(targetMotionY - motionY) > 0.1)) {
      rafId = requestAnimationFrame(tick);
    }
  }

  function showCurrentFrame(interrupted) {
    if (!current) return;
    const index = current.indices[frameIndex];
    const frameName = Object.entries(frames).find(([, file]) => Number(file.match(/^([0-9]+)_/)?.[1]) === index)?.[0] || 'idle';
    setFrame(frameName);
    targetMotionY = 0;
    if (current.name === 'bounce' && bounceIndices.has(index) && !interrupted) targetMotionY = index === 50 ? -18 : -9;
    if (['hop','celebrate'].includes(current.name) && (index === 47 || index === 66)) targetMotionY = -16;
    applyPosition();
  }

  function setFrameScale(scale) {
    image.style.setProperty('--orb-fit', scale.toString());
  }

  function applyPosition() {
    const scale = size / 256;
    orb.style.transform = `translate(${(roamX + motionX).toFixed(2)}px, ${(motionY - 48).toFixed(2)}px)`;
    setFrameScale(scale);
  }

  function chooseRoamTarget() {
    if (!roamEnabled || !visible) return;
    const half = Math.max(0, (stage.clientWidth - size) / 2 - 10);
    roamTargetX = -half + Math.random() * half * 2;
    const frame = roamTargetX < roamX ? 'lean_left' : 'lean_right';
    if (!cursorPosition) setFrame(frame);
    roamedFrame = frame;
    roamTimer = setTimeout(() => {
      if (!current && !cursorPosition) setFrame('settle');
      setTimeout(() => {
        if (!current) {
          if (cursorPosition) applyCursorLook();
          else setFrame('idle');
        }
      }, 380);
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
      const choices = enabled.length ? enabled : ['blink','look_around','curious','wobble','wink','bounce'];
      const spontaneous = ['turn_left', 'turn_right', ...choices.filter(choice => ['bounce', 'hop'].includes(choice))];
      let name = Math.random() < 0.2 && spontaneous.length
        ? spontaneous[Math.floor(Math.random() * spontaneous.length)]
        : choices[Math.floor(Math.random() * choices.length)];
      if (name === previousBehavior) name = choices.find(choice => choice !== previousBehavior) || name;
      previousBehavior = name;
      play(name); setTimeout(scheduleIdle, 400);
    }, 2000 + Math.random() * 4000);
  }

  function mouseLook(event) {
    if (!visible) return;
    cursorPosition = { x: event.clientX, y: event.clientY };
    applyCursorLook();
  }

  function applyCursorLook() {
    if (!cursorPosition || current || sleepHold) return;
    const orbRect = orb.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const x = (cursorPosition.x - (orbRect.left + orbRect.width / 2)) / Math.max(size * 0.75, stageRect.width * 0.38);
    const y = (cursorPosition.y - (orbRect.top + orbRect.height / 2)) / Math.max(size * 0.75, stageRect.height * 0.38);
    const horizontal = x < -0.32 ? -1 : x > 0.32 ? 1 : 0;
    const vertical = y < -0.32 ? -1 : y > 0.32 ? 1 : 0;
    let name = 'idle';
    if (horizontal && vertical) {
      name = vertical < 0
        ? (horizontal < 0 ? 'up_left' : 'up_right')
        : (horizontal < 0 ? 'down_left' : 'down_right');
    } else if (horizontal) {
      name = horizontal < 0 ? 'round_look_l' : 'round_look_r';
    } else if (vertical) {
      name = vertical < 0 ? 'round_look_up' : 'round_look_down';
    }
    if (name !== cursorFrame) {
      cursorFrame = name;
      setFrame(name);
    }
  }

  let clicks = 0;
  let clickTimer = 0;
  stage.addEventListener('pointermove', mouseLook);
  stage.addEventListener('pointerleave', () => {
    cursorPosition = null;
    cursorFrame = '';
    if (!current) setFrame('idle');
  });
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
      setFrameScale(size / 256);
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
    setFrameScale(size / 256);
    applyPosition();
  }).observe(stage);
  preload().catch(() => setFrame('idle'));
})();
