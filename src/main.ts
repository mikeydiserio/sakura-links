import { Game } from './core/Game';
import { CUSTOM_COURSES } from './course';

/**
 * Entry point. Everything downstream is constructed by `Game`; this file only
 * resolves the DOM handles, surfaces a readable message if WebGL is missing,
 * and boots the level editor's test-drive payload when present.
 *
 * The payload key is inlined rather than imported so the game bundle never
 * depends on any editor module — the editor stays devour-only to this entry.
 */
const EDITOR_TESTDRIVE_KEY = 'sakura-links/editor/test-drive';

function readTestDrive(): { course: NonNullable<typeof CUSTOM_COURSES[number]>; holeIndex: number } | null {
  try {
    const raw = localStorage.getItem(EDITOR_TESTDRIVE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as { course?: unknown; holeIndex?: unknown };
    const course = payload?.course as { id?: unknown; holes?: unknown } | undefined;
    if (!course || typeof course.id !== 'string' || !Array.isArray(course.holes)) return null;
    return {
      course: course as NonNullable<typeof CUSTOM_COURSES[number]>,
      holeIndex: typeof payload.holeIndex === 'number' ? payload.holeIndex : 0,
    };
  } catch {
    return null;
  }
}
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
    // Test drive: the level editor opened this tab with a custom course payload
    // and a `?testDrive=1&course=<id>` query. Register it, then jump straight
    // into the authored hole instead of the main menu.
    const testDrive = new URLSearchParams(location.search).get('testDrive')
      ? readTestDrive()
      : null;
    if (testDrive) CUSTOM_COURSES.push(testDrive.course);

    const game = new Game(canvas, uiRoot);
    game.start();

    if (testDrive) game.startTestDrive(testDrive.course.id, testDrive.holeIndex);

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
