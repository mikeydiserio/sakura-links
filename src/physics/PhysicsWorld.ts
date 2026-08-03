import * as CANNON from 'cannon-es';
import * as THREE from 'three';

/**
 * Thin, opinionated wrapper around cannon-es.
 *
 * ### Why a fixed 120 Hz sub-step
 * A putt can reach ~20 units/s while the ball is only 0.18 units across. At a
 * 60 Hz step that is a third of the ball's diameter per frame near a 0.25-thick
 * rail — comfortably inside tunnelling range. Stepping at 1/120 with up to 8
 * catch-up sub-steps keeps penetration well under the shape thickness without
 * the cost of continuous collision detection.
 *
 * ### Surfaces
 * Every static body registers a `SurfaceKind`. `probeSurface` raycasts down from
 * the ball to find what it is currently rolling on, which drives both rolling
 * resistance (see `gameplay/Ball.ts`) and the sound/particle response.
 */

export type SurfaceKind =
  | 'green'
  | 'fairway'
  | 'sand'
  | 'wall'
  | 'ice'
  | 'metal'
  | 'platform'
  | 'wood'
  | 'boost';

export interface BodyMeta {
  surface: SurfaceKind;
  /** Set for bodies that should trigger a bumper reaction rather than a wall hit. */
  bumper?: boolean;
  /** Horizontal impulse applied when the ball touches this body. */
  boost?: number;
  /** Unit direction the boost pushes along, in world XZ. */
  boostDir?: { x: number; z: number };
  /** Upward impulse applied when the ball touches it. */
  launch?: number;
  label?: string;
}

export interface SurfaceProbe {
  hit: boolean;
  surface: SurfaceKind;
  /** Distance from the ray origin to the surface. */
  distance: number;
  normal: THREE.Vector3;
  point: THREE.Vector3;
  body: CANNON.Body | null;
}

export class PhysicsWorld {
  readonly world: CANNON.World;

  readonly materials: Record<SurfaceKind | 'ball', CANNON.Material> = {
    ball: new CANNON.Material('ball'),
    green: new CANNON.Material('green'),
    fairway: new CANNON.Material('fairway'),
    sand: new CANNON.Material('sand'),
    wall: new CANNON.Material('wall'),
    ice: new CANNON.Material('ice'),
    metal: new CANNON.Material('metal'),
    platform: new CANNON.Material('platform'),
    wood: new CANNON.Material('wood'),
    boost: new CANNON.Material('boost'),
  };

  private meta = new Map<number, BodyMeta>();
  private readonly fixedStep = 1 / 120;

  /** Scratch objects — the step loop must not allocate. */
  private readonly rayFrom = new CANNON.Vec3();
  private readonly rayTo = new CANNON.Vec3();
  private readonly rayResult = new CANNON.RaycastResult();
  private readonly probeResult: SurfaceProbe = {
    hit: false,
    surface: 'green',
    distance: Infinity,
    normal: new THREE.Vector3(0, 1, 0),
    point: new THREE.Vector3(),
    body: null,
  };

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -20, 0),
    });

    // Sweep-and-prune beats the naive broadphase badly once a hole has 60+
    // static bodies, and holes routinely do.
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 12;
    (this.world.solver as CANNON.GSSolver).tolerance = 0.0005;
    this.world.defaultContactMaterial.friction = 0.25;
    this.world.defaultContactMaterial.restitution = 0.35;

    this.registerContacts();
  }

  /**
   * Contact pairs, tuned by feel rather than physical accuracy:
   * - rails are lively (0.62) so bank shots are a real tool
   * - sand kills almost all energy and grips hard
   * - ice is nearly frictionless but not bouncy
   * - bumpers exceed 1.0 restitution deliberately: an arcade bumper should add
   *   energy, and the ball's speed clamp keeps that from running away
   */
  private registerContacts(): void {
    const pair = (
      surface: SurfaceKind,
      friction: number,
      restitution: number,
    ): void => {
      this.world.addContactMaterial(
        new CANNON.ContactMaterial(this.materials.ball, this.materials[surface], {
          friction,
          restitution,
          contactEquationStiffness: 1e8,
          contactEquationRelaxation: 3,
        }),
      );
    };

    pair('green', 0.42, 0.32);
    pair('fairway', 0.5, 0.28);
    pair('sand', 0.92, 0.06);
    pair('wall', 0.16, 0.62);
    pair('ice', 0.02, 0.3);
    pair('metal', 0.12, 0.74);
    // Moving platforms are the one surface the ball has to *stay on*. Metal's
    // 0.74 restitution bounced it clear of a rising lift and its 0.12 friction
    // gave the deck nothing to drag the ball along with, so a lift could not
    // actually carry anything. Grippy and nearly dead by design.
    pair('platform', 0.62, 0.05);
    pair('wood', 0.35, 0.42);
    pair('boost', 0.3, 0.2);
  }

  register(body: CANNON.Body, meta: BodyMeta): CANNON.Body {
    this.meta.set(body.id, meta);
    body.material = this.materials[meta.surface] ?? this.materials.green;
    this.world.addBody(body);

    // Force the bounding volume to be recomputed now that the body has been
    // placed.
    //
    // cannon caches a body's AABB and only refreshes it when `aabbNeedsUpdate`
    // is set — and assigning to `body.position` cannot set that flag, because a
    // Vec3 has no change tracking. A static body built at the origin and then
    // moved therefore keeps an AABB centred on the origin forever. The
    // narrowphase still uses the real transform, so collisions *look* correct
    // wherever the broadphase happens to return the body — which is only where
    // the stale AABB overlaps the query. The symptom is geometry far from world
    // centre being silently invisible to raycasts and collision alike: balls
    // falling through floors, and surface probes reporting a void.
    body.aabbNeedsUpdate = true;
    body.updateAABB();

    // Kinematic platforms must never sleep.
    //
    // Lifts and ferries run a dwell profile that deliberately parks them,
    // motionless, at each end of their travel for a third of the cycle. The
    // world has `allowSleep` on, so cannon sees a body with zero velocity for
    // long enough and puts it to sleep — and a sleeping body is skipped by the
    // integrator, so the velocity the updater writes on the next frame is never
    // applied. The platform simply stops wherever it happened to doze off.
    //
    // The failure is worse than it sounds: a lift that falls asleep at the top
    // of its shaft leaves the upper deck permanently unreachable, so the hole
    // cannot be completed at all. Sleeping saves nothing here either — these
    // bodies are a handful per hole and are meant to be in motion.
    if (body.type === CANNON.Body.KINEMATIC) {
      body.allowSleep = false;
      body.wakeUp();
    }

    return body;
  }

  metaFor(body: CANNON.Body | null | undefined): BodyMeta | undefined {
    return body ? this.meta.get(body.id) : undefined;
  }

  // --- Shape helpers -------------------------------------------------------

  addBox(
    position: THREE.Vector3,
    halfExtents: THREE.Vector3,
    quaternion: THREE.Quaternion,
    meta: BodyMeta,
    mass = 0,
  ): CANNON.Body {
    const body = new CANNON.Body({
      mass,
      type: mass === 0 ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
      shape: new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z)),
    });
    body.position.set(position.x, position.y, position.z);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    return this.register(body, meta);
  }

  addCylinder(
    position: THREE.Vector3,
    radius: number,
    height: number,
    quaternion: THREE.Quaternion,
    meta: BodyMeta,
  ): CANNON.Body {
    const shape = new CANNON.Cylinder(radius, radius, height, 14);
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, shape });
    body.position.set(position.x, position.y, position.z);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    return this.register(body, meta);
  }

  addSphere(position: THREE.Vector3, radius: number, meta: BodyMeta): CANNON.Body {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      shape: new CANNON.Sphere(radius),
    });
    body.position.set(position.x, position.y, position.z);
    return this.register(body, meta);
  }

  /**
   * Static trimesh from a THREE geometry — used for curved greens and ramps
   * where a box stack would produce seams the ball can catch on.
   */
  addTrimesh(
    geometry: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    meta: BodyMeta,
  ): CANNON.Body {
    const baked = geometry.clone().applyMatrix4(matrix);
    const position = baked.attributes.position as THREE.BufferAttribute;
    const vertices = Array.from(position.array as Float32Array);
    const indices: number[] = [];
    if (baked.index) {
      const array = baked.index.array;
      for (let i = 0; i < array.length; i++) indices.push(array[i]);
    } else {
      for (let i = 0; i < position.count; i++) indices.push(i);
    }
    baked.dispose();

    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      shape: new CANNON.Trimesh(vertices, indices),
    });
    return this.register(body, meta);
  }

  /** Kinematic bodies are driven by velocity so friction carries the ball. */
  addKinematicBox(
    position: THREE.Vector3,
    halfExtents: THREE.Vector3,
    quaternion: THREE.Quaternion,
    meta: BodyMeta,
  ): CANNON.Body {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z)),
    });
    body.position.set(position.x, position.y, position.z);
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    return this.register(body, meta);
  }

  addKinematicCylinder(
    position: THREE.Vector3,
    radius: number,
    height: number,
    meta: BodyMeta,
  ): CANNON.Body {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Cylinder(radius, radius, height, 16),
    });
    body.position.set(position.x, position.y, position.z);
    return this.register(body, meta);
  }

  remove(body: CANNON.Body): void {
    this.meta.delete(body.id);
    this.world.removeBody(body);
  }

  /** Removes every body except the ones passed in `keep`. Used on hole teardown. */
  clear(keep: CANNON.Body[] = []): void {
    const kept = new Set(keep.map((b) => b.id));
    for (const body of [...this.world.bodies]) {
      if (kept.has(body.id)) continue;
      this.meta.delete(body.id);
      this.world.removeBody(body);
    }
  }

  /**
   * Downward raycast used to identify the surface under the ball.
   * Returns a shared, mutated result object — copy anything you need to keep.
   */
  probeSurface(origin: THREE.Vector3, distance = 0.9): SurfaceProbe {
    this.rayFrom.set(origin.x, origin.y, origin.z);
    this.rayTo.set(origin.x, origin.y - distance, origin.z);
    this.rayResult.reset();

    this.world.raycastClosest(
      this.rayFrom,
      this.rayTo,
      { skipBackfaces: true, collisionFilterMask: -1 },
      this.rayResult,
    );

    const result = this.probeResult;
    result.hit = this.rayResult.hasHit;
    result.body = this.rayResult.body ?? null;

    if (result.hit) {
      result.distance = this.rayResult.distance;
      result.normal.set(
        this.rayResult.hitNormalWorld.x,
        this.rayResult.hitNormalWorld.y,
        this.rayResult.hitNormalWorld.z,
      );
      result.point.set(
        this.rayResult.hitPointWorld.x,
        this.rayResult.hitPointWorld.y,
        this.rayResult.hitPointWorld.z,
      );
      result.surface = this.meta.get(this.rayResult.body?.id ?? -1)?.surface ?? 'green';
    } else {
      result.distance = Infinity;
      result.normal.set(0, 1, 0);
      result.surface = 'green';
    }

    return result;
  }

  step(dt: number): void {
    // Clamp the catch-up window: after a tab-switch, `dt` can be seconds long
    // and replaying all of it would fling the ball across the course. Twelve
    // sub-steps covers a 100 ms hitch at the fixed rate without falling behind,
    // which is what keeps a fast ball from skipping through a rail.
    this.world.step(this.fixedStep, Math.min(dt, 0.1), 12);
  }

  dispose(): void {
    this.clear();
    this.meta.clear();
  }
}

/** Convenience conversions between cannon and three vector types. */
export const toThree = (v: CANNON.Vec3, target: THREE.Vector3): THREE.Vector3 =>
  target.set(v.x, v.y, v.z);

export const toCannon = (v: THREE.Vector3, target: CANNON.Vec3): CANNON.Vec3 => {
  target.set(v.x, v.y, v.z);
  return target;
};

export const quatToThree = (q: CANNON.Quaternion, target: THREE.Quaternion): THREE.Quaternion =>
  target.set(q.x, q.y, q.z, q.w);
