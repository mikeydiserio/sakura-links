import * as THREE from 'three';
import { clamp, clamp01, damp, dampAngle, TAU, lerp } from '../util/math';

/**
 * Orbit camera with automatic follow, collision avoidance and cinematic framing.
 *
 * ### Behaviour by mode
 * - **Aiming** — the player owns yaw and pitch; the camera sits behind the ball
 *   looking down the aim line.
 * - **Following** — the rig eases its yaw toward the ball's travel direction and
 *   pulls back proportionally to speed, so a fast shot is framed wider.
 * - **Cinematic** — for long carries the camera lifts and leads the ball,
 *   framing the midpoint between ball and cup.
 *
 * ### Collision avoidance
 * A raycast from the focus point to the desired eye position finds the first
 * blocking surface; the camera is pulled in front of it and the recovery is
 * damped asymmetrically — snap in fast (never clip), ease out slowly (no
 * jarring push when the obstruction clears).
 */
export type CameraMode = 'aim' | 'follow' | 'cinematic' | 'overhead' | 'intro';

export interface CameraTuning {
  distance: number;
  height: number;
  pitch: number;
}

const MIN_DISTANCE = 2.6;
const MAX_DISTANCE = 14;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  yaw = 0;
  /** Default look-down angle. High enough to clear a hole's perimeter rails. */
  pitch = 0.42;

  private mode: CameraMode = 'aim';
  private distance = 6.2;
  private targetDistance = 6.2;
  private readonly focus = new THREE.Vector3();
  private readonly desiredFocus = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly shakeOffset = new THREE.Vector3();
  private occlusionDistance = MAX_DISTANCE;
  private introTimer = 0;
  private cupTarget = new THREE.Vector3();
  private occluders: THREE.Object3D[] = [];

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.15, 800);
    // Layer 1 holds sky, particles and other objects excluded from the ink
    // prepass; the main camera must still see them.
    this.camera.layers.enable(1);
  }

  setOccluders(objects: THREE.Object3D[]): void {
    this.occluders = objects;
  }

  setCupTarget(position: THREE.Vector3): void {
    this.cupTarget.copy(position);
  }

  setMode(mode: CameraMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'intro') this.introTimer = 0;
  }

  get currentMode(): CameraMode {
    return this.mode;
  }

  /** Points the camera down the line from the ball to the cup. */
  faceTarget(ball: THREE.Vector3, target: THREE.Vector3): void {
    this.yaw = Math.atan2(ball.x - target.x, ball.z - target.z);
  }

  orbit(deltaYaw: number, deltaPitch: number): void {
    this.yaw = (this.yaw + deltaYaw) % TAU;
    // Clamp well short of the poles: looking straight down loses the aim line,
    // looking straight up puts the camera under the green.
    this.pitch = clamp(this.pitch + deltaPitch, 0.06, 1.25);
  }

  zoom(delta: number): void {
    this.targetDistance = clamp(this.targetDistance + delta, MIN_DISTANCE, MAX_DISTANCE);
  }

  resetZoom(): void {
    this.targetDistance = 6.2;
    this.pitch = 0.42;
  }

  addShake(offset: THREE.Vector3): void {
    this.shakeOffset.copy(offset);
  }

  update(dt: number, ballPosition: THREE.Vector3, ballVelocity: THREE.Vector3, speed: number): void {
    this.desiredFocus.copy(ballPosition);
    this.desiredFocus.y += 0.45;

    let distance = this.targetDistance;
    let pitch = this.pitch;

    switch (this.mode) {
      case 'follow': {
        // Ease the yaw behind the ball's motion so the player keeps a sense of
        // direction, but only once the ball is genuinely travelling.
        if (speed > 1.4) {
          const travelYaw = Math.atan2(-ballVelocity.x, -ballVelocity.z);
          this.yaw = dampAngle(this.yaw, travelYaw, 1.4, dt);
        }
        distance = this.targetDistance + clamp01(speed / 18) * 3.4;
        pitch = this.pitch + clamp01(speed / 22) * 0.16;
        break;
      }

      case 'cinematic': {
        // Frame the midpoint between ball and cup and lift for a wide shot.
        this.desiredFocus.lerp(this.cupTarget, 0.32);
        this.desiredFocus.y += 1.1;
        distance = this.targetDistance + 4.2;
        pitch = clamp(this.pitch + 0.22, 0.2, 1.1);
        break;
      }

      case 'overhead': {
        distance = 13;
        pitch = 1.22;
        break;
      }

      case 'intro': {
        // Slow orbit around the hole while the intro card is up.
        this.introTimer += dt;
        this.yaw += dt * 0.22;
        this.desiredFocus.lerp(this.cupTarget, 0.45);
        this.desiredFocus.y += 1.4;
        distance = lerp(14, 9, clamp01(this.introTimer / 3));
        pitch = 0.5;
        break;
      }

      default:
        break;
    }

    // Focus tracks the ball with a soft spring; a hard copy would transmit every
    // physics jitter into the view.
    this.focus.x = damp(this.focus.x, this.desiredFocus.x, 9, dt);
    this.focus.y = damp(this.focus.y, this.desiredFocus.y, 7, dt);
    this.focus.z = damp(this.focus.z, this.desiredFocus.z, 9, dt);

    this.distance = damp(this.distance, distance, 6, dt);

    const cosPitch = Math.cos(pitch);
    const offsetX = Math.sin(this.yaw) * cosPitch;
    const offsetZ = Math.cos(this.yaw) * cosPitch;
    const offsetY = Math.sin(pitch);

    const allowed = this.resolveOcclusion(offsetX, offsetY, offsetZ, dt);

    this.eye.set(
      this.focus.x + offsetX * allowed,
      this.focus.y + offsetY * allowed,
      this.focus.z + offsetZ * allowed,
    );

    this.camera.position.copy(this.eye).add(this.shakeOffset);
    this.camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
    // The shake is consumed each frame; `Juice` re-supplies it while active.
    this.shakeOffset.multiplyScalar(0);
  }

  /**
   * Casts from the focus toward the eye and returns the largest safe distance.
   * Recovery is asymmetric on purpose: pull in immediately, ease out gently.
   */
  private resolveOcclusion(dx: number, dy: number, dz: number, dt: number): number {
    if (this.occluders.length === 0) return this.distance;

    this.raycaster.set(this.focus, new THREE.Vector3(dx, dy, dz).normalize());
    this.raycaster.far = this.distance;
    this.raycaster.near = 0;
    const hits = this.raycaster.intersectObjects(this.occluders, true);

    let limit = this.distance;
    for (const hit of hits) {
      // Outline shells are back-facing duplicates and would report false hits.
      if (hit.object.userData.outline) continue;
      limit = Math.max(MIN_DISTANCE * 0.7, hit.distance - 0.35);
      break;
    }

    this.occlusionDistance =
      limit < this.occlusionDistance
        ? limit
        : damp(this.occlusionDistance, limit, 3.5, dt);

    return Math.min(this.distance, this.occlusionDistance);
  }

  /** Immediately snaps the rig to the ball — used when a hole loads. */
  snapTo(ballPosition: THREE.Vector3): void {
    this.focus.copy(ballPosition);
    this.focus.y += 0.45;
    this.distance = this.targetDistance;
    this.occlusionDistance = this.targetDistance;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
