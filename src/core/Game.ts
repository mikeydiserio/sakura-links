import * as THREE from 'three';
import GUI from 'lil-gui';

import { Renderer } from '../render/Renderer';
import { applyThemeToMaterials, SharedCelUniforms } from '../render/CelMaterial';
import { THEMES } from '../render/Palette';
import type { Theme, ThemeId } from '../render/Palette';

import { Sky } from '../world/Sky';
import { Environment } from '../world/Environment';
import { Ambience } from '../world/Ambience';

import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CameraRig } from '../gameplay/CameraRig';
import { HoleRuntime } from '../gameplay/HoleRuntime';
import { ParticleSystem } from '../fx/ParticleSystem';
import { Juice } from '../fx/Juice';

import { AudioEngine } from '../audio/AudioEngine';
import { Sfx } from '../audio/Sfx';
import { Music } from '../audio/Music';

import { UI } from '../ui/UI';
import { Input } from './Input';
import { SaveStore } from './Storage';
import type { SettingsData } from './Storage';
import { COURSES, courseById } from '../course';
import type { CourseDef } from '../course/types';
import { clamp, formatToPar } from '../util/math';
import { RoomSync, type RoomPlayer, type RoomState } from '../multiplayer/RoomSync';

/**
 * Top-level orchestrator: owns the scene, the frame loop and the state machine
 * that moves between menus and play.
 *
 * ### Frame order
 * ```
 * input ─► juice (returns time scale) ─► hole logic + physics ─►
 * world animation ─► particles ─► audio follow ─► render ─► input.endFrame()
 * ```
 * Time scale is applied once, before anything consumes `dt`, so hit-stop slows
 * physics, animation and particles together rather than desynchronising them.
 */
type AppState =
  | 'menu'
  | 'courseSelect'
  | 'multiplayerLobby'
  | 'playing'
  | 'paused'
  | 'settings'
  | 'scorecard'
  | 'complete';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly clock = new THREE.Clock();

  private readonly camera: CameraRig;
  private readonly renderer: Renderer;
  private readonly physics = new PhysicsWorld();
  private readonly sky = new Sky();
  private readonly environment = new Environment();
  private readonly ambience = new Ambience();
  private readonly particles = new ParticleSystem();
  private readonly juice: Juice;
  private readonly runtime: HoleRuntime;

  private readonly audio = new AudioEngine();
  private readonly sfx: Sfx;
  private readonly music: Music;

  private readonly save = new SaveStore();
  private readonly input: Input;
  private readonly ui: UI;
  private readonly roomSync = new RoomSync();

  private state: AppState = 'menu';
  private course: CourseDef = COURSES[0];
  private theme: Theme = THEMES.sakura;
  private holeIndex = 0;
  private scores: number[] = [];
  private roundStart = 0;
  private running = false;
  private frameHandle = 0;
  private multiplayerLocalPlayerId = 'local-player';
  private multiplayerRoom: RoomState | null = null;
  /** Course the current multiplayer match was started on. */
  multiplayerCourseId: string | null = null;

  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private fps = 60;
  private gui: GUI | null = null;
  private windTimer = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.camera = new CameraRig(window.innerWidth / window.innerHeight);
    this.renderer = new Renderer(canvas, this.scene, this.camera.camera, this.save.settings);
    this.juice = new Juice(this.renderer.grade);
    this.runtime = new HoleRuntime(this.physics, this.camera, this.particles, this.juice, this.theme);

    this.sfx = new Sfx(this.audio);
    this.music = new Music(this.audio);

    this.input = new Input(canvas);
    this.ui = new UI(uiRoot, this.save);

    this.roomSync.onRoomChange((room) => {
      this.multiplayerRoom = room;
      this.ui.setMultiplayerLobby(room, this.multiplayerLocalPlayerId);
      if (room?.status === 'playing') {
        this.runtime.setMultiplayerPlayers(room.players);
        if (room.currentTurnPlayerId) {
          this.runtime.setActiveMultiplayerPlayer(room.currentTurnPlayerId);
        }
      }
    });

    this.scene.add(
      this.sky.mesh,
      this.environment.group,
      this.ambience.group,
      this.particles.group,
      this.runtime.group,
    );

    this.wireUi();
    this.wireGameplay();
    this.applySettings(this.save.settings);
    this.applyTheme('sakura');

    window.addEventListener('resize', this.onResize);
    // The audio context cannot start without a gesture; the first one unlocks it.
    const unlock = (): void => {
      void this.audio.unlock().then(() => {
        this.music.setTheme(this.theme.id);
        this.music.start();
      });
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    if (import.meta.env.DEV) {
      this.buildDebugGui();
      // Handle for console inspection during development.
      (window as unknown as { __game: Game }).__game = this;
      // Dynamically imported so the harness is code-split out of production.
      void import('../dev/Playtest').then(({ playtestAll, formatSummary }) => {
        (window as unknown as { __playtest: () => string }).__playtest = () => {
          const summary = playtestAll(this.runtime);
          const text = formatSummary(summary);
          console.log(text);
          return text;
        };
      });
      void import('../dev/ValidateLayout').then(({ validateAll, formatIssues }) => {
        (window as unknown as { __validate: () => string }).__validate = () => {
          const text = formatIssues(validateAll());
          console.log(text);
          return text;
        };
      });
    }
  }

  // --- Boot -----------------------------------------------------------------

  start(): void {
    this.environment.build(this.theme);
    this.ambience.build(this.theme);
    this.setState('menu');
    this.ui.hideLoading();
    this.running = true;
    this.clock.start();
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  // --- Wiring ---------------------------------------------------------------

  private wireUi(): void {
    const ui = this.ui.events;

    ui.on('hover', () => this.sfx.ui('hover'));

    ui.on('play', () => {
      this.sfx.ui('click');
      // Resume at the first course the player has not finished.
      const next = COURSES.find((course) => !this.save.isCourseComplete(course.id)) ?? COURSES[0];
      this.startCourse(next.id);
    });

    ui.on('openMultiplayer', () => {
      this.sfx.ui('click');
      this.ui.setMultiplayerLobby(this.multiplayerRoom, this.multiplayerLocalPlayerId);
      this.setState('multiplayerLobby');
    });

    ui.on('createRoom', ({ name, color }) => {
      const profile = this.buildLocalProfile(name, color);
      const room = this.roomSync.createRoom(profile);
      this.multiplayerRoom = room;
      this.multiplayerLocalPlayerId = profile.id;
      this.ui.setMultiplayerLobby(room, this.multiplayerLocalPlayerId);
      this.ui.showToast('Room Created', room.code, 1800);
    });

    ui.on('joinRoom', ({ roomCode, name, color }) => {
      const profile = this.buildLocalProfile(name, color);
      const room = this.roomSync.joinRoom(roomCode, profile);
      if (!room) {
        this.ui.showToast('Room unavailable', 'Try another code', 1800);
        return;
      }
      this.multiplayerRoom = room;
      this.multiplayerLocalPlayerId = profile.id;
      this.ui.setMultiplayerLobby(room, this.multiplayerLocalPlayerId);
      this.ui.showToast('Joined room', room.code, 1800);
    });

    ui.on('startMultiplayer', () => {
      if (!this.multiplayerRoom) return;
      this.multiplayerRoom.status = 'playing';
      this.multiplayerRoom.currentTurnPlayerId = this.multiplayerRoom.players[0]?.id ?? null;
      this.roomSync.setRoom(this.multiplayerRoom);
      this.multiplayerCourseId = this.course.id;
      this.startCourse(this.course.id);
      this.runtime.setMultiplayerPlayers(this.multiplayerRoom.players);
      this.runtime.setActiveMultiplayerPlayer(this.multiplayerRoom.currentTurnPlayerId);
      this.ui.showToast('Match started', this.multiplayerRoom.code, 1800);
    });

    ui.on('openCourseSelect', () => {
      this.sfx.ui('click');
      this.setState('courseSelect');
    });

    ui.on('selectCourse', ({ courseId }) => {
      this.sfx.ui('confirm');
      this.startCourse(courseId);
    });

    ui.on('back', () => {
      this.sfx.ui('back');
      this.setState('menu');
    });

    ui.on('resume', () => {
      this.sfx.ui('click');
      this.setState('playing');
    });

    ui.on('restartHole', () => {
      this.sfx.ui('click');
      this.runtime.restart();
      this.setState('playing');
    });

    ui.on('quitToMenu', () => {
      this.sfx.ui('back');
      this.setState('menu');
    });

    ui.on('nextHole', () => {
      this.sfx.ui('click');
      this.advanceHole();
    });

    ui.on('replayCourse', () => {
      this.sfx.ui('click');
      this.startCourse(this.course.id);
    });

    ui.on('openSettings', () => {
      this.sfx.ui('click');
      this.setState('settings');
    });

    ui.on('closeSettings', () => {
      this.sfx.ui('back');
      // Return to whichever screen opened settings.
      this.setState(this.ui.lastScreen === 'pause' ? 'paused' : 'menu');
    });

    ui.on('settingsChanged', (patch) => this.applySettings(this.save.updateSettings(patch)));
  }

  private wireGameplay(): void {
    const events = this.runtime.events;

    events.on('shot', ({ power }) => {
      this.sfx.swing(power);
      this.sfx.strike(power);
    });

    events.on('impact', ({ speed, kind }) => this.sfx.impact(kind, speed));

    events.on('penalty', ({ reason }) => {
      this.sfx.penalty();
      this.ui.showToast(reason === 'water' ? 'Splash!' : 'Out of Bounds', '+1 stroke', 1500);
    });

    events.on('holed', ({ strokes, par }) => {
      this.sfx.holed(strokes <= par);
      const label =
        strokes === 1
          ? 'Hole in One!'
          : strokes - par <= -2
            ? 'Eagle!'
            : strokes - par === -1
              ? 'Birdie!'
              : strokes === par
                ? 'Par'
                : 'Bogey';
      this.ui.showToast(label, `${strokes} strokes · ${formatToPar(strokes, par)}`, 2200);
    });

    events.on('multiplayerTurnChanged', ({ playerId }) => {
      if (!this.multiplayerRoom || this.multiplayerRoom.status !== 'playing') return;
      this.multiplayerRoom.currentTurnPlayerId = playerId;
      this.roomSync.setRoom(this.multiplayerRoom);
      this.ui.setMultiplayerLobby(this.multiplayerRoom, this.multiplayerLocalPlayerId);
    });

    events.on('multiplayerWon', ({ playerId }) => {
      if (!this.multiplayerRoom) return;
      this.multiplayerRoom.status = 'finished';
      this.multiplayerRoom.winnerPlayerId = playerId;
      this.multiplayerRoom.currentTurnPlayerId = playerId;
      this.roomSync.setRoom(this.multiplayerRoom);
      const winner = this.multiplayerRoom.players.find((player) => player.id === playerId);
      this.ui.showToast('Match Won', winner?.name ?? 'Player', 2500);
    });
  }

  // --- State ----------------------------------------------------------------

  private setState(state: AppState): void {
    this.state = state;

    switch (state) {
      case 'menu':
        this.ui.show('mainMenu');
        this.ui.setHudVisible(false);
        this.input.enabled = false;
        this.input.release();
        this.camera.setMode('intro');
        break;

      case 'courseSelect':
        this.ui.show('courseSelect');
        this.ui.setHudVisible(false);
        this.input.enabled = false;
        break;

      case 'multiplayerLobby':
        this.ui.show('multiplayerLobby');
        this.ui.setHudVisible(false);
        this.input.enabled = false;
        this.ui.setMultiplayerLobby(this.multiplayerRoom, this.multiplayerLocalPlayerId);
        break;

      case 'playing':
        this.ui.show('none');
        this.ui.setHudVisible(true);
        this.input.enabled = true;
        break;

      case 'paused':
        this.ui.show('pause');
        this.input.enabled = false;
        this.input.release();
        break;

      case 'settings':
        this.ui.show('settings');
        this.input.enabled = false;
        break;

      case 'scorecard':
        this.ui.show('scorecard');
        this.input.enabled = false;
        break;

      default:
        this.ui.show('courseComplete');
        this.ui.setHudVisible(false);
        this.input.enabled = false;
        break;
    }
  }

  private startCourse(courseId: string): void {
    const course = courseById(courseId);
    if (!course) return;

    this.course = course;
    this.holeIndex = 0;
    this.scores = new Array(course.holes.length).fill(0);
    this.roundStart = performance.now();

    if (this.multiplayerRoom && this.multiplayerRoom.status === 'playing') {
      this.runtime.setMultiplayerPlayers(this.multiplayerRoom.players);
      this.runtime.setActiveMultiplayerPlayer(this.multiplayerRoom.currentTurnPlayerId);
    } else {
      this.runtime.setMultiplayerPlayers([]);
    }

    this.applyTheme(course.theme);
    this.loadHole(0);
    this.setState('playing');
  }

  private applyTheme(themeId: ThemeId): void {
    const theme = THEMES[themeId];
    if (this.theme.id === themeId && this.scene.children.length > 0) {
      // Same theme: keep the built environment, just make sure uniforms match.
      applyThemeToMaterials(theme);
      return;
    }

    this.theme = theme;
    applyThemeToMaterials(theme);
    this.sky.applyTheme(theme);
    this.renderer.applyTheme(theme);
    this.environment.build(theme);
    this.ambience.build(theme);
    this.ui.applyTheme(theme.accent, theme.accentAlt, theme.ink);
    this.music.setTheme(themeId);
    this.sfx.startAmbience(themeId, 0.4);
  }

  private loadHole(index: number): void {
    const hole = this.course.holes[index];
    if (!hole) return;

    this.holeIndex = index;
    this.juice.reset();
    this.runtime.load(hole, this.theme);

    this.ui.showHoleCard(index + 1, hole.name, hole.par, hole.hint);
    this.updateHud();
  }

  private advanceHole(): void {
    const next = this.holeIndex + 1;
    if (next >= this.course.holes.length) {
      this.completeCourse();
      return;
    }
    this.loadHole(next);
    this.setState('playing');
  }

  private completeCourse(): void {
    const total = this.scores.reduce((a, b) => a + b, 0);
    const seconds = (performance.now() - this.roundStart) / 1000;
    const record = this.save.course(this.course.id);
    const isRecord = total < record.bestTotal;

    this.save.recordCourse(this.course.id, total, seconds);
    this.ui.showCourseComplete(this.course, this.scores, seconds, isRecord);
    this.sfx.ui('confirm');
    this.setState('complete');
  }

  private buildLocalProfile(name: string, color: string): RoomPlayer {
    return {
      id: `${this.multiplayerLocalPlayerId}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      color,
      avatar: '◎',
      isHost: false,
    };
  }

  private onHoleFinished(): void {
    const hole = this.course.holes[this.holeIndex];
    this.scores[this.holeIndex] = this.runtime.strokes;
    this.save.recordHole(this.course.id, hole.id, this.runtime.strokes, hole.par);

    const isLast = this.holeIndex === this.course.holes.length - 1;
    this.ui.showScorecard(
      this.course,
      this.holeIndex,
      this.scores,
      isLast,
      this.runtime.strokes,
      hole.par,
    );
    this.setState('scorecard');
  }

  private applySettings(settings: SettingsData): void {
    this.renderer.applySettings(settings);
    this.audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
    this.music.setEnabled(settings.musicVolume > 0.001);
    this.juice.intensity = settings.screenShake;
    this.ui.setDebug(settings.showFps);
  }

  // --- Frame ----------------------------------------------------------------

  private frame = (): void => {
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.frame);

    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    // Hit-stop scales simulation time for everything downstream.
    const timeScale = this.juice.update(rawDt);
    const dt = rawDt * timeScale;

    this.handleGlobalInput();

    const playing = this.state === 'playing';

    if (playing || this.state === 'scorecard' || this.state === 'complete') {
      this.runtime.update(dt, elapsed, this.input, playing);
      if (this.runtime.updateSinking(dt) && this.state === 'playing') this.onHoleFinished();
    } else {
      // Menus still animate the world so the background stays alive, but no
      // physics runs and no input reaches the course.
      this.camera.update(dt, this.runtime.ballPosition, ZERO, 0);
    }

    this.sky.update(elapsed, this.camera.camera.position);
    this.environment.update(dt, elapsed, this.camera.camera);
    this.ambience.update(dt, elapsed, this.camera.camera.position, SharedCelUniforms.uWind.value);
    this.particles.update(dt);
    this.updateWind(rawDt);

    if (playing) {
      this.sfx.rolling(this.runtime.ballSpeed, this.runtime.surface as never, this.runtime.ballGrounded);
      this.ui.setPower(this.runtime.charge, this.runtime.charge > 0.001);
      this.updateHud();
    } else {
      this.sfx.stopRolling();
      this.ui.setPower(0, false);
    }
    this.sfx.updateAmbience(rawDt);

    this.renderer.render(rawDt, elapsed);
    this.updateDebug(rawDt);

    this.input.endFrame();
  };

  private handleGlobalInput(): void {
    if (this.input.consume('pause')) {
      if (this.state === 'playing') {
        this.sfx.ui('back');
        this.setState('paused');
      } else if (this.state === 'paused') {
        this.sfx.ui('click');
        this.setState('playing');
      } else if (this.state === 'settings') {
        this.setState(this.ui.lastScreen === 'pause' ? 'paused' : 'menu');
      } else if (this.state === 'courseSelect') {
        this.setState('menu');
      }
    }

    if (this.state === 'playing' && this.input.consume('restartHole')) {
      this.runtime.restart();
      this.ui.showToast('Hole Restarted', '', 1100);
    }

    if (this.state === 'playing' && this.input.consume('toggleTop')) {
      this.camera.setMode(this.camera.currentMode === 'overhead' ? 'aim' : 'overhead');
    }

    // Clicking or pressing space during the intro skips straight to the tee.
    if (this.state === 'playing' && this.input.pointer.down) {
      this.ui.hideHoleCard();
      this.runtime.beginPlay();
    }
  }

  /** Slowly varying global wind, shared by foliage shaders and the audio bed. */
  private updateWind(dt: number): void {
    this.windTimer += dt;
    const wind = 0.65 + Math.sin(this.windTimer * 0.21) * 0.3 + Math.sin(this.windTimer * 0.07) * 0.2;
    SharedCelUniforms.uWind.value = clamp(wind, 0.2, 1.5);
    if (Math.random() < dt * 0.06) this.sfx.gust(0.5);
  }

  private updateHud(): void {
    // "Total" counts every stroke played so far, including the hole in progress.
    const totalStrokes = this.scores.reduce((a, b) => a + b, 0) + this.runtime.strokes;

    // "To par" is measured against *completed* holes only. Counting the current
    // hole's par would show the player at -2 the moment they walked onto a par
    // 2, and counting their in-progress strokes against it would swing the
    // figure on every shot. Neither is how a scorecard reads.
    const completedStrokes = this.scores
      .slice(0, this.holeIndex)
      .reduce((sum, score) => sum + score, 0);
    const completedPar = this.course.holes
      .slice(0, this.holeIndex)
      .reduce((sum, hole) => sum + hole.par, 0);

    this.ui.updateHud({
      courseName: this.course.name,
      holeName: this.course.holes[this.holeIndex]?.name ?? '',
      holeNumber: this.holeIndex + 1,
      holeCount: this.course.holes.length,
      par: this.runtime.par,
      strokes: this.runtime.strokes,
      totalStrokes,
      completedStrokes,
      completedPar,
    });
  }

  private updateDebug(dt: number): void {
    if (!this.save.settings.showFps) return;
    this.fpsAccumulator += dt;
    this.fpsFrames++;
    if (this.fpsAccumulator < 0.4) return;
    this.fps = this.fpsFrames / this.fpsAccumulator;
    this.fpsAccumulator = 0;
    this.fpsFrames = 0;

    this.ui.setDebug(
      true,
      `${this.fps.toFixed(0)} fps<br>` +
        `${this.renderer.drawCalls} draws<br>` +
        `${(this.renderer.triangles / 1000).toFixed(1)}k tris<br>` +
        `dpr ${this.renderer.pixelRatio.toFixed(2)}<br>` +
        `bodies ${this.physics.world.bodies.length}`,
    );
  }

  private onResize = (): void => {
    this.camera.resize(window.innerWidth / window.innerHeight);
    this.renderer.resize();
    const height = window.innerHeight * this.renderer.pixelRatio;
    this.particles.setViewportHeight(height);
    this.ambience.setViewportHeight(height);
  };

  /** Development-only tuning panel. Stripped from production builds by Vite. */
  private buildDebugGui(): void {
    const gui = new GUI({ title: 'Sakura Links — Debug' });
    gui.close();
    // Nudged clear of the HUD's top-right score panel.
    gui.domElement.style.top = '112px';
    gui.domElement.style.zIndex = '5';
    this.gui = gui;

    const render = gui.addFolder('Render');
    render.add({ pixelRatio: this.renderer.pixelRatio }, 'pixelRatio', 0.5, 2, 0.05).onChange((v: number) =>
      this.renderer.setPixelRatio(v),
    );
    render.add(SharedCelUniforms.uWind, 'value', 0, 2, 0.01).name('wind');
    render.add(SharedCelUniforms.uFogNear, 'value', 1, 200, 1).name('fog near');
    render.add(SharedCelUniforms.uFogFar, 'value', 20, 400, 1).name('fog far');

    const grade = gui.addFolder('Grade');
    grade.add(this.renderer.grade.uniforms.uSaturation, 'value', 0, 2, 0.01).name('saturation');
    grade.add(this.renderer.grade.uniforms.uContrast, 'value', 0.5, 2, 0.01).name('contrast');
    grade.add(this.renderer.grade.uniforms.uVignette, 'value', 0, 1, 0.01).name('vignette');

    const debug = gui.addFolder('Debug');
    debug
      .add(
        {
          skipHole: () => {
            if (this.state === 'playing') this.onHoleFinished();
          },
        },
        'skipHole',
      )
      .name('complete hole');
    debug
      .add(
        {
          unlockAll: () => {
            for (const course of COURSES) this.save.recordCourse(course.id, 99, 999);
            this.ui.refreshCourseCards();
          },
        },
        'unlockAll',
      )
      .name('unlock all courses');
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    window.removeEventListener('resize', this.onResize);
    this.gui?.destroy();
    this.runtime.dispose();
    this.particles.dispose();
    this.ambience.dispose();
    this.environment.dispose();
    this.sky.dispose();
    this.physics.dispose();
    this.renderer.dispose();
    this.music.dispose();
    this.sfx.dispose();
    this.audio.dispose();
    this.input.dispose();
  }
}

const ZERO = new THREE.Vector3();
