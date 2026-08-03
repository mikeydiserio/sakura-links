import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CelMaterial } from '../render/CelMaterial';
import { addOutline } from '../render/OutlineMaterial';
import { ballTexture, radialTexture } from '../render/TextureFactory';
import { clamp, clamp01, damp } from '../util/math';
import type { PhysicsWorld, SurfaceKind } from '../physics/PhysicsWorld';
import type { Theme } from '../render/Palette';

export const BALL_RADIUS = 0.18;

/** How fast a surface bleeds speed out of a rolling ball, per second. */
const ROLL_RESISTANCE: Record<SurfaceKind, number> = {
  green: 0.95,
  fairway: 1.15,
  sand: 6.2,
  ice: 0.12,
  metal: 0.55,
  platform: 0.7,
  wood: 0.85,
  wall: 0.95,
  boost: 0.4,
};

/**
 * The player's ball: physics body, visual mesh, squash-and-stretch, trail and
 * the rolling model that makes it *feel* like a golf ball.
 *
 * ### Why rolling resistance is applied manually
 * cannon's Coulomb friction resists sliding, not rolling. Left to it alone, a
 * sphere on a flat plane keeps almost all of its energy and creeps for a very
 * long time — which is physically defensible and terrible to play. Instead the
 * ball raycasts down each frame to identify its surface and applies an explicit
 * exponential velocity decay. That single change is what gives each surface a
 * distinct personality (sand grabs, ice refuses to let go) and guarantees the
 * ball always settles, which the turn loop depends on.
 */
export class Ball {
  readonly group = new THREE.Group();
  readonly body: CANNON.Body;

  /** Surface the ball is currently rolling on; drives audio and particles. */
  surface: SurfaceKind = 'green';
  grounded = false;

  private readonly mesh: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly material: CelMaterial;

  private squash = 0;
  private restTimer = 0;
  private lastSpeed = 0;

  // Scratch objects. `posVec` is kept separate from `tmpVec` so a caller holding
  // the result of `position` cannot have it stomped by an internal calculation.
  private readonly posVec = new THREE.Vector3();
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  private static readonly IDENTITY = new THREE.Quaternion();

  constructor(
    private readonly physics: PhysicsWorld,
    theme: Theme,
    color: THREE.ColorRepresentation = 0xffffff,
  ) {
    this.material = new CelMaterial({
      color,
      map: ballTexture(),
      mapScale: [1, 1],
      bands: 4,
      specular: 0.55,
      rimColor: theme.rim,
      rimStrength: 0.5,
      rimPower: 2.2,
      shadowTint: 0.2,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 20, 14), this.material);
    this.mesh.name = 'ball';
    this.group.add(this.mesh);
    addOutline(this.mesh, { color: theme.ink, pixels: 2.6 });

    // Blob shadow. Real shadow maps would fight the flat cel lighting; a
    // projected disc reads better and costs one transparent quad.
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialTexture('rgba(0,0,0,0.42)', 'rgba(0,0,0,0)'),
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;

    this.body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Sphere(BALL_RADIUS),
      material: physics.materials.ball,
      // A little linear damping stands in for air drag on long carries; the
      // surface model handles everything on the ground.
      linearDamping: 0.06,
      angularDamping: 0.35,
      allowSleep: false,
    });
    // Tunnelling is handled by the world's 120 Hz sub-stepping plus the ball's
    // speed clamp rather than continuous collision detection, which cannon-es
    // does not expose for spheres.
    physics.world.addBody(this.body);
  }

  /** The shadow lives in world space, so the scene owns it rather than the group. */
  get shadowMesh(): THREE.Mesh {
    return this.shadow;
  }

  get position(): THREE.Vector3 {
    return this.posVec.set(this.body.position.x, this.body.position.y, this.body.position.z);
  }

  get speed(): number {
    return this.body.velocity.length();
  }

  get visible(): boolean {
    return this.group.visible;
  }

  set visible(value: boolean) {
    this.group.visible = value;
    this.shadow.visible = value;
  }

  reset(x: number, y: number, z: number): void {
    // Sinking a putt switches the body to KINEMATIC so the drop into the cup can
    // be animated without the solver fighting it. Restoring dynamics belongs
    // here rather than only in the hole teardown: `reset` is the one call that
    // means "this ball is going back into play", and any path that reaches it
    // with a still-kinematic body leaves a ball that ignores gravity and every
    // collision — it hangs in the air and no stroke can move it. Pressing R
    // during the sink animation did exactly that.
    if (this.body.type !== CANNON.Body.DYNAMIC) {
      this.body.type = CANNON.Body.DYNAMIC;
      this.body.updateMassProperties();
    }

    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.force.setZero();
    this.body.torque.setZero();
    this.body.position.set(x, y, z);
    this.body.quaternion.set(0, 0, 0, 1);
    this.body.wakeUp();
    this.restTimer = 0;
    this.squash = 0;
    this.group.position.set(x, y, z);
    this.visible = true;
  }

  setColor(color: THREE.ColorRepresentation): void {
    const value = new THREE.Color(color);
    this.material.uniforms.uColor.value.copy(value);
  }

  /**
   * Applies a stroke. `direction` is normalised in XZ; `loft` adds lift.
   *
   * Loft is deliberately tiny. A putter is a ground club: at 20 units/s even a
   * 0.13 loft factor gives 2.6 units/s of lift, which arcs the ball clean over a
   * half-unit rail and out of the hole. Keeping it near zero is what makes the
   * rails behave like rails.
   */
  strike(direction: THREE.Vector3, power: number, loft = 0.02): void {
    const speed = power;
    this.body.wakeUp();
    this.body.velocity.set(direction.x * speed, speed * loft, direction.z * speed);
    // Backspin about the axis perpendicular to travel — makes the dimple band
    // rotate the right way, which is a surprisingly strong readability cue.
    this.body.angularVelocity.set(direction.z * speed * 1.4, 0, -direction.x * speed * 1.4);
    this.squash = clamp01(power / 18) * 0.9;
  }

  /** Nudges the ball toward the cup once it is close and slow — cup magnetism. */
  attractTo(target: THREE.Vector3, radius: number, dt: number): void {
    const dx = target.x - this.body.position.x;
    const dz = target.z - this.body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > radius * 2.4 || distance < 0.001) return;

    const speed = this.speed;
    if (speed > 4.5) return;

    // Strength falls off with both distance and speed: a fast ball rims out,
    // a slow one drops. That asymmetry is what makes near-misses feel earned.
    const pull = (1 - distance / (radius * 2.4)) * (1 - clamp01(speed / 4.5)) * 9 * dt;
    this.body.velocity.x += (dx / distance) * pull;
    this.body.velocity.z += (dz / distance) * pull;
  }

  /**
   * Physics-side update. Runs before the world step so decay applies to the
   * velocity the solver is about to integrate.
   */
  prePhysics(dt: number): void {
    const probe = this.physics.probeSurface(this.position, BALL_RADIUS + 0.12);
    this.grounded = probe.hit;
    if (probe.hit) this.surface = probe.surface;

    if (!this.grounded) return;

    const resistance = ROLL_RESISTANCE[this.surface] ?? 1;
    // Exponential decay is frame-rate independent and never reverses the
    // velocity the way a subtractive model can at low speed.
    const decay = Math.exp(-resistance * dt);
    this.body.velocity.x *= decay;
    this.body.velocity.z *= decay;

    // Slope assist: gravity alone barely moves a ball on a shallow tilt once
    // friction is in play, so nudge it downhill along the surface plane. Kept
    // well below gravity — this supplements the solver, it does not replace it,
    // and a larger gain turns every dome into a launch ramp.
    if (probe.normal.y < 0.999) {
      const slope = this.tmpVec
        .set(probe.normal.x, 0, probe.normal.z)
        .multiplyScalar(4 * dt);
      this.body.velocity.x += slope.x;
      this.body.velocity.z += slope.z;
    }

    // Hard stop below a threshold. Without it the ball can hover at 0.01 u/s
    // for many seconds and the player waits on nothing.
    const planar = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    if (planar < 0.16 && Math.abs(this.body.velocity.y) < 0.5) {
      this.restTimer += dt;
      if (this.restTimer > 0.22) {
        this.body.velocity.setZero();
        this.body.angularVelocity.scale(0.4, this.body.angularVelocity);
      }
    } else {
      this.restTimer = 0;
    }
  }

  /** True once the ball has settled and the player may take the next stroke. */
  get atRest(): boolean {
    return (
      this.grounded &&
      this.body.velocity.lengthSquared() < 0.02 &&
      this.body.angularVelocity.lengthSquared() < 0.9
    );
  }

  /** Visual update: transform sync, squash-and-stretch, shadow projection. */
  postPhysics(dt: number): void {
    const p = this.body.position;
    const q = this.body.quaternion;
    this.group.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);

    // Squash-and-stretch: stretch along the velocity axis, proportional to
    // speed, decaying fast so it reads as impact energy rather than a wobble.
    const speed = this.speed;
    const impact = Math.max(0, this.lastSpeed - speed);
    if (impact > 2.5) this.squash = Math.min(1, this.squash + impact * 0.045);
    this.lastSpeed = speed;

    this.squash = damp(this.squash, 0, 9, dt);
    const stretch = 1 + clamp01(speed / 20) * 0.16 + this.squash * 0.12;
    const pinch = 1 - this.squash * 0.24;

    if (speed > 0.4) {
      this.tmpVec.set(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z).normalize();
      // Align the mesh's local +Y with the travel direction, scale, then let the
      // spin quaternion ride on top via the child mesh rotation.
      this.tmpQuat.setFromUnitVectors(Ball.UP, this.tmpVec);
      this.group.quaternion.slerp(this.tmpQuat, clamp01(dt * 14));
      this.group.scale.set(pinch, stretch, pinch);
    } else {
      this.group.quaternion.slerp(Ball.IDENTITY, clamp01(dt * 8));
      this.group.scale.set(
        damp(this.group.scale.x, 1, 12, dt),
        damp(this.group.scale.y, 1, 12, dt),
        damp(this.group.scale.z, 1, 12, dt),
      );
    }

    this.updateShadow();
  }

  private updateShadow(): void {
    const probe = this.physics.probeSurface(this.position, 8);
    if (!probe.hit) {
      this.shadow.visible = false;
      return;
    }
    this.shadow.visible = this.group.visible;
    this.shadow.position.copy(probe.point);
    this.shadow.position.y += 0.012;
    // Shrink and fade with altitude so airtime is readable from the shadow alone.
    const height = clamp(probe.distance - BALL_RADIUS, 0, 5);
    const scale = clamp(1.5 - height * 0.16, 0.45, 1.5) * BALL_RADIUS * 6.5;
    this.shadow.scale.set(scale, scale, scale);
    const material = this.shadow.material as THREE.MeshBasicMaterial;
    material.opacity = clamp(1 - height * 0.16, 0.16, 1);
  }

  /** Clamps runaway speed — bumpers and boosters can otherwise compound. */
  // Headroom above MAX_SHOT_SPEED so bumpers and boosters can still add energy
  // to a full-power shot without the clamp quietly swallowing it.
  clampSpeed(max = 28): void {
    const speed = this.speed;
    if (speed > max) this.body.velocity.scale(max / speed, this.body.velocity);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.physics.world.removeBody(this.body);
  }
}
