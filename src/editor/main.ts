import { EditorStore } from './EditorStore';
import { EditorHost } from './EditorHost';
import { resolveCourse } from './persistence';
import { showCoursePicker, type PickerChoice } from './picker';

/**
 * Editor entry point. Resolves the startup document (explicit course id →
 * autosaved draft → blank course), then hands everything to the host.
 *
 * The page chrome is injected here as plain CSS — the project ships no asset
 * files, and the editor follows the same no-framework rule as the game UI.
 */

const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; }
body {
  background: #12131f;
  color: #fdf7ff;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.editor-root { display: flex; flex-direction: column; height: 100vh; }
#viewport { flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden; }

/* --- Panel shell ---------------------------------------------------------- */
.gp-panel {
  flex: 0 0 46vh;
  overflow-y: auto;
  background: #1a1b26;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
  overscroll-behavior: contain;
}
.gp-top {
  position: sticky; top: 0; z-index: 5;
  background: #1f2030;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 6px 10px;
}
.gp-course { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.gp-course-name { flex: 1 1 180px; min-width: 120px; }
.gp-holes-row { display: flex; gap: 6px; align-items: center; }
.gp-holes-row .gp-hole-select { min-width: 150px; }
.gp-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.gp-spacer { flex: 1 1 auto; }

/* --- Inputs --------------------------------------------------------------- */
.gp-input, .gp-num, .gp-text, .gp-select {
  background: #14151f;
  color: #fdf7ff;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 5px;
  padding: 4px 8px;
  font: inherit;
}
.gp-input:focus, .gp-num:focus, .gp-text:focus, .gp-select:focus {
  outline: 1px solid #8fb7ff;
  border-color: #8fb7ff;
}
.gp-num { width: 72px; }
.gp-text { width: 100%; }
.gp-select { padding: 4px 4px; }
.gp-check { width: 16px; height: 16px; accent-color: #8fb7ff; }
.gp-points { width: 100%; resize: vertical; min-height: 54px; font-family: ui-monospace, monospace; font-size: 12px; }
.gp-invalid { border-color: #ff6b6b !important; outline: 1px solid #ff6b6b; }
.gp-color-row { display: flex; gap: 4px; align-items: center; }
.gp-color { width: 40px; height: 26px; padding: 0; border: 1px solid rgba(255,255,255,.2); border-radius: 4px; background: none; }

/* --- Buttons -------------------------------------------------------------- */
.gp-btn {
  background: #2a2c3e;
  color: #fdf7ff;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  padding: 5px 10px;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.gp-btn:hover:not(:disabled) { background: #343752; }
.gp-btn:disabled { opacity: 0.4; cursor: default; }
.gp-btn.primary { background: #7d9ff0; color: #10131f; border-color: transparent; font-weight: 600; }
.gp-btn.primary-test { background: #ff9ec4; color: #241d2b; border-color: transparent; font-weight: 600; }
.gp-btn.ghost { background: transparent; }
.gp-btn.gp-icon { padding: 5px 9px; }
.gp-btn.tool.active { background: #8fb7ff; color: #10131f; border-color: transparent; }
.gp-btn.gp-dirty { position: relative; }
.gp-btn.gp-dirty::after {
  content: ""; position: absolute; top: -2px; right: -2px;
  width: 8px; height: 8px; border-radius: 50%; background: #ffd166;
}

/* --- Palette -------------------------------------------------------------- */
.gp-palette { padding: 8px 10px; }
.gp-palette-group {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
  color: #9aa0b8; margin: 10px 0 6px;
}
.gp-palette-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
.gp-btn.palette-item { text-align: left; font-size: 12px; }
.gp-btn.palette-item.active { background: #ff9ec4; color: #241d2b; border-color: transparent; }

/* --- Inspector ------------------------------------------------------------ */
.gp-inspector-wrap { padding: 0 10px 10px; }
.gp-section { margin: 14px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #ff9ec4; }
.gp-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 12px; }
.gp-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gp-label { font-size: 11px; color: #9aa0b8; }
.gp-hint { font-size: 12px; color: #9aa0b8; margin: 2px 0 8px; }
.gp-anchor-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #9aa0b8; margin-top: 10px; }
.gp-anchor { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
.gp-anchor-label { min-width: 34px; font-size: 12px; }
.gp-anchor .gp-field { flex-direction: row; align-items: center; }
.gp-anchor .gp-label { min-width: 14px; }
.gp-actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }

/* --- Picker ---------------------------------------------------------------- */
.gp-picker-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: #12131f;
  display: flex; justify-content: center;
  overflow-y: auto;
  padding: 48px 20px 64px;
}
.gp-picker-inner { width: 100%; max-width: 980px; }
.gp-picker-title { margin: 0 0 6px; font-size: 26px; letter-spacing: 0.02em; }
.gp-picker-sub { margin: 0 0 28px; color: #9aa0b8; font-size: 14px; }
.gp-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}
.gp-picker-card {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  background: #1a1b26;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  color: #fdf7ff;
  font: inherit;
}
.gp-picker-card:hover, .gp-picker-card:focus-visible {
  border-color: #8fb7ff;
  background: #1f2030;
  outline: none;
}
.gp-picker-card h2 { margin: 0 0 4px; font-size: 16px; }
.gp-picker-card p { margin: 0 0 10px; color: #9aa0b8; font-size: 12.5px; line-height: 1.4; }
.gp-picker-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; color: #6f7694; }
.gp-picker-badge {
  font-size: 10px; letter-spacing: 0.08em;
  padding: 2px 6px; border-radius: 4px;
  background: rgba(255, 255, 255, 0.08); color: #9aa0b8;
}
.gp-picker-badge.edited { background: rgba(255, 209, 102, 0.16); color: #ffd166; }
.gp-picker-badge.custom { background: rgba(255, 158, 196, 0.16); color: #ff9ec4; }
.gp-picker-badge.draft { background: rgba(139, 183, 255, 0.16); color: #8fb7ff; }
.gp-picker-badge.new { background: rgba(87, 211, 157, 0.16); color: #57d39d; }
.gp-picker-delete { position: absolute; top: 10px; right: 10px; color: #ff6b6b; }

/* --- Status --------------------------------------------------------------- */
.gp-status {
  position: sticky; bottom: 0;
  padding: 5px 10px;
  font-size: 11.5px; color: #9aa0b8;
  background: #1f2030;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
`;

const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);

const viewportElement = document.getElementById('viewport');
const panelElement = document.getElementById('panel');
if (!viewportElement || !panelElement) {
  throw new Error('Expected #viewport and #panel to exist in editor/index.html');
}
const viewportMount = viewportElement;
const panelMount = panelElement;

function startEditor(choice: PickerChoice): void {
  const store = new EditorStore(choice.course, choice.source);
  if (choice.holeIndex > 0) store.selectHole(choice.holeIndex);

  const host = new EditorHost(store, viewportMount, panelMount);

  /** "Open…" in the panel returns to the picker, swapping the working document. */
  host.openPicker = () => {
    host.dispose();
    viewportMount.replaceChildren();
    panelMount.replaceChildren();
    void startPicker();
  };

  host.attach();
  window.addEventListener('pagehide', () => host.dispose(), { once: true });
}

async function startPicker(): Promise<void> {
  const choice = await showCoursePicker();
  startEditor(choice);
}

/** `?course=<id>` deep-links straight into a course; otherwise show the picker. */
const initialCourseId = new URLSearchParams(location.search).get('course');
if (initialCourseId) {
  const resolved = resolveCourse(initialCourseId);
  if (resolved) {
    startEditor({ course: resolved.course, source: resolved.source, holeIndex: 0 });
  } else {
    void startPicker();
  }
} else {
  void startPicker();
}
