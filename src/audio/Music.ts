import type { AudioEngine } from './AudioEngine';
import type { ThemeId } from '../render/Palette';
import { Rng } from '../util/math';

/**
 * Generative background music. No files, no loops — notes are scheduled ahead of
 * time from a per-theme scale and chord progression.
 *
 * ### Scheduling model
 * A lookahead scheduler (the standard fix for `setTimeout`-driven Web Audio) runs
 * on a 25 ms timer and queues every event that falls inside the next 150 ms
 * using precise `AudioContext` timestamps. Timing therefore comes from the audio
 * clock, not the main thread, so a frame hitch cannot make the music stutter.
 *
 * ### Musical design
 * Each theme picks a mode and a four-chord loop. Three voices play against it:
 * a sustained pad, a sparse arpeggio, and (arcade only) a bass pulse. Note
 * choice is seeded-random within the current chord, so the music never repeats
 * exactly but also never lands outside the harmony.
 */

interface ThemeMusic {
  /** Semitone offsets from the root that make up the scale. */
  scale: number[];
  /** Chord roots as semitone offsets, one per bar. */
  progression: number[];
  rootHz: number;
  tempo: number;
  padType: OscillatorType;
  leadType: OscillatorType;
  bass: boolean;
  padGain: number;
  leadGain: number;
}

const THEME_MUSIC: Record<ThemeId, ThemeMusic> = {
  // Major pentatonic — no semitone clashes, so a random walk always sounds
  // intentional. The classic "gentle Japanese garden" shorthand.
  sakura: {
    scale: [0, 2, 4, 7, 9],
    progression: [0, 5, 9, 7],
    rootHz: 261.63,
    tempo: 74,
    padType: 'sine',
    leadType: 'triangle',
    bass: false,
    padGain: 0.055,
    leadGain: 0.05,
  },

  // Lydian: the raised fourth is what makes it sound airborne.
  sky: {
    scale: [0, 2, 4, 6, 7, 9, 11],
    progression: [0, 7, 2, 5],
    rootHz: 293.66,
    tempo: 92,
    padType: 'triangle',
    leadType: 'sine',
    bass: false,
    padGain: 0.05,
    leadGain: 0.045,
  },

  // Minor with a driving bass — arcade energy without becoming abrasive.
  neon: {
    scale: [0, 3, 5, 7, 10],
    progression: [0, 10, 8, 3],
    rootHz: 220,
    tempo: 118,
    padType: 'sawtooth',
    leadType: 'square',
    bass: true,
    padGain: 0.035,
    leadGain: 0.045,
  },
};

const LOOKAHEAD_MS = 25;
const SCHEDULE_WINDOW = 0.15;

export class Music {
  private theme: ThemeId = 'sakura';
  private timer = 0;
  private nextNoteTime = 0;
  private step = 0;
  private playing = false;
  private rng = new Rng(31337);
  private readonly delay: GainNode;
  private readonly padBus: GainNode;
  private readonly leadBus: GainNode;

  constructor(private readonly engine: AudioEngine) {
    // A long, dark delay glues the sparse notes into a continuous texture.
    this.delay = engine.createDelay(0.36, 0.36, 0.3, engine.musicBus);
    this.padBus = engine.createBus(1, engine.musicBus);
    this.leadBus = engine.createBus(1, this.delay);
  }

  setTheme(theme: ThemeId): void {
    if (this.theme === theme) return;
    this.theme = theme;
    this.step = 0;
    this.rng = new Rng(theme.length * 7919 + 13);
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.nextNoteTime = this.engine.now + 0.1;
    this.timer = window.setInterval(() => this.schedule(), LOOKAHEAD_MS);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  setEnabled(enabled: boolean): void {
    if (enabled) this.start();
    else this.stop();
  }

  /** Queues every event inside the lookahead window. */
  private schedule(): void {
    if (!this.engine.ready) return;
    const config = THEME_MUSIC[this.theme];
    const secondsPerStep = 60 / config.tempo / 2; // eighth notes

    while (this.nextNoteTime < this.engine.now + SCHEDULE_WINDOW) {
      this.playStep(this.step, this.nextNoteTime, config, secondsPerStep);
      this.nextNoteTime += secondsPerStep;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, when: number, config: ThemeMusic, stepDuration: number): void {
    // 16 eighth notes per bar-pair; a chord change every 16 steps.
    const bar = Math.floor(step / 16) % config.progression.length;
    const chordRoot = config.progression[bar];
    const inBar = step % 16;

    const note = (semitones: number, octave = 0): number =>
      config.rootHz * Math.pow(2, (semitones + octave * 12) / 12);

    // --- Pad: one sustained chord at the top of each bar --------------------
    if (inBar === 0) {
      const voices = [0, 4, 7];
      for (const interval of voices) {
        this.engine.tone({
          destination: this.padBus,
          type: config.padType,
          frequency: note(chordRoot + interval, -1),
          duration: stepDuration * 15,
          attack: 0.9,
          gain: config.padGain,
          detune: this.rng.range(-7, 7),
          when,
        });
      }
    }

    // --- Lead: sparse arpeggio drawn from the scale over the chord ----------
    const leadChance = this.theme === 'neon' ? 0.55 : 0.3;
    if (inBar % 2 === 0 && this.rng.bool(leadChance)) {
      const degree = this.rng.pick(config.scale);
      const octave = this.rng.pick([0, 0, 1]);
      this.engine.tone({
        destination: this.leadBus,
        type: config.leadType,
        frequency: note(chordRoot + degree, octave),
        duration: stepDuration * this.rng.range(1.2, 3.4),
        attack: 0.02,
        gain: config.leadGain * this.rng.range(0.7, 1.1),
        when,
      });
    }

    // --- Bass: straight eighths on the arcade course ------------------------
    if (config.bass && inBar % 2 === 0) {
      this.engine.tone({
        destination: this.padBus,
        type: 'square',
        frequency: note(chordRoot, -2),
        glideTo: note(chordRoot, -2) * 0.98,
        duration: stepDuration * 0.85,
        attack: 0.004,
        gain: 0.06,
        when,
      });
    }

    // A soft high accent every other bar keeps long stretches from flattening.
    if (inBar === 8 && this.rng.bool(0.4)) {
      this.engine.tone({
        destination: this.leadBus,
        type: 'sine',
        frequency: note(chordRoot + this.rng.pick(config.scale), 2),
        duration: stepDuration * 2,
        attack: 0.05,
        gain: config.leadGain * 0.5,
        when,
      });
    }
  }

  dispose(): void {
    this.stop();
  }
}
