import { clamp, clamp01 } from '../util/math';
import type { AudioEngine } from './AudioEngine';
import type { ImpactKind } from '../core/Events';
import type { SurfaceKind } from '../physics/PhysicsWorld';

/**
 * Every sound effect in the game, synthesised on demand.
 *
 * Design notes worth keeping:
 * - **Impacts** are a filtered noise transient plus a pitched body. The noise
 *   carries the material (stone is dull and low-Q, metal is bright and rings),
 *   the tone carries the force. Pitch rises with impact speed, which is what
 *   makes a hard hit read as hard rather than merely louder.
 * - **Rolling** is a single looping noise source through a bandpass whose
 *   frequency and gain track ball speed. Starting and stopping a source per
 *   frame would click; one persistent voice modulated smoothly does not.
 * - **Ambience** layers filtered noise (wind, water) with sparse randomised
 *   bird calls so a quiet hole never sounds like silence.
 */
export class Sfx {
  private rollSource: AudioBufferSourceNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private rollGain: GainNode | null = null;

  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;

  private birdTimer = 0;
  private birdsEnabled = false;
  private ambienceStarted = false;

  constructor(private readonly engine: AudioEngine) {}

  // --- One-shots -----------------------------------------------------------

  /** Club through the air, then the strike. `power` is 0..1. */
  swing(power: number): void {
    const p = clamp01(power);
    // Whoosh: noise sweeping downward, brighter and louder with power.
    this.engine.noiseBurst({
      duration: 0.16 + p * 0.1,
      gain: 0.05 + p * 0.16,
      filter: 'bandpass',
      frequency: 700 + p * 900,
      sweepTo: 260,
      q: 1.4,
    });
  }

  /** The moment of contact between putter and ball. */
  strike(power: number): void {
    const p = clamp01(power);
    const t = this.engine.now;

    // Sharp click — the transient that sells contact.
    this.engine.noiseBurst({
      duration: 0.045,
      gain: 0.18 + p * 0.3,
      filter: 'highpass',
      frequency: 2200,
      q: 0.7,
      when: t,
    });

    // Pitched body. Frequency rising with power is the core "harder = crisper"
    // cue; a pure volume change alone is much less legible.
    this.engine.tone({
      type: 'triangle',
      frequency: 420 + p * 340,
      glideTo: 190 + p * 120,
      duration: 0.13,
      attack: 0.002,
      gain: 0.16 + p * 0.24,
      when: t,
    });

    this.engine.tone({
      type: 'sine',
      frequency: 120 + p * 60,
      glideTo: 70,
      duration: 0.2,
      attack: 0.003,
      gain: 0.12 + p * 0.16,
      when: t,
    });
  }

  /** Ball hitting something. Material comes from `kind`, force from `speed`. */
  impact(kind: ImpactKind, speed: number): void {
    const force = clamp01(speed / 16);
    if (force < 0.03) return;

    switch (kind) {
      case 'bumper':
        this.engine.tone({
          type: 'square',
          frequency: 620 + force * 420,
          glideTo: 1300 + force * 600,
          duration: 0.12,
          gain: 0.1 + force * 0.16,
        });
        this.engine.tone({
          type: 'sine',
          frequency: 1200,
          glideTo: 2400,
          duration: 0.16,
          gain: 0.06 + force * 0.1,
        });
        this.engine.noiseBurst({
          duration: 0.09,
          gain: 0.1 + force * 0.16,
          filter: 'bandpass',
          frequency: 2600,
          q: 2.4,
        });
        break;

      case 'metal':
        this.engine.tone({
          type: 'triangle',
          frequency: 900 + force * 500,
          duration: 0.34,
          gain: 0.06 + force * 0.12,
        });
        this.engine.noiseBurst({
          duration: 0.12,
          gain: 0.08 + force * 0.14,
          filter: 'bandpass',
          frequency: 3400,
          q: 4,
        });
        break;

      case 'sand':
        this.engine.noiseBurst({
          duration: 0.26,
          gain: 0.08 + force * 0.16,
          filter: 'lowpass',
          frequency: 1400,
          sweepTo: 400,
          q: 0.6,
        });
        break;

      case 'water':
        this.engine.noiseBurst({
          duration: 0.42,
          gain: 0.22,
          filter: 'lowpass',
          frequency: 2400,
          sweepTo: 300,
          q: 0.8,
        });
        this.engine.tone({
          type: 'sine',
          frequency: 640,
          glideTo: 180,
          duration: 0.26,
          gain: 0.14,
        });
        break;

      case 'ground':
        this.engine.noiseBurst({
          duration: 0.1,
          gain: 0.05 + force * 0.12,
          filter: 'lowpass',
          frequency: 700,
          q: 0.7,
        });
        break;

      default:
        // Stone / wood rail: low-Q noise thud plus a short woody body.
        this.engine.noiseBurst({
          duration: 0.1,
          gain: 0.08 + force * 0.2,
          filter: 'bandpass',
          frequency: 420 + force * 500,
          q: 1,
        });
        this.engine.tone({
          type: 'triangle',
          frequency: 210 + force * 260,
          glideTo: 120,
          duration: 0.1,
          gain: 0.06 + force * 0.14,
        });
        break;
    }
  }

  /** Boost pad / jump pad — a rising arpeggio, unmistakably "good thing". */
  boost(): void {
    const t = this.engine.now;
    const notes = [440, 660, 880, 1320];
    notes.forEach((frequency, i) => {
      this.engine.tone({
        type: 'square',
        frequency,
        duration: 0.11,
        gain: 0.09,
        when: t + i * 0.035,
      });
    });
    this.engine.noiseBurst({
      duration: 0.28,
      gain: 0.1,
      filter: 'highpass',
      frequency: 1600,
      sweepTo: 5200,
    });
  }

  /** Ball dropping into the cup: the rattle, then the fanfare. */
  holed(underPar: boolean): void {
    const t = this.engine.now;

    // Rattle in the cup.
    for (let i = 0; i < 4; i++) {
      this.engine.noiseBurst({
        duration: 0.06,
        gain: 0.12 - i * 0.02,
        filter: 'bandpass',
        frequency: 700 + i * 260,
        q: 3,
        when: t + i * 0.055,
      });
    }

    // Major arpeggio, lifted a fifth when the player beat par.
    const root = underPar ? 587.33 : 392;
    const chord = [1, 1.25, 1.5, 2, 2.5];
    chord.forEach((ratio, i) => {
      this.engine.tone({
        type: 'triangle',
        frequency: root * ratio,
        duration: 0.55 - i * 0.05,
        attack: 0.01,
        gain: 0.13,
        when: t + 0.22 + i * 0.07,
      });
      this.engine.tone({
        type: 'sine',
        frequency: root * ratio * 2,
        duration: 0.4,
        gain: 0.05,
        when: t + 0.22 + i * 0.07,
      });
    });
  }

  /** Water/void penalty — a descending, deflating figure. */
  penalty(): void {
    const t = this.engine.now;
    [523.25, 466.16, 392].forEach((frequency, i) => {
      this.engine.tone({
        type: 'triangle',
        frequency,
        glideTo: frequency * 0.94,
        duration: 0.28,
        gain: 0.11,
        when: t + i * 0.12,
      });
    });
  }

  ui(kind: 'hover' | 'click' | 'back' | 'confirm'): void {
    switch (kind) {
      case 'hover':
        this.engine.tone({ type: 'sine', frequency: 1180, duration: 0.05, gain: 0.035 });
        break;
      case 'click':
        this.engine.tone({ type: 'square', frequency: 880, glideTo: 1320, duration: 0.07, gain: 0.06 });
        break;
      case 'back':
        this.engine.tone({ type: 'square', frequency: 660, glideTo: 420, duration: 0.09, gain: 0.06 });
        break;
      default:
        [523.25, 659.25, 783.99].forEach((frequency, i) =>
          this.engine.tone({
            type: 'triangle',
            frequency,
            duration: 0.18,
            gain: 0.08,
            when: this.engine.now + i * 0.05,
          }),
        );
        break;
    }
  }

  // --- Continuous ----------------------------------------------------------

  /** Starts the persistent rolling voice. Idempotent. */
  private ensureRolling(): void {
    if (this.rollSource) return;
    const context = this.engine.context;

    const source = context.createBufferSource();
    source.buffer = this.engine.noise();
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 1.1;

    const gain = context.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.engine.sfxBus);
    source.start();

    this.rollSource = source;
    this.rollFilter = filter;
    this.rollGain = gain;
  }

  /** Tracks the ball. Call every frame with current speed and surface. */
  rolling(speed: number, surface: SurfaceKind, grounded: boolean): void {
    if (!this.engine.ready) return;
    this.ensureRolling();
    if (!this.rollGain || !this.rollFilter) return;

    const t = this.engine.now;
    const intensity = grounded ? clamp01((speed - 0.35) / 9) : 0;

    // Surface changes timbre: sand is a low hiss, metal a bright ring, ice
    // almost silent because there is nothing to rub against.
    const profile =
      surface === 'sand'
        ? { frequency: 620, q: 0.6, gain: 0.3 }
        : surface === 'metal' || surface === 'platform' || surface === 'boost'
          ? { frequency: 1500, q: 2.6, gain: 0.16 }
          : surface === 'ice'
            ? { frequency: 2600, q: 5, gain: 0.07 }
            : surface === 'wood'
              ? { frequency: 520, q: 1.4, gain: 0.2 }
              : { frequency: 380, q: 1.1, gain: 0.22 };

    this.rollFilter.frequency.setTargetAtTime(
      profile.frequency + intensity * profile.frequency * 1.4,
      t,
      0.05,
    );
    this.rollFilter.Q.setTargetAtTime(profile.q, t, 0.1);
    this.rollGain.gain.setTargetAtTime(intensity * profile.gain, t, 0.06);
  }

  stopRolling(): void {
    if (this.rollGain) this.rollGain.gain.setTargetAtTime(0, this.engine.now, 0.05);
  }

  /**
   * Ambient bed for the current theme. `water` scales the stream layer so a hole
   * with a pond sounds different from one without.
   */
  startAmbience(theme: 'sakura' | 'sky' | 'neon', water: number): void {
    const context = this.engine.context;

    if (!this.ambienceStarted) {
      this.ambienceStarted = true;

      const windSource = context.createBufferSource();
      windSource.buffer = this.engine.noise();
      windSource.loop = true;
      const windFilter = context.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 420;
      windFilter.Q.value = 0.6;
      const windGain = context.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(this.engine.sfxBus);
      windSource.start();
      this.windGain = windGain;
      this.windFilter = windFilter;

      const waterSource = context.createBufferSource();
      waterSource.buffer = this.engine.noise();
      waterSource.loop = true;
      const waterFilter = context.createBiquadFilter();
      waterFilter.type = 'bandpass';
      waterFilter.frequency.value = 3200;
      waterFilter.Q.value = 0.8;
      const waterGain = context.createGain();
      waterGain.gain.value = 0;
      waterSource.connect(waterFilter);
      waterFilter.connect(waterGain);
      waterGain.connect(this.engine.sfxBus);
      waterSource.start();
      this.waterGain = waterGain;
    }

    const t = this.engine.now;
    // The arcade is indoors: almost no wind, and its "water" layer becomes a
    // faint electrical hum instead.
    const windLevel = theme === 'neon' ? 0.012 : theme === 'sky' ? 0.055 : 0.032;
    this.windGain?.gain.setTargetAtTime(windLevel, t, 1.2);
    this.windFilter?.frequency.setTargetAtTime(theme === 'sky' ? 640 : 380, t, 1.2);
    this.waterGain?.gain.setTargetAtTime(clamp(water, 0, 1) * 0.035, t, 1.5);
    this.birdsEnabled = theme === 'sakura';
  }

  /** Sparse, randomised bird calls. Called every frame; fires rarely. */
  updateAmbience(dt: number): void {
    if (!this.birdsEnabled || !this.engine.ready) return;
    this.birdTimer -= dt;
    if (this.birdTimer > 0) return;
    this.birdTimer = 4 + Math.random() * 11;

    // Two or three chirps: short glides at a randomised base pitch.
    const base = 1500 + Math.random() * 1400;
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      this.engine.tone({
        type: 'sine',
        frequency: base * (1 + i * 0.12),
        glideTo: base * (1.35 + i * 0.1),
        duration: 0.09,
        attack: 0.012,
        gain: 0.035,
        when: this.engine.now + i * 0.13 + Math.random() * 0.04,
      });
    }
  }

  /** Wind gust tied to the visual wind strength. */
  gust(strength: number): void {
    if (!this.windGain) return;
    const t = this.engine.now;
    const level = this.windGain.gain.value;
    this.windGain.gain.setTargetAtTime(level + strength * 0.03, t, 0.6);
    this.windGain.gain.setTargetAtTime(level, t + 1.4, 1.6);
  }

  dispose(): void {
    this.rollSource?.stop();
    this.rollSource = null;
  }
}
