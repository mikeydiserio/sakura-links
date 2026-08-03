import * as THREE from 'three';
import { clamp01, damp, Rng } from '../util/math';
import type { GradePass } from '../render/GradePass';

/**
 * Screen-level feedback: camera shake, hit-stop and impact flashes.
 *
 * ### Hit-stop
 * A very short freeze on impact — the frame budget still runs, but simulation
 * time is scaled toward zero. Two or three frames is enough for the brain to
 * register a collision as *forceful*; any longer reads as a stutter. Because it
 * scales `dt` rather than skipping updates, animation and physics stay in sync.
 *
 * ### Shake
 * Sum of two decaying sinusoids at incommensurate frequencies, which avoids the
 * mechanical buzz a single frequency produces, plus a small random component.
 * Amplitude is scaled by the player's accessibility setting and always decays to
 * exactly zero so the camera never drifts.
 */
export class Juice {
  private shakeAmount = 0;
  private shakeTime = 0;
  private stopTimer = 0;
  private stopStrength = 0;
  private flash = 0;
  private flashColor = new THREE.Color(0xffffff);
  private readonly offset = new THREE.Vector3();
  private readonly rng = new Rng(9182);

  /** Player-facing multiplier, 0 disables shake entirely. */
  intensity = 1;

  constructor(private readonly grade: GradePass) {}

  /** `amount` is roughly in world units of camera displacement. */
  shake(amount: number, duration = 0.35): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount * this.intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  /** Freezes time for `duration` seconds. `strength` 0..1 scales how hard. */
  hitStop(duration: number, strength = 1): void {
    this.stopTimer = Math.max(this.stopTimer, duration);
    this.stopStrength = Math.max(this.stopStrength, clamp01(strength));
  }

  screenFlash(amount: number, color: THREE.ColorRepresentation = 0xffffff): void {
    this.flash = Math.max(this.flash, clamp01(amount));
    this.flashColor.set(color);
  }

  /**
   * Advances the effects and returns the simulation time scale for this frame.
   * Callers must multiply their `dt` by the result *after* calling.
   */
  update(dt: number): number {
    // Shake.
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const falloff = this.shakeTime > 0 ? this.shakeTime : 0;
      const amplitude = this.shakeAmount * falloff;
      const t = performance.now() * 0.001;
      this.offset.set(
        (Math.sin(t * 47.3) + Math.sin(t * 31.7) * 0.6 + this.rng.range(-0.4, 0.4)) * amplitude,
        (Math.cos(t * 41.1) + Math.sin(t * 27.3) * 0.6 + this.rng.range(-0.4, 0.4)) * amplitude * 0.7,
        (Math.sin(t * 37.9) + Math.cos(t * 23.1) * 0.6) * amplitude * 0.5,
      );
      if (this.shakeTime === 0) {
        this.shakeAmount = 0;
        this.offset.setScalar(0);
      }
    } else {
      this.offset.setScalar(0);
    }

    // Flash decays fast — it should register subliminally, not linger.
    this.flash = damp(this.flash, 0, 11, dt);
    this.grade.setFlash(this.flash * 0.55, this.flashColor);

    // Hit-stop.
    if (this.stopTimer > 0) {
      this.stopTimer = Math.max(0, this.stopTimer - dt);
      if (this.stopTimer === 0) this.stopStrength = 0;
      // Never fully zero: a hard 0 can leave interpolators with stale state.
      return 1 - this.stopStrength * 0.94;
    }

    return 1;
  }

  get cameraOffset(): THREE.Vector3 {
    return this.offset;
  }

  /** Called when a hole loads so nothing carries over between holes. */
  reset(): void {
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.stopTimer = 0;
    this.stopStrength = 0;
    this.flash = 0;
    this.offset.setScalar(0);
    this.grade.setFlash(0);
  }
}
