import { Game } from './core/Game';

/**
 * Entry point. Everything downstream is constructed by `Game`; this file only
 * resolves the DOM handles and surfaces a readable message if WebGL is missing.
 */
const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui');

if (!canvas || !uiRoot) {
  throw new Error('Expected #stage and #ui to exist in index.html');
}

function fail(message: string): void {
  const notice = document.createElement('div');
  notice.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'text-align:center;padding:40px;font-family:system-ui,sans-serif;color:#fdf7ff;' +
    'background:#0a0810;font-size:15px;line-height:1.7;z-index:999';
  notice.innerHTML = message;
  document.body.appendChild(notice);
}

// Probe for WebGL before constructing anything: a clear message beats a stack
// trace from deep inside the renderer.
const probe = document.createElement('canvas');
const supported = Boolean(
  probe.getContext('webgl2') ?? probe.getContext('webgl'),
);

if (!supported) {
  fail(
    '<div><strong style="font-size:20px">WebGL unavailable</strong><br><br>' +
      'Sakura Links needs hardware-accelerated WebGL.<br>' +
      'Enable it in your browser settings, then reload.</div>',
  );
} else {
  try {
    const game = new Game(canvas, uiRoot);
    game.start();

    // Release GPU and audio resources on navigation away, which matters for
    // single-page hosts that keep the tab alive.
    window.addEventListener('pagehide', () => game.dispose(), { once: true });
  } catch (error) {
    console.error(error);
    fail(
      '<div><strong style="font-size:20px">Something went wrong</strong><br><br>' +
        `${error instanceof Error ? error.message : String(error)}<br><br>` +
        'Check the browser console for details.</div>',
    );
  }
}
