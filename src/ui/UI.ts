import './ui.css';
import { Emitter } from '../core/Events';
import { COURSES, isCourseUnlocked, coursePar } from '../course';
import { THEMES } from '../render/Palette';
import type { CourseDef } from '../course/types';
import type { SaveStore, SettingsData } from '../core/Storage';
import { formatToPar, formatTime, clamp01 } from '../util/math';
import type { RoomState } from '../multiplayer/RoomSync';

/**
 * All interface state, as DOM.
 *
 * The UI never reads game state directly — `Game` pushes what it needs through
 * the small typed API below and listens for intents on `events`. That keeps the
 * simulation testable without a document and stops UI code from creeping into
 * the frame loop.
 */
export interface UIEvents {
  play: void;
  selectCourse: { courseId: string };
  resume: void;
  restartHole: void;
  quitToMenu: void;
  nextHole: void;
  replayCourse: void;
  openSettings: void;
  closeSettings: void;
  openCourseSelect: void;
  openMultiplayer: void;
  createRoom: { name: string; color: string };
  joinRoom: { roomCode: string; name: string; color: string };
  startMultiplayer: void;
  back: void;
  settingsChanged: Partial<SettingsData>;
  skipIntro: void;
  /** Open the level editor (own page at /editor/). */
  openEditor: void;
  /** Pointer entered an interactive element — drives the UI hover sound. */
  hover: void;
}

export type ScreenName =
  | 'none'
  | 'mainMenu'
  | 'courseSelect'
  | 'multiplayerLobby'
  | 'pause'
  | 'settings'
  | 'scorecard'
  | 'courseComplete';

interface HudState {
  courseName: string;
  holeName: string;
  holeNumber: number;
  holeCount: number;
  par: number;
  strokes: number;
  /** Every stroke played this round, including the hole in progress. */
  totalStrokes: number;
  /** Strokes and par for finished holes only — what "to par" is measured on. */
  completedStrokes: number;
  completedPar: number;
}

export class UI {
  readonly events = new Emitter<UIEvents>();

  private readonly root: HTMLElement;
  private screens = new Map<ScreenName, HTMLElement>();
  private current: ScreenName = 'none';
  private previousScreen: ScreenName = 'mainMenu';

  private hud!: HTMLElement;
  private powerBar!: HTMLElement;
  private powerFill!: HTMLElement;
  private multiplayerNameInput!: HTMLInputElement;
  private multiplayerColorInput!: HTMLInputElement;
  private multiplayerCodeInput!: HTMLInputElement;
  private multiplayerStatus!: HTMLElement;
  private multiplayerRoster!: HTMLElement;
  private multiplayerActions!: HTMLElement;
  private holeCard!: HTMLElement;
  private toast!: HTMLElement;
  private debug!: HTMLElement;
  private controlsHint!: HTMLElement;
  private loading!: HTMLElement;

  private hudFields: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  private cardTimer = 0;

  constructor(
    container: HTMLElement,
    private readonly save: SaveStore,
  ) {
    this.root = container;
    this.buildLoading();
    this.buildHud();
    this.buildMainMenu();
    this.buildMultiplayerLobby();
    this.buildCourseSelect();
    this.buildPause();
    this.buildSettings();
    this.buildScorecard();
    this.buildCourseComplete();
    this.buildOverlays();
  }

  // --- Construction ---------------------------------------------------------

  private el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    html?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = this.el('button', `btn ${className}`, label);
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    // Hover feedback is emitted so the audio layer can respond without the UI
    // knowing anything about sound.
    button.addEventListener('pointerenter', () => this.events.emit('hover', undefined));
    return button;
  }

  private screen(name: ScreenName, dim = true): HTMLElement {
    const node = this.el('div', `screen${dim ? ' dim' : ''}`);
    node.dataset.screen = name;
    this.root.appendChild(node);
    this.screens.set(name, node);
    return node;
  }

  private buildLoading(): void {
    this.loading = this.el('div');
    this.loading.id = 'loading';
    this.loading.appendChild(this.el('div', 'spinner'));
    this.loading.appendChild(this.el('div', 'loading-text', 'Growing the fairways'));
    this.root.appendChild(this.loading);
  }

  private buildMainMenu(): void {
    const screen = this.screen('mainMenu');

    const title = this.el('div', 'title-block');
    title.appendChild(this.el('h1', 'title', 'Sakura<br>Links'));
    title.appendChild(this.el('p', 'title-sub', 'Miniature Golf'));
    screen.appendChild(title);

    const menu = this.el('div', 'menu');
    menu.appendChild(
      this.button('Play', 'primary', () => {
        this.events.emit('play', undefined);
      }),
    );
    menu.appendChild(
      this.button('Multiplayer', 'ghost', () => {
        this.previousScreen = 'mainMenu';
        this.events.emit('openMultiplayer', undefined);
      }),
    );
    menu.appendChild(
      this.button('Course Select', 'ghost', () => {
        this.events.emit('openCourseSelect', undefined);
      }),
    );
    menu.appendChild(
      this.button('Settings', 'ghost', () => {
        this.previousScreen = 'mainMenu';
        this.events.emit('openSettings', undefined);
      }),
    );
    menu.appendChild(
      this.button('Level Editor', 'ghost', () => {
        this.events.emit('openEditor', undefined);
      }),
    );
    screen.appendChild(menu);

    const stats = this.el(
      'p',
      'title-sub menu-stats',
      `${this.save.raw.totalHolesPlayed} holes played · ${this.save.raw.holesInOne} aces`,
    );
    screen.appendChild(stats);
  }

  private buildMultiplayerLobby(): void {
    const screen = this.screen('multiplayerLobby');

    const panel = this.el('div', 'panel');
    panel.appendChild(this.el('h2', '', 'Multiplayer Lobby'));
    panel.appendChild(this.el('p', 'sub', 'Create a room or join a room code'));

    // Labels are explicitly associated (`for`/`id`), same as the Settings
    // sliders below — these three rows use the identical `.setting` layout
    // but were previously missing that wiring, so a screen reader announced
    // an unlabelled text field.
    const nameRow = this.el('div', 'setting');
    const nameLabel = this.el('label', '', 'Player Name');
    nameLabel.htmlFor = 'multiplayer-name';
    nameRow.appendChild(nameLabel);
    this.multiplayerNameInput = this.el('input');
    this.multiplayerNameInput.id = 'multiplayer-name';
    this.multiplayerNameInput.type = 'text';
    this.multiplayerNameInput.value = 'Player';
    this.multiplayerNameInput.maxLength = 20;
    nameRow.appendChild(this.multiplayerNameInput);
    panel.appendChild(nameRow);

    const colorRow = this.el('div', 'setting');
    const colorLabel = this.el('label', '', 'Ball Colour');
    colorLabel.htmlFor = 'multiplayer-color';
    colorRow.appendChild(colorLabel);
    this.multiplayerColorInput = this.el('input');
    this.multiplayerColorInput.id = 'multiplayer-color';
    this.multiplayerColorInput.type = 'color';
    this.multiplayerColorInput.value = '#ff9ec4';
    colorRow.appendChild(this.multiplayerColorInput);
    panel.appendChild(colorRow);

    const codeRow = this.el('div', 'setting');
    const codeLabel = this.el('label', '', 'Room Code');
    codeLabel.htmlFor = 'multiplayer-code';
    codeRow.appendChild(codeLabel);
    this.multiplayerCodeInput = this.el('input');
    this.multiplayerCodeInput.id = 'multiplayer-code';
    this.multiplayerCodeInput.type = 'text';
    this.multiplayerCodeInput.placeholder = 'ABCD1';
    this.multiplayerCodeInput.maxLength = 5;
    codeRow.appendChild(this.multiplayerCodeInput);
    panel.appendChild(codeRow);

    const actions = this.el('div', 'actions');
    actions.appendChild(
      this.button('Create Room', 'primary', () => {
        this.events.emit('createRoom', {
          name: this.multiplayerNameInput.value.trim() || 'Player',
          color: this.multiplayerColorInput.value,
        });
      }),
    );
    actions.appendChild(
      this.button('Join Room', 'ghost', () => {
        this.events.emit('joinRoom', {
          roomCode: this.multiplayerCodeInput.value.trim().toUpperCase(),
          name: this.multiplayerNameInput.value.trim() || 'Player',
          color: this.multiplayerColorInput.value,
        });
      }),
    );
    panel.appendChild(actions);

    this.multiplayerStatus = this.el('div', 'sub multiplayer-status');
    this.multiplayerStatus.textContent = 'No room yet';
    panel.appendChild(this.multiplayerStatus);

    this.multiplayerRoster = this.el('div', 'multiplayer-roster');
    panel.appendChild(this.multiplayerRoster);

    this.multiplayerActions = this.el('div', 'actions multiplayer-actions');
    this.multiplayerActions.appendChild(
      this.button('Back', 'ghost', () => {
        this.events.emit('back', undefined);
      }),
    );
    panel.appendChild(this.multiplayerActions);

    screen.appendChild(panel);
  }

  private buildCourseSelect(): void {
    const screen = this.screen('courseSelect');

    const title = this.el('div', 'title-block');
    title.appendChild(this.el('h1', 'title', 'Courses'));
    title.appendChild(this.el('p', 'title-sub', 'Choose your round'));
    screen.appendChild(title);

    const row = this.el('div', 'card-row');
    row.id = 'course-cards';
    screen.appendChild(row);

    const back = this.el('div', 'menu back-menu');
    back.appendChild(
      this.button('Back', 'ghost small', () => {
        this.events.emit('back', undefined);
      }),
    );
    screen.appendChild(back);
  }

  /** Rebuilt on every visit so lock state and best scores are always current. */
  refreshCourseCards(): void {
    const row = document.getElementById('course-cards');
    if (!row) return;
    row.innerHTML = '';

    for (const course of COURSES) {
      const unlocked = isCourseUnlocked(course, this.save);
      const record = this.save.course(course.id);
      const theme = THEMES[course.theme];

      const card = this.el('div', `course-card${unlocked ? '' : ' locked'}`);

      const art = this.el('div', 'course-art');
      // The card art is the theme's own sky gradient — the palette doing double
      // duty as UI, so the menu always matches what the course looks like.
      art.style.background = `linear-gradient(165deg, #${theme.skyTop.toString(16).padStart(6, '0')}, #${theme.skyMid
        .toString(16)
        .padStart(6, '0')} 55%, #${theme.skyBottom.toString(16).padStart(6, '0')})`;
      if (!unlocked) {
        const badge = this.el('div', 'lock-badge', 'Locked');
        art.appendChild(badge);
      }
      card.appendChild(art);

      const body = this.el('div', 'course-body');
      body.appendChild(this.el('h3', 'course-name', course.name));
      body.appendChild(this.el('p', 'course-tag', course.tagline));

      const best = Number.isFinite(record.bestTotal) ? String(record.bestTotal) : '—';
      const time = Number.isFinite(record.bestTime) ? formatTime(record.bestTime) : '—';
      const stats = this.el(
        'div',
        'course-stats',
        `<div>Holes<b>${course.holes.length}</b></div>` +
          `<div>Par<b>${coursePar(course)}</b></div>` +
          `<div>Best<b>${best}</b></div>` +
          `<div>Time<b>${time}</b></div>`,
      );
      body.appendChild(stats);
      card.appendChild(body);

      if (unlocked) {
        // A `div` with only a click handler is invisible to keyboard and
        // switch-access users even though it visually reads as a button —
        // role/tabindex/keydown make it behave like the control it looks like.
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Play ${course.name}`);
        const activate = (): void => this.events.emit('selectCourse', { courseId: course.id });
        card.addEventListener('click', activate);
        card.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          activate();
        });
      } else {
        card.setAttribute('aria-disabled', 'true');
        const requirement = COURSES.find((c) => c.id === course.requires);
        const tag = card.querySelector('.course-tag');
        if (tag && requirement) tag.textContent = `Complete ${requirement.name} to unlock.`;
      }

      row.appendChild(card);
    }
  }

  setMultiplayerLobby(room: RoomState | null, localPlayerId: string | null): void {
    if (!this.multiplayerStatus || !this.multiplayerRoster || !this.multiplayerActions) return;

    if (!room) {
      this.multiplayerStatus.innerHTML = '<strong>No room yet</strong><br>Create a room to start a quick match.';
      this.multiplayerRoster.innerHTML = '';
      this.multiplayerActions.replaceChildren(
        this.button('Back', 'ghost', () => this.events.emit('back', undefined)),
      );
      return;
    }

    const players = room.players
      .map((player) => {
        const marker = player.id === localPlayerId ? ' (you)' : '';
        const host = player.isHost ? ' · host' : '';
        // `--dot-color` is the one legitimately dynamic value (per-player);
        // everything else about the row lives in `.roster-row` in ui.css so
        // this list shares the panel's design language instead of hand-rolling
        // its own inline layout.
        return `<div class="roster-row"><span>${player.name}${marker}${host}</span><span class="roster-dot" style="--dot-color:${player.color}">●</span></div>`;
      })
      .join('');

    this.multiplayerStatus.innerHTML = `<strong>Room ${room.code}</strong><br>${room.players.length}/4 players · ${UI.roomStatusLabel(room.status)}`;
    this.multiplayerRoster.innerHTML = players;

    const buttons: HTMLButtonElement[] = [];
    if (room.hostId === localPlayerId) {
      buttons.push(this.button('Start Match', 'primary', () => this.events.emit('startMultiplayer', undefined)));
    }
    buttons.push(this.button('Back', 'ghost', () => this.events.emit('back', undefined)));
    this.multiplayerActions.replaceChildren(...buttons);
  }

  private buildPause(): void {
    const screen = this.screen('pause');
    const panel = this.el('div', 'panel');
    panel.appendChild(this.el('h2', '', 'Paused'));
    panel.appendChild(this.el('p', 'sub', 'Take your time'));

    const menu = this.el('div', 'menu full-width');
    menu.appendChild(this.button('Resume', 'primary', () => this.events.emit('resume', undefined)));
    menu.appendChild(
      this.button('Restart Hole', 'ghost', () => this.events.emit('restartHole', undefined)),
    );
    menu.appendChild(
      this.button('Settings', 'ghost', () => {
        this.previousScreen = 'pause';
        this.events.emit('openSettings', undefined);
      }),
    );
    menu.appendChild(
      this.button('Quit to Menu', 'ghost', () => this.events.emit('quitToMenu', undefined)),
    );
    panel.appendChild(menu);
    screen.appendChild(panel);
  }

  private buildSettings(): void {
    const screen = this.screen('settings');
    const panel = this.el('div', 'panel');
    panel.appendChild(this.el('h2', '', 'Settings'));
    panel.appendChild(this.el('p', 'sub', 'Tune the experience'));

    const settings = this.save.settings;

    const slider = (
      label: string,
      key: keyof SettingsData,
      min: number,
      max: number,
      step: number,
    ): void => {
      const row = this.el('div', 'setting');
      // Explicitly associate the label so the control is reachable by name from
      // a screen reader, and so clicking the text focuses the slider.
      const labelEl = this.el('label', '', label);
      labelEl.htmlFor = `setting-${key}`;
      row.appendChild(labelEl);
      const input = this.el('input');
      input.id = `setting-${key}`;
      input.name = String(key);
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(settings[key]);
      input.setAttribute('aria-label', label);
      input.addEventListener('input', () => {
        this.events.emit('settingsChanged', { [key]: Number(input.value) } as Partial<SettingsData>);
      });
      row.appendChild(input);
      panel.appendChild(row);
    };

    const toggle = (label: string, key: keyof SettingsData): void => {
      const row = this.el('div', 'setting');
      const labelEl = this.el('label', '', label);
      labelEl.htmlFor = `setting-${key}`;
      row.appendChild(labelEl);
      const input = this.el('input');
      input.id = `setting-${key}`;
      input.name = String(key);
      input.type = 'checkbox';
      input.checked = Boolean(settings[key]);
      input.setAttribute('aria-label', label);
      input.addEventListener('change', () => {
        this.events.emit('settingsChanged', { [key]: input.checked } as Partial<SettingsData>);
      });
      row.appendChild(input);
      panel.appendChild(row);
    };

    slider('Master Volume', 'masterVolume', 0, 1, 0.01);
    slider('Music', 'musicVolume', 0, 1, 0.01);
    slider('Sound Effects', 'sfxVolume', 0, 1, 0.01);
    slider('Screen Shake', 'screenShake', 0, 1.5, 0.05);

    const qualityRow = this.el('div', 'setting');
    const qualityLabel = this.el('label', '', 'Quality');
    qualityLabel.htmlFor = 'setting-quality';
    qualityRow.appendChild(qualityLabel);
    const select = this.el('select');
    select.id = 'setting-quality';
    select.name = 'quality';
    select.setAttribute('aria-label', 'Quality');
    for (const value of ['low', 'medium', 'high'] as const) {
      const option = this.el('option', '', value[0].toUpperCase() + value.slice(1));
      option.value = value;
      if (settings.quality === value) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      this.events.emit('settingsChanged', { quality: select.value as SettingsData['quality'] });
    });
    qualityRow.appendChild(select);
    panel.appendChild(qualityRow);

    toggle('Bloom', 'bloom');
    toggle('Ink Outlines', 'outlines');
    // The overlay this drives (see Game.updateDebug) shows draw calls,
    // triangle count, pixel ratio and physics body count alongside the frame
    // rate — "Show FPS" undersold what actually gets switched on.
    toggle('Debug Overlay', 'showFps');

    const actions = this.el('div', 'actions settings-actions');
    actions.appendChild(this.button('Done', 'primary', () => this.events.emit('closeSettings', undefined)));
    panel.appendChild(actions);

    screen.appendChild(panel);
  }

  private buildScorecard(): void {
    const screen = this.screen('scorecard');
    const panel = this.el('div', 'panel');
    panel.id = 'scorecard-panel';
    screen.appendChild(panel);
  }

  private buildCourseComplete(): void {
    const screen = this.screen('courseComplete');
    const panel = this.el('div', 'panel');
    panel.id = 'complete-panel';
    screen.appendChild(panel);
  }

  private buildHud(): void {
    this.hud = this.el('div');
    this.hud.id = 'hud';

    const left = this.el('div', 'hud-panel hud-hole');
    const title = this.el('div', 'hud-title');
    const name = this.el('div', 'name', 'Hole');
    const course = this.el('div', 'course', 'Course');
    title.append(name, course);
    left.appendChild(title);

    const stat = (label: string): HTMLElement => {
      const wrapper = this.el('div', 'hud-stat');
      wrapper.appendChild(this.el('span', 'label', label));
      const value = this.el('span', 'value', '0');
      wrapper.appendChild(value);
      left.appendChild(wrapper);
      return value;
    };

    this.hudFields.name = name;
    this.hudFields.course = course;
    this.hudFields.hole = stat('Hole');
    this.hudFields.par = stat('Par');
    this.hudFields.strokes = stat('Strokes');
    this.hud.appendChild(left);

    const right = this.el('div', 'hud-panel hud-total');
    const totalWrap = this.el('div', 'hud-stat');
    totalWrap.appendChild(this.el('span', 'label', 'Total'));
    const total = this.el('span', 'value', '0');
    totalWrap.appendChild(total);
    right.appendChild(totalWrap);

    const parWrap = this.el('div', 'hud-stat');
    parWrap.appendChild(this.el('span', 'label', 'To Par'));
    const toPar = this.el('span', 'value', 'E');
    parWrap.appendChild(toPar);
    right.appendChild(parWrap);

    this.hudFields.total = total;
    this.hudFields.toPar = toPar;
    this.hud.appendChild(right);

    // Power meter.
    this.powerBar = this.el('div', 'power');
    const track = this.el('div', 'power-track');
    this.powerFill = this.el('div', 'power-fill');
    track.appendChild(this.powerFill);
    const ticks = this.el('div', 'power-ticks', '<span></span><span></span><span></span>');
    track.appendChild(ticks);
    this.powerBar.appendChild(track);
    this.powerBar.appendChild(this.el('div', 'power-label', 'Release to swing'));
    this.hud.appendChild(this.powerBar);

    // Cross-checked against Input.ts and Game.handleGlobalInput: every binding
    // named here is real. `T` (toggle top-down camera) was a working control
    // with no hint at all until this pass.
    this.controlsHint = this.el(
      'div',
      'controls-hint',
      '<div><kbd>Move</kbd> aim &nbsp; <kbd>Hold</kbd> charge &nbsp; <kbd>Release</kbd> swing</div>' +
        '<div><kbd>RMB</kbd> orbit &nbsp; <kbd>Wheel</kbd> zoom &nbsp; <kbd>C</kbd> recentre &nbsp; <kbd>T</kbd> top-down &nbsp; <kbd>R</kbd> restart &nbsp; <kbd>Esc</kbd> pause</div>',
    );
    this.hud.appendChild(this.controlsHint);

    this.root.appendChild(this.hud);
  }

  private buildOverlays(): void {
    this.holeCard = this.el('div', 'hole-card');
    this.root.appendChild(this.holeCard);

    this.toast = this.el('div', 'toast');
    this.root.appendChild(this.toast);

    this.debug = this.el('div', 'debug');
    this.root.appendChild(this.debug);
  }

  // --- Public API -----------------------------------------------------------

  hideLoading(): void {
    this.loading.classList.add('done');
  }

  show(screen: ScreenName): void {
    for (const [name, node] of this.screens) node.classList.toggle('active', name === screen);
    this.current = screen;
    if (screen === 'courseSelect') this.refreshCourseCards();
  }

  get activeScreen(): ScreenName {
    return this.current;
  }

  get lastScreen(): ScreenName {
    return this.previousScreen;
  }

  setHudVisible(visible: boolean): void {
    this.hud.classList.toggle('active', visible);
    // `opacity: 0` (the transition ui.css uses for `.active`) does not remove
    // a node from the accessibility tree, so a "hidden" HUD kept announcing
    // stale hole/stroke numbers to screen readers while a menu sat on top of
    // it. `aria-hidden` plus the matching `visibility` toggle in ui.css closes
    // that gap the same way `.screen` already does for every other panel.
    this.hud.setAttribute('aria-hidden', String(!visible));
  }

  updateHud(state: HudState): void {
    this.hudFields.name.textContent = state.holeName;
    this.hudFields.course.textContent = state.courseName;
    this.hudFields.hole.textContent = `${state.holeNumber}/${state.holeCount}`;
    this.hudFields.par.textContent = String(state.par);
    this.hudFields.strokes.textContent = String(state.strokes);
    this.hudFields.total.textContent = String(state.totalStrokes);

    const relative = state.completedStrokes - state.completedPar;
    const label = formatToPar(state.completedStrokes, state.completedPar);
    this.hudFields.toPar.textContent = label;
    this.hudFields.toPar.className = `value ${relative < 0 ? 'under' : relative > 0 ? 'over' : ''}`;
  }

  setPower(charge: number, charging: boolean): void {
    this.powerBar.classList.toggle('active', charging);
    this.powerFill.style.width = `${clamp01(charge) * 100}%`;
  }

  showHoleCard(holeNumber: number, name: string, par: number, hint: string): void {
    this.holeCard.innerHTML =
      `<div class="eyebrow">Hole ${holeNumber}</div>` +
      `<div class="name">${name}</div>` +
      `<div class="par">Par ${par}</div>` +
      `<div class="hint">${hint}</div>` +
      `<div class="skip">Click or press Space to begin</div>`;
    this.holeCard.classList.add('active');
    window.clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => this.hideHoleCard(), 3600);
  }

  hideHoleCard(): void {
    this.holeCard.classList.remove('active');
    window.clearTimeout(this.cardTimer);
  }

  showToast(main: string, sub = '', duration = 1900): void {
    this.toast.innerHTML = `${main}${sub ? `<span class="sub">${sub}</span>` : ''}`;
    this.toast.classList.add('active');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('active'), duration);
  }

  /** Hole-complete panel with the running scorecard. */
  showScorecard(
    course: CourseDef,
    holeIndex: number,
    scores: number[],
    isLast: boolean,
    strokes: number,
    par: number,
  ): void {
    const panel = document.getElementById('scorecard-panel');
    if (!panel) return;

    const verdict = UI.golfVerdict(strokes, par);

    panel.innerHTML = `<h2>${verdict}</h2><p class="sub">${course.holes[holeIndex].name}</p>`;
    panel.appendChild(this.scoreTable(course, scores, holeIndex));

    const actions = this.el('div', 'actions');
    actions.appendChild(
      this.button(isLast ? 'Finish Round' : 'Next Hole', 'primary', () =>
        this.events.emit('nextHole', undefined),
      ),
    );
    actions.appendChild(
      this.button('Replay', 'ghost', () => this.events.emit('restartHole', undefined)),
    );
    panel.appendChild(actions);
  }

  showCourseComplete(course: CourseDef, scores: number[], seconds: number, isRecord: boolean): void {
    const panel = document.getElementById('complete-panel');
    if (!panel) return;

    const total = scores.reduce((a, b) => a + b, 0);
    const par = coursePar(course);

    panel.innerHTML =
      `<h2>${course.name} Complete</h2>` +
      `<p class="sub">${formatToPar(total, par)} · ${formatTime(seconds)}${isRecord ? ' · New Record' : ''}</p>`;
    panel.appendChild(this.scoreTable(course, scores, -1));

    const nextIndex = COURSES.findIndex((c) => c.id === course.id) + 1;
    const next = COURSES[nextIndex];
    if (!next) panel.appendChild(this.el('p', 'sub', 'All courses complete — thanks for playing!'));

    const actions = this.el('div', 'actions');
    if (next) {
      actions.appendChild(
        this.button(`Play ${next.name}`, 'primary', () =>
          this.events.emit('selectCourse', { courseId: next.id }),
        ),
      );
    }
    actions.appendChild(
      this.button('Replay', 'ghost', () => this.events.emit('replayCourse', undefined)),
    );
    actions.appendChild(
      this.button('Menu', 'ghost', () => this.events.emit('quitToMenu', undefined)),
    );
    panel.appendChild(actions);
  }

  /**
   * Standard scorecard terminology for a finished hole.
   *
   * The previous version called *every* score worse than bogey "Double
   * Bogey" — an 11 on a par 2 read the same as a 5. There is no common
   * casual-play name past triple bogey, so anything worse than that degrades
   * to a plain relative score instead of inventing a term.
   */
  private static golfVerdict(strokes: number, par: number): string {
    if (strokes === 1) return 'Hole in One!';
    const relative = strokes - par;
    if (relative <= -3) return 'Albatross';
    if (relative === -2) return 'Eagle';
    if (relative === -1) return 'Birdie';
    if (relative === 0) return 'Par';
    if (relative === 1) return 'Bogey';
    if (relative === 2) return 'Double Bogey';
    if (relative === 3) return 'Triple Bogey';
    return `${relative} Over Par`;
  }

  /** Human label for the raw `RoomStatus` enum, kept out of player-facing copy. */
  private static roomStatusLabel(status: RoomState['status']): string {
    switch (status) {
      case 'lobby':
        return 'Waiting for players';
      case 'playing':
        return 'Match in progress';
      case 'finished':
        return 'Match finished';
      default:
        return status;
    }
  }

  private scoreTable(course: CourseDef, scores: number[], currentIndex: number): HTMLElement {
    const table = this.el('table', 'score-table');
    let body = '';
    let total = 0;
    let parTotal = 0;

    course.holes.forEach((hole, index) => {
      const score = scores[index];
      const played = score !== undefined && score > 0;
      if (played) total += score;
      parTotal += hole.par;
      const relative = played ? score - hole.par : 0;
      const cls = !played ? '' : relative < 0 ? 'under' : relative > 0 ? 'over' : '';
      body +=
        `<tr class="${index === currentIndex ? 'current' : ''}">` +
        `<td>${index + 1}. ${hole.name}</td>` +
        `<td>${hole.par}</td>` +
        `<td class="${cls}">${played ? score : '—'}</td>` +
        `</tr>`;
    });

    table.innerHTML =
      '<thead><tr><th>Hole</th><th>Par</th><th>Score</th></tr></thead>' +
      `<tbody>${body}</tbody>` +
      `<tfoot><tr><td>Total</td><td>${parTotal}</td><td>${total || '—'}</td></tr></tfoot>`;
    return table;
  }

  setDebug(visible: boolean, text = ''): void {
    this.debug.classList.toggle('active', visible);
    if (visible) this.debug.innerHTML = text;
  }

  /** Recolours the entire interface to match the active course. */
  applyTheme(accent: number, accentAlt: number, ink: number): void {
    const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
    const style = document.documentElement.style;
    style.setProperty('--ui-accent', hex(accent));
    style.setProperty('--ui-accent-alt', hex(accentAlt));
    style.setProperty('--ui-ink', hex(ink));
  }

  setControlsHintVisible(visible: boolean): void {
    // Class-based, like every other show/hide toggle in this file — the raw
    // `style.display` write this replaced was the only one of its kind.
    this.controlsHint.classList.toggle('hidden', !visible);
  }
}
