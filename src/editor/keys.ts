/**
 * localStorage keys shared between the editor page and the game page.
 *
 * Kept dependency-free so the game's entry point can read the test-drive
 * payload without pulling any editor code into the main bundle.
 */

/** Authored courses that exist only in the editor, keyed by course id. */
export const EDITOR_CUSTOMS_KEY = 'sakura-links/editor-customs';

/** Edits to built-in courses, keyed by course id. */
export const EDITOR_OVERRIDES_KEY = 'sakura-links/editor-overrides';

/** Autosaved working document (one per session). */
export const EDITOR_DRAFT_KEY = 'sakura-links/editor-draft';

/** Payload handed to the game page for a live test drive. */
export const EDITOR_TESTDRIVE_KEY = 'sakura-links/editor-testdrive';
