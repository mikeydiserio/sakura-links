import { COURSES } from '../course';
import type { CourseDef } from '../course/types';
import { createBlankCourse } from './documents';
import type { EditorState } from './EditorStore';
import {
  hasBuiltinOverride,
  isCourseDef,
  listCustomCourses,
  readDraft,
  removeCustomCourse,
  resolveCourse,
} from './persistence';

/**
 * Full-screen course chooser shown before the editor boots. Lists every map the
 * player can see (built-ins + saved customs), a "continue editing" draft card,
 * and a "new course" tile. Resolves with the chosen working document.
 */

export interface PickerChoice {
  course: CourseDef;
  source: EditorState['courseSource'];
  holeIndex: number;
}

interface CardOptions {
  title: string;
  subtitle: string;
  meta: string;
  badge?: string;
  badgeClass?: string;
  onPick: () => void;
}

function card(options: CardOptions): HTMLElement {
  const el = document.createElement('div');
  el.className = 'gp-picker-card';
  el.tabIndex = 0;

  const title = document.createElement('h2');
  title.textContent = options.title;
  el.appendChild(title);

  const sub = document.createElement('p');
  sub.textContent = options.subtitle;
  el.appendChild(sub);

  const meta = document.createElement('div');
  meta.className = 'gp-picker-meta';
  const metaText = document.createElement('span');
  metaText.textContent = options.meta;
  meta.appendChild(metaText);
  if (options.badge) {
    const badge = document.createElement('span');
    badge.className = `gp-picker-badge${options.badgeClass ? ` ${options.badgeClass}` : ''}`;
    badge.textContent = options.badge;
    meta.appendChild(badge);
  }
  el.appendChild(meta);

  el.addEventListener('click', options.pick);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      options.pick();
    }
  });
  return el;
}

/**
 * Full-screen overlay listing all editable maps. Resolves via the returned
 * promise when a card is activated, then removes itself from the DOM.
 */
export function showCoursePicker(): Promise<PickerChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'gp-picker-overlay';

    const inner = document.createElement('div');
    inner.className = 'gp-picker-inner';

    const title = document.createElement('h1');
    title.className = 'gp-picker-title';
    title.textContent = 'Sakura Links — Level Editor';
    inner.appendChild(title);

    const sub = document.createElement('p');
    sub.className = 'gp-picker-sub';
    sub.textContent = 'Pick a course to edit, or start a new one. Your open course is autosaved.';
    inner.appendChild(sub);

    const grid = document.createElement('div');
    grid.className = 'gp-picker-grid';
    inner.appendChild(grid);

    const render = (): void => {
      grid.replaceChildren();

      const draft = readDraft();
      if (draft && isCourseDef(draft.course)) {
        const course = draft.course;
        grid.appendChild(
          card({
            title: `Continue: ${course.name}`,
            subtitle: course.tagline ?? '',
            meta: `Autosaved draft · ${course.holes.length} hole${course.holes.length === 1 ? '' : 's'}`,
            badge: 'DRAFT',
            badgeClass: 'draft',
            pick: () =>
              finish({
                course,
                source: draft.source ?? 'new',
                holeIndex: draft.holeIndex ?? 0,
              }),
          }),
        );
      }

      for (const course of COURSES) {
        const resolved = resolveCourse(course.id);
        if (!resolved) continue;
        const edited = hasBuiltinOverride(course.id);
        grid.appendChild(
          card({
            title: course.name,
            subtitle: course.tagline ?? '',
            meta: `${resolved.course.holes.length} hole${resolved.course.holes.length === 1 ? '' : 's'} · ${course.theme}`,
            badge: edited ? 'EDITED' : 'BUILT-IN',
            badgeClass: edited ? 'edited' : '',
            pick: () => finish({ ...resolved, holeIndex: 0 }),
          }),
        );
      }

      for (const course of listCustomCourses()) {
        const item = card({
          title: course.name,
          subtitle: course.tagline ?? '',
          meta: `${course.holes.length} hole${course.holes.length === 1 ? '' : 's'} · ${course.theme}`,
          badge: 'CUSTOM',
          badgeClass: 'custom',
          pick: () => finish({ course, source: 'custom', holeIndex: 0 }),
        });
        const del = document.createElement('button');
        del.className = 'gp-btn gp-icon gp-picker-delete';
        del.type = 'button';
        del.title = 'Delete this course';
        del.textContent = '×';
        del.addEventListener('click', (event) => {
          event.stopPropagation();
          removeCustomCourse(course.id);
          render();
        });
        item.appendChild(del);
        grid.appendChild(item);
      }

      grid.appendChild(
        card({
          title: 'New course',
          subtitle: 'Start from a single blank hole.',
          meta: 'Your blank editor',
          badge: 'NEW',
          badgeClass: 'new',
          pick: () => finish({ course: createBlankCourse(), source: 'new', holeIndex: 0 }),
        }),
      );
    };

    const finish = (choice: PickerChoice): void => {
      overlay.remove();
      resolve(choice);
    };

    render();
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
  });
}