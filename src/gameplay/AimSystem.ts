import * as THREE from 'three';
import { CelMaterial } from '../render/CelMaterial';
import { LAYER_NO_EDGE } from '../render/Renderer';
import { clamp01, damp, TAU } from '../util/math';
import type { Theme } from '../render/Palette';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

/**
 * Shot power.
 *
 * ### Why the minimum is so low
 * Roll distance on a green is `v₀ / k` with `k = 0.95`, so the old 3.2 floor
 * meant the *gentlest possible stroke* still rolled 3.4 units — ten times the
 * cup radius. Lagging a putt up to the hole was arithmetically impossible; every
 * short putt overshot unless the player banked it off a rail. 0.9 puts the
 * softest stroke just under a unit, which is a tap-in.
 *
 * Charge maps to speed linearly. It does not need its own easing curve, because
 * the meter below is what the player actually times, and that already spends
 * most of its travel down at putting pace.
 */
/**
 * ### Why the maximum is what it is
 * A full-power strike is now genuinely hard to land — the meter sprints through
 * the top of its travel — so it has to be worth landing. 26 rolls about 27 units
 * on a green, comfortably past the longest hole, which makes the big shot a real
 * option rather than merely sufficient.
 *
 * It cannot go higher without moving geometry with it. A ball leaving a ramp of
 * angle θ at speed v rises `(v·sinθ)² / 2g`; at the steepest authored ramp
 * (0.24 rad) and g = 20 that is `(26·0.2377)² / 40 ≈ 0.96`, which is what sets
 * `DEFAULT_WALL_HEIGHT` in the hole builder. Raise this and the rails must rise
 * too, or full-power shots start flying out of the course on every ramp.
 */
export const MIN_SHOT_SPEED = 0.9;
export const MAX_SHOT_SPEED = 26;

/**
 * The swing meter.
 *
 * One press, one release. The meter accelerates as it fills, tops out, and then
 * bleeds away again — so the player is not holding a button for a duration, they
 * are timing a release against a moving target. The sweet spot is the peak, and
 * `RISE_CURVE` is what makes hitting it a skill: the bar crawls through the
 * bottom of its range and sprints through the top, so full power is a genuinely
 * narrow window while short putts get most of the travel to aim with.
 *
 * Overcooking it is a real mistake with a real cost rather than a free retry.
 * Hold past the top and the meter falls all the way back to nothing, and the
 * stroke goes out at `MIN_SHOT_SPEED`. It settles there rather than looping: a
 * meter that climbed again would let an indecisive player wait for another pass,
 * which is exactly the tension this is meant to create.
 */
const CHARGE_RISE = 1.35;
const CHARGE_FALL = 0.85;
const RISE_CURVE = 2.4;
/**
 * Lower edge of the sweet-spot band. Because the rise accelerates, the meter
 * crosses this last stretch in roughly the final 180 ms of its climb — tight
 * enough to be a real test, wide enough to be learnable rather than luck.
 */
const SWEET_SPOT_FROM = 0.88;

/**
 * Aiming and power charging, plus the on-course indicator that visualises both.
 *
 * ### Prediction
 * The dotted line is not a guess — it walks the same exponential decay model the
 * ball uses (`v(t) = v₀·e^(−kt)`, so total roll distance is `v₀/k`) and probes
 * the physics world downward at each step, dropping dots onto whatever surface
 * is actually there. It stops early at a ledge, which is exactly the information
 * a player needs on the Sky Islands course.
 */
export class AimSystem {
  readonly group = new THREE.Group();

  /** Aim direction in radians. `+Z` is 0; the direction vector is (sin, 0, cos). */
  yaw = 0;
  charge = 0;
  charging = false;
  /** Seconds the current charge has been held. Drives the rise/fall meter. */
  private chargeTime = 0;

  private readonly dots: THREE.InstancedMesh;
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: CelMaterial;
  private readonly dotMaterial: CelMaterial;
  private readonly dotCount = 26;

  // Scratch state — the aim indicator updates every frame and must not allocate.
  private readonly matrix = new THREE.Matrix4();
  private readonly dirVec = new THREE.Vector3();
  private readonly probeOrigin = new THREE.Vector3();
  private readonly stopPoint = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private static readonly WHITE = new THREE.Color(0xffffff);

  private scroll = 0;
  private displayedCharge = 0;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly theme: Theme,
  ) {
    this.group.name = 'aim';
    this.group.layers.set(LAYER_NO_EDGE);

    this.dotMaterial = new CelMaterial({
      color: 0xffffff,
      emissive: theme.accent,
      emissiveStrength: 1.6,
      bands: 3,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      rimStrength: 0,
      fog: 0,
    });

    const dotGeometry = new THREE.SphereGeometry(0.075, 8, 6);
    dotGeometry.scale(1, 0.45, 1);
    this.dots = new THREE.InstancedMesh(dotGeometry, this.dotMaterial, this.dotCount);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 10;
    this.dots.layers.set(LAYER_NO_EDGE);
    this.group.add(this.dots);

    this.ringMaterial = new CelMaterial({
      color: 0xffffff,
      emissive: theme.accent,
      emissiveStrength: 1.4,
      bands: 3,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      rimStrength: 0,
      fog: 0,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 22), this.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 10;
    this.ring.layers.set(LAYER_NO_EDGE);
    this.group.add(this.ring);

    this.visible = false;
  }

  set visible(value: boolean) {
    this.group.visible = value;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Aim direction as a unit vector in XZ. */
  direction(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
  }

  /** Shot speed for the current charge. */
  get shotSpeed(): number {
    return MIN_SHOT_SPEED + this.charge * (MAX_SHOT_SPEED - MIN_SHOT_SPEED);
  }

  /**
   * True while the meter is inside the sweet spot at the top of its travel.
   * The HUD uses this to mark the band the player is aiming to release in.
   */
  get inSweetSpot(): boolean {
    return this.charge >= SWEET_SPOT_FROM;
  }

  /** Lower edge of the sweet-spot band, as a charge value. */
  get sweetSpotFrom(): number {
    return SWEET_SPOT_FROM;
  }

  /** True once the meter has crested and is bleeding back down. */
  get falling(): boolean {
    return this.chargeTime > CHARGE_RISE;
  }

  rotate(delta: number): void {
    this.yaw = (this.yaw + delta) % TAU;
  }

  faceTarget(from: THREE.Vector3, to: THREE.Vector3): void {
    this.yaw = Math.atan2(to.x - from.x, to.z - from.z);
  }

  beginCharge(): void {
    if (this.charging) return;
    this.charging = true;
    this.charge = 0;
    this.chargeTime = 0;
  }

  /** Returns the shot speed and clears the charge. */
  releaseCharge(): number {
    const speed = this.shotSpeed;
    this.charging = false;
    this.charge = 0;
    this.chargeTime = 0;
    return speed;
  }

  cancelCharge(): void {
    this.charging = false;
    this.charge = 0;
    this.chargeTime = 0;
  }

  update(dt: number, ballPosition: THREE.Vector3, surfaceResistance: number): void {
    if (this.charging) {
      this.chargeTime += dt;
      this.charge =
        this.chargeTime <= CHARGE_RISE
          ? (this.chargeTime / CHARGE_RISE) ** RISE_CURVE
          : clamp01(1 - (this.chargeTime - CHARGE_RISE) / CHARGE_FALL);
    }

    // The meter is smoothed for display only. `charge` stays exact so the shot
    // the player gets is the one the bar was showing at the instant of release,
    // not a damped approximation trailing behind it.
    this.displayedCharge = damp(this.displayedCharge, this.charge, 26, dt);
    this.scroll = (this.scroll + dt * 1.6) % 1;

    if (!this.group.visible) return;

    const direction = this.direction(this.dirVec);
    const speed = this.shotSpeed;

    // Roll distance under exponential decay: ∫v₀·e^(−kt) dt = v₀/k.
    const reach = Math.min(speed / Math.max(surfaceResistance, 0.25), 26);

    this.quaternion.identity();
    let placed = 0;
    let stopped = false;
    const stopPoint = this.stopPoint.copy(ballPosition);

    for (let i = 0; i < this.dotCount; i++) {
      // Dots scroll toward the target to communicate direction, not just heading.
      const t = ((i + this.scroll) / this.dotCount);
      const distance = 0.42 + t * reach;

      const x = ballPosition.x + direction.x * distance;
      const z = ballPosition.z + direction.z * distance;

      if (!stopped) {
        // Probe from above so the dot lands on whatever surface exists here.
        const probe = this.physics.probeSurface(
          this.probeOrigin.set(x, ballPosition.y + 1.2, z),
          4.5,
        );
        if (!probe.hit) {
          // A ledge: everything beyond this point is unknown, so stop drawing.
          stopped = true;
        } else {
          stopPoint.set(x, probe.point.y + 0.05, z);
          this.matrix.compose(
            stopPoint,
            this.quaternion,
            this.scale.setScalar(1 - t * 0.45),
          );
          this.dots.setMatrixAt(placed, this.matrix);
          // Fade from the power colour at the ball to white at the far end.
          this.color.setHex(this.theme.accent).lerp(AimSystem.WHITE, t).multiplyScalar(1 - t * 0.35);
          this.dots.setColorAt(placed, this.color);
          placed++;
        }
      }
    }

    // Park unused instances rather than resizing the buffer. The scale is tiny
    // but deliberately non-zero: a zero-scale matrix is singular, and the
    // shader's `normalize(mat3(model) * normal)` would produce NaN from it.
    for (let i = placed; i < this.dotCount; i++) {
      this.matrix.compose(ballPosition, this.quaternion, this.scale.setScalar(1e-4));
      this.dots.setMatrixAt(i, this.matrix);
    }

    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;

    this.ring.position.copy(stopPoint);
    this.ring.position.y += 0.01;
    const pulse = this.charging ? 1 + Math.sin(performance.now() * 0.012) * 0.12 : 1;
    this.ring.scale.setScalar((0.85 + this.displayedCharge * 0.7) * pulse);
    this.ringMaterial.setOpacity(0.35 + this.displayedCharge * 0.5);
    this.dotMaterial.setOpacity(0.55 + this.displayedCharge * 0.45);
  }

  dispose(): void {
    this.dots.geometry.dispose();
    this.dotMaterial.dispose();
    this.ring.geometry.dispose();
    this.ringMaterial.dispose();
    this.group.parent?.remove(this.group);
  }
}
