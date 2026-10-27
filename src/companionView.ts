import * as vscode from 'vscode';

export type CompanionEvent = 'typing' | 'save' | 'switch' | 'wake';

export class CompanionViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codeOrb.companionView';

    private view?: vscode.WebviewView;

    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'assets')]
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        webviewView.onDidDispose(() => {
            if (this.view === webviewView) {
                this.view = undefined;
            }
        }, undefined);
    }

    send(event: CompanionEvent): void {
        void this.view?.webview.postMessage({ event });
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const frameNames: Record<string, string> = {
            idle: '1_idle.png', blinkStart: '2_blink_start.png', blink: '3_blink_closed.png',
            alert: '4_alert.png', squash: '5_squash.png', stretch: '6_stretch.png', tilt: '7_tilt.png',
            landing: '8_landing.png', lookLeft: '9_look_left.png', lookRight: '10_look_right.png',
            lookUp: '11_look_up.png', sleepy: '12_sleepy.png', sleeping: '13_sleeping.png',
            wobbleLeft: '14_wobble_left.png', wobbleRight: '15_wobble_right.png', jump: '16_jump_apex.png',
            lookDown: '17_look_down.png', wink: '18_wink.png', pop: '19_pop.png', shrink: '20_shrink.png',
            squishLeft: '21_squish_left.png', squishRight: '22_squish_right.png', worried: '23_worried.png', focus: '24_focus.png'
        };
        const frames = Object.fromEntries(Object.entries(frameNames).map(([key, name]) => [key,
            webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'frames', name)).toString()
        ]));
        const csp = [
            "default-src 'none'",
            "style-src 'nonce-${nonce}'",
            "script-src 'nonce-${nonce}'",
            "img-src ${webview.cspSource} https: data:"
        ].join('; ').replaceAll('${nonce}', nonce).replace('${webview.cspSource}', webview.cspSource);

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style nonce="${nonce}">
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body { margin: 0; overflow: hidden; background: var(--vscode-sideBar-background, var(--vscode-editor-background, #181818)); }
.stage { position: relative; width: 100%; height: 100vh; min-height: 120px; display: grid; place-items: center; overflow: hidden; cursor: default; background: var(--vscode-sideBar-background, var(--vscode-editor-background, transparent)); }
.orb-wrap { position: relative; width: clamp(160px, 88vw, 288px); height: clamp(160px, 88vw, 288px); display: grid; place-items: center; will-change: transform, filter; transition: filter .5s ease; }
.orb-image { width: 100%; height: 100%; object-fit: contain; user-select: none; pointer-events: none; animation: breathe 5s ease-in-out infinite, settle 7s ease-in-out infinite; }
.orb-wrap.energetic .orb-image { animation-duration: 3.4s, 4.8s; }
.orb-wrap.sleepy { filter: saturate(.78) brightness(.92); }
.orb-wrap.sleeping { filter: saturate(.68) brightness(.86); }
@keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.018); } }
@keyframes settle { 0%,82%,100% { rotate: 0deg; } 88% { rotate: -1.5deg; } 94% { rotate: 1deg; } }
@media (prefers-reduced-motion: reduce) { .orb-image { animation: none; } }
</style>
</head>
<body>
<div class="stage" aria-label="Code Orb companion">
  <div class="orb-wrap">
    <img class="orb-image" alt="Code Orb" src="${frames.idle}">
  </div>
</div>
<script nonce="${nonce}">
(() => {
  const vscode = acquireVsCodeApi();
  const frames = ${JSON.stringify(frames)};
  const stage = document.querySelector('.stage');
  const wrap = document.querySelector('.orb-wrap');
  const image = document.querySelector('.orb-image');
  let lastActivity = Date.now();
  let sleepTimer;
  let wanderTimer;
  let visibilityPaused = document.hidden;
  const sleepyAfter = 60000;
  const sleepingAfter = 120000;

  function wake() {
    wrap.classList.remove('sleepy', 'sleeping');
    lastActivity = Date.now();
    setFrame('idle');
    scheduleSleep();
  }
  function scheduleSleep() {
    clearTimeout(sleepTimer);
    if (visibilityPaused || document.hidden) return;
    sleepTimer = setTimeout(() => {
      const idle = Date.now() - lastActivity;
      wrap.classList.toggle('sleepy', idle >= sleepyAfter);
      wrap.classList.toggle('sleeping', idle >= sleepingAfter);
      setFrame(idle >= sleepingAfter ? 'sleeping' : idle >= sleepyAfter ? 'sleepy' : 'idle');
      if (idle < sleepingAfter) scheduleSleep();
    }, 5000);
  }
  let frameTimer;
  let lookTimer;
  let cursorTimer;
  let cursorActiveUntil = 0;
  let motionFrame;
  let anchorX = 0;
  let anchorY = 0;
  let targetX = 0;
  let targetY = 0;
  let randomTargetX = 0;
  let randomTargetY = 0;
  let randomMovementTimer;
  function setFrame(name) {
    if (image.src !== frames[name]) image.src = frames[name];
  }
  function lookAround() {
    if (visibilityPaused || wrap.classList.contains('sleeping') || Date.now() < cursorActiveUntil) return;
    const next = Math.random() < .72
      ? (Math.random() < .5 ? 'lookLeft' : 'lookRight')
      : (Math.random() < .5 ? 'lookUp' : 'focus');
    setFrame(next);
    lookTimer = setTimeout(() => {
      setFrame('idle');
      randomTargetX = (Math.random() - .5) * 14;
      randomTargetY = (Math.random() - .5) * 6;
    }, 900 + Math.random() * 700);
  }
  function blink() {
    if (visibilityPaused || wrap.classList.contains('sleeping')) return;
    setFrame('blinkStart');
    setTimeout(() => setFrame('blink'), 90);
    setTimeout(() => setFrame('idle'), 260);
    setTimeout(blink, 3500 + Math.random() * 6500);
  }
  function moveOrb() {
    if (!visibilityPaused) {
      const time = Date.now() / 1600;
      const desiredX = cursorActiveUntil > Date.now() ? anchorX : randomTargetX + Math.sin(time * .9) * 2.5;
      const desiredY = cursorActiveUntil > Date.now() ? anchorY : randomTargetY + Math.sin(time * .62) * 1.8;
      targetX += (desiredX - targetX) * .012;
      targetY += (desiredY - targetY) * .012;
      const x = targetX.toFixed(2);
      const y = targetY.toFixed(2);
      wrap.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    }
    motionFrame = requestAnimationFrame(moveOrb);
  }
  window.addEventListener('pointermove', event => {
    if (visibilityPaused || wrap.classList.contains('sleeping')) return;
    if (wrap.classList.contains('sleeping')) wake();
    cursorActiveUntil = Date.now() + 900;
    const rect = stage.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const horizontal = Math.abs(dx) > 28;
    const vertical = Math.abs(dy) > 34 && Math.abs(dy) > Math.abs(dx) * .65;
    let next = 'focus';
    if (horizontal && !vertical) next = dx < 0 ? 'lookLeft' : 'lookRight';
    else if (vertical) next = dy < 0 ? 'lookUp' : 'lookDown';
    setFrame(next);
    anchorX = Math.max(-8, Math.min(8, dx / 18));
    anchorY = Math.max(-5, Math.min(5, dy / 24));
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      setFrame('idle');
      anchorX = 0;
      anchorY = 0;
      targetX = 0;
      targetY = 0;
      cursorActiveUntil = 0;
    }, 950);
  });
  stage.addEventListener('pointerleave', () => {
    clearTimeout(cursorTimer);
    setFrame('idle');
    anchorX = 0;
    anchorY = 0;
    targetX = 0;
    targetY = 0;
    cursorActiveUntil = 0;
  });
  window.addEventListener('message', event => {
    const { event: activity } = event.data;
    if (activity === 'typing') {
      wake();
      wrap.classList.add('energetic');
      setTimeout(() => wrap.classList.remove('energetic'), 900);
      setFrame(Math.random() > .6 ? 'focus' : 'alert');
      setTimeout(() => setFrame('idle'), 500);
    } else if (activity === 'save') {
      wake();
      setFrame('pop');
      setTimeout(() => setFrame('focus'), 180);
      setTimeout(() => setFrame('idle'), 650);
    } else if (activity === 'switch') {
      wake();
      lookAround();
    } else if (activity === 'wake') {
      wake();
    }
  });
  document.addEventListener('visibilitychange', () => {
    visibilityPaused = document.hidden;
    if (document.hidden) {
      clearTimeout(sleepTimer);
      clearTimeout(wanderTimer);
    } else {
      wake();
    }
  });
  function chooseRandomMovement() {
    randomTargetX = (Math.random() - .5) * 18;
    randomTargetY = (Math.random() - .5) * 8;
    randomMovementTimer = setTimeout(chooseRandomMovement, 2800 + Math.random() * 3300);
  }
  wake();
  chooseRandomMovement();
  moveOrb();
  setTimeout(blink, 1800 + Math.random() * 2200);
  lookTimer = setInterval(lookAround, 7000 + Math.random() * 5000);
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
