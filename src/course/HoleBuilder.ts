import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CelMaterial } from '../render/CelMaterial';
import { addOutline } from '../render/OutlineMaterial';
import {
  grassTexture,
  sandTexture,
  stoneTexture,
  woodTexture,
  gridTexture,
  radialTexture,
} from '../render/TextureFactory';
import {
  unitBox,
  unitCylinder,
  unitSphere,
  chevronGeometry,
  bladeGeometry,
  groundPlane,
} from '../render/GeometryCache';
import { mergeGeometries } from '../world/Environment';
import { Water } from '../world/Water';
import { buildTree, buildGrassField, buildFlowerField, buildRockField } from '../world/Foliage';
import { buildProp, buildPin } from './Props';
import { disposeObject } from '../util/dispose';
import { TAU, clamp01 } from '../util/math';
import type { PhysicsWorld, SurfaceKind } from '../physics/PhysicsWorld';
import type { Theme } from '../render/Palette';
import { LAYER_NO_EDGE } from '../render/Renderer';
import type { HoleDef, Piece, PropKind, TilePiece } from './types';

/**
 * Translates a `HoleDef` into meshes, collision bodies and behaviour.
 *
 * ### Draw-call strategy
 * Static geometry is bucketed by material and merged into one mesh per bucket,
 * so a hole with 40 tiles and 90 wall segments still renders in a handful of
 * calls (plus one ink-outline call each). Inverted-hull outlines survive the
 * merge: every box's back faces are still enclosed by its own front faces, so
 * each individual box keeps its own silhouette.
 *
 * ### Teardown
 * Everything built here is owned by the returned `BuiltHole`. `dispose()` frees
 * geometry, materials and physics bodies. Shared resources — cached textures and
 * unit primitives — are flagged and skipped.
 */

export type Updater = (dt: number, elapsed: number) => void;

export interface Hazard {
  type: 'water';
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface BuiltHole {
  group: THREE.Group;
  updaters: Updater[];
  hazards: Hazard[];
  waters: Water[];
  cupPosition: THREE.Vector3;
  cupRadius: number;
  /** Meshes the camera should avoid clipping through. */
  occluders: THREE.Object3D[];
  /** Reaction hooks keyed by physics body id — bumpers pop, pads flash. */
  react(bodyId: number, strength: number): void;
  dispose(): void;
}

/**
 * Rail height.
 *
 * Sized from the worst case rather than by eye: a ball leaving a ramp of angle
 * θ at the launch speed carries `v·sinθ` upward and rises `(v·sinθ)² / 2g`. At
 * `MAX_SHOT_SPEED` (26) and the steepest authored ramp (0.24 rad) that is
 * `(26·0.2377)² / 40 ≈ 0.96`, so 1.05 contains it with a little margin.
 *
 * The number is kept as low as that worst case allows, and not a centimetre
 * lower. The camera sits behind the ball at roughly ball height, so the near
 * rail is the closest thing to the lens and every centimetre of it eats the
 * bottom of the frame — at 1.15 it filled a third of the screen with brickwork.
 * This constant and `MAX_SHOT_SPEED` are a matched pair: raising either alone
 * either lets full-power shots fly out of the course, or walls the player in for
 * no reason.
 */
const DEFAULT_WALL_HEIGHT = 1.05;
const WALL_THICKNESS = 0.26;
const TILE_THICKNESS = 0.9;
const THIN_THICKNESS = 0.3;
export const CUP_RADIUS = 0.34;

interface Bucket {
  geometries: THREE.BufferGeometry[];
  material: CelMaterial;
  outline: boolean;
  pixels: number;
}

/**
 * Motion profile for lifts and ferries: hold, travel, hold, travel.
 *
 * A sine wave spends as much time mid-travel as it does at either end, so a
 * platform is almost never where the player needs it and a mistimed approach is
 * a guaranteed penalty rather than a near miss. This profile parks the platform
 * at each end for 35% of the cycle and moves briskly between, which turns the
 * mechanic from a coin flip into a rhythm the player can read.
 *
 * The travel fraction is not free. A platform following a smoothstep over a
 * fraction `f` of period `P` across height `h` peaks at `6h / (fP)²` of
 * deceleration as it arrives. Once that exceeds gravity the platform is falling
 * away from the ball faster than the ball can follow, and a lift arriving at the
 * top flings its passenger into the air instead of delivering it. At h = 2.6,
 * P = 5 and g = 20 the break-even fraction is about 0.18, so the original 0.15
 * launched the ball on every single ride. 0.24 leaves a comfortable margin and
 * still parks the platform for over half of each cycle.
 *
 * Returns 0 at the low/near end and 1 at the high/far end.
 */
const DWELL_TRAVEL = 0.24;

function dwellProfile(phase: number): number {
  const t = ((phase % 1) + 1) % 1;
  const rest = 0.5 - DWELL_TRAVEL;
  if (t < rest) return 0;
  if (t < 0.5) return THREE.MathUtils.smoothstep((t - rest) / DWELL_TRAVEL, 0, 1);
  if (t < 0.5 + rest) return 1;
  return 1 - THREE.MathUtils.smoothstep((t - 0.5 - rest) / DWELL_TRAVEL, 0, 1);
}

/**
 * Texture repeats per world unit on horizontal play surfaces. Floor tiles reach
 * it via `scaleUV(slab, w / 4, d / 4)`; contours compute planar UVs directly.
 * Both must agree or the mown stripes break at the join.
 */
const CONTOUR_UV_SCALE = 1 / 4;

/** Multiplies a geometry's UVs so merged surfaces keep a constant texel density. */
function scaleUV(geometry: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = geometry.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geometry;
}

export class HoleBuilder {
  private buckets = new Map<string, Bucket>();
  private group = new THREE.Group();
  private updaters: Updater[] = [];
  private hazards: Hazard[] = [];
  private waters: Water[] = [];
  private occluders: THREE.Object3D[] = [];
  private bodies: CANNON.Body[] = [];
  private reactors = new Map<number, (strength: number) => void>();
  /** Ground-shadow discs, collected during build and instanced in one draw. */
  private groundShadows: Array<{ x: number; y: number; z: number; radius: number }> = [];

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly theme: Theme,
  ) {}

  build(hole: HoleDef): BuiltHole {
    this.group.name = `hole:${hole.id}`;

    for (const piece of hole.pieces) this.addPiece(piece);

    this.flushBuckets();
    this.buildGroundShadows();
    this.buildCup(hole);
    this.buildTee(hole);

    const built: BuiltHole = {
      group: this.group,
      updaters: this.updaters,
      hazards: this.hazards,
      waters: this.waters,
      cupPosition: new THREE.Vector3(hole.cup.x, hole.cup.y, hole.cup.z),
      cupRadius: CUP_RADIUS,
      occluders: this.occluders,
      react: (bodyId, strength) => this.reactors.get(bodyId)?.(strength),
      dispose: () => {
        for (const water of this.waters) water.dispose();
        for (const body of this.bodies) this.physics.remove(body);
        disposeObject(this.group);
        this.waters = [];
        this.bodies = [];
        this.updaters = [];
        this.reactors.clear();
      },
    };

    return built;
  }

  // --- Bucketed static geometry -------------------------------------------

  private bucket(key: string, make: () => Bucket): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = make();
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private surfaceBucket(surface: SurfaceKind, color: number): Bucket {
    const key = `surface:${surface}:${color}`;
    return this.bucket(key, () => ({
      geometries: [],
      material: this.surfaceMaterial(surface, color, true),
      outline: true,
      pixels: surface === 'wall' ? 2.6 : 3,
    }));
  }

  /**
   * Adds a slab or wall to its merged bucket, first baking a facing-based tone
   * into its vertex colours.
   *
   * The wrapped diffuse that makes cel shading readable also compresses it: a
   * downward-facing face still lands only one band below an upward one, so a
   * floating island's underside comes out nearly as bright as its lawn and the
   * whole thing reads as a slab of grass hanging in the air. Darkening by
   * orientation at build time restores the separation, and because it rides on
   * the vertex colours it survives the merge and costs no extra draw call.
   */
  private pushSurface(surface: SurfaceKind, color: number, geometry: THREE.BufferGeometry): void {
    const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined;
    if (normal) {
      const tint = new Float32Array(normal.count * 3);
      for (let i = 0; i < normal.count; i++) {
        const ny = normal.getY(i);
        // 1.0 straight up, 0.84 vertical, 0.6 straight down. The downward step
        // has to stay modest: on the pale Sky Islands palette a heavier one took
        // island undersides to near-black against a near-white sky, which reads
        // as a rendering fault rather than as shading.
        const shade = ny >= 0 ? 0.84 + 0.16 * ny : 0.84 + 0.24 * ny;
        tint[i * 3] = shade;
        tint[i * 3 + 1] = shade;
        tint[i * 3 + 2] = shade;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    }
    this.surfaceBucket(surface, color).geometries.push(geometry);
  }

  private surfaceMaterial(
    surface: SurfaceKind,
    color: number,
    vertexColors = false,
  ): CelMaterial {
    const theme = this.theme;
    const common = {
      bands: 4 as const,
      rimColor: theme.rim,
      rimStrength: 0.22,
      shadowTint: 0.28,
      vertexColors,
    };

    // Every procedural texture below is *generated from* `color` — the canvas is
    // filled with it before any detail is drawn. The cel shader then computes
    // `base = uColor * map`, so passing the same colour again squares it: a
    // mid-green becomes a dark, over-saturated green and the whole course reads
    // muddy. Mapped surfaces therefore pass white and let the map carry the hue;
    // only unmapped surfaces (ice, metal, boost) tint through `uColor`.
    const TINTED_BY_MAP = 0xffffff;

    switch (surface) {
      case 'sand':
        return new CelMaterial({
          ...common,
          color: TINTED_BY_MAP,
          map: sandTexture(color),
          specular: 0,
          shadowTint: 0.2,
        });
      case 'wall':
        return new CelMaterial({
          ...common,
          color: TINTED_BY_MAP,
          map: theme.id === 'neon' ? gridTexture(color, theme.accent) : stoneTexture(color, theme.wallTop),
          specular: theme.id === 'neon' ? 0.35 : 0.08,
          rimStrength: theme.id === 'neon' ? 0.6 : 0.28,
          emissive: theme.id === 'neon' ? theme.accent : 0x000000,
          emissiveStrength: theme.id === 'neon' ? 0.12 : 0,
        });
      case 'wood':
        return new CelMaterial({
          ...common,
          color: TINTED_BY_MAP,
          map: woodTexture(color),
          specular: 0.12,
        });
      case 'ice':
        return new CelMaterial({
          ...common,
          color,
          specular: 0.75,
          rimStrength: 0.55,
          opacity: 0.9,
          transparent: true,
        });
      case 'metal':
        return new CelMaterial({ ...common, color, specular: 0.65, rimStrength: 0.5, bands: 3 });
      case 'boost':
        return new CelMaterial({
          ...common,
          color,
          emissive: color,
          emissiveStrength: 1.2,
          specular: 0.4,
        });
      default:
        return new CelMaterial({
          ...common,
          color: TINTED_BY_MAP,
          map:
            theme.id === 'neon'
              ? gridTexture(color, theme.accent)
              : grassTexture(color, theme.greenAlt),
          specular: 0.05,
        });
    }
  }

  /** Merges each bucket into a single mesh and attaches its ink outline. */
  private flushBuckets(): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.geometries.length === 0) continue;
      const merged = mergeGeometries(bucket.geometries);
      bucket.geometries.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.name = key;
      this.group.add(mesh);

      // Rails are knee-high and ring every hole, so a camera behind the tee is
      // always looking over one. Treating them as occluders makes the rig dolly
      // in to a couple of units and bury itself in the green. Floors, platforms
      // and props still block the view; perimeter walls deliberately do not.
      if (!key.startsWith('surface:wall') && !key.startsWith('glowrail')) {
        this.occluders.push(mesh);
      }

      if (bucket.outline) addOutline(mesh, { color: this.theme.ink, pixels: bucket.pixels });
    }
    this.buckets.clear();
  }

  // --- Pieces ---------------------------------------------------------------

  private addPiece(piece: Piece): void {
    switch (piece.kind) {
      case 'tile':
        this.addTile(piece);
        break;
      case 'bump':
        this.addBump(piece);
        break;
      case 'rail':
        this.addRail(piece);
        break;
      case 'water':
        this.addWater(piece);
        break;
      case 'bumper':
        this.addBumper(piece);
        break;
      case 'windmill':
        this.addWindmill(piece);
        break;
      case 'spinner':
        this.addSpinner(piece);
        break;
      case 'elevator':
        this.addElevator(piece);
        break;
      case 'mover':
        this.addMover(piece);
        break;
      case 'rotator':
        this.addRotator(piece);
        break;
      case 'jump':
        this.addJumpPad(piece);
        break;
      case 'booster':
        this.addBooster(piece);
        break;
      case 'prop':
        this.addProp(piece);
        break;
      case 'tree':
        this.addTree(piece);
        break;
      case 'scatter':
        this.addScatter(piece);
        break;
      default:
        break;
    }
  }

  /**
   * A tile is a slab plus up to four rails. Both are authored relative to the
   * tile's *top surface*, then transformed as one rigid frame — which is what
   * lets a tilted ramp keep its walls attached at the right angle for free.
   */
  private addTile(piece: TilePiece): void {
    const {
      x,
      z,
      w,
      d,
      y = 0,
      rotY = 0,
      tilt = 0,
      roll = 0,
      walls = 'NSEW',
      surface = 'green',
      thin = false,
      wallHeight = DEFAULT_WALL_HEIGHT,
    } = piece;

    const color = piece.color ?? this.defaultColor(surface);
    const thickness = thin ? THIN_THICKNESS : TILE_THICKNESS;

    // YXZ so yaw is applied first and the tilt/roll stay in the tile's own frame.
    const euler = new THREE.Euler(tilt, rotY, roll, 'YXZ');
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    const top = new THREE.Vector3(x, y, z);

    const localToWorld = (local: THREE.Vector3): THREE.Vector3 =>
      local.clone().applyQuaternion(quaternion).add(top);

    // Slab.
    const slabCenter = localToWorld(new THREE.Vector3(0, -thickness / 2, 0));
    const slab = new THREE.BoxGeometry(w, thickness, d);
    scaleUV(slab, w / 4, d / 4);
    slab.applyMatrix4(new THREE.Matrix4().compose(slabCenter, quaternion, new THREE.Vector3(1, 1, 1)));
    this.pushSurface(surface, color, slab);

    this.bodies.push(
      this.physics.addBox(
        slabCenter,
        new THREE.Vector3(w / 2, thickness / 2, d / 2),
        quaternion,
        { surface, label: 'tile' },
      ),
    );

    // Rails. Each is described in the tile's local top-surface frame.
    const wallColor = this.theme.wall;
    const specs: Array<{ letter: string; offset: THREE.Vector3; size: THREE.Vector3 }> = [
      {
        letter: 'N',
        offset: new THREE.Vector3(0, wallHeight / 2, -(d / 2 + WALL_THICKNESS / 2)),
        size: new THREE.Vector3(w + WALL_THICKNESS * 2, wallHeight, WALL_THICKNESS),
      },
      {
        letter: 'S',
        offset: new THREE.Vector3(0, wallHeight / 2, d / 2 + WALL_THICKNESS / 2),
        size: new THREE.Vector3(w + WALL_THICKNESS * 2, wallHeight, WALL_THICKNESS),
      },
      {
        letter: 'E',
        offset: new THREE.Vector3(w / 2 + WALL_THICKNESS / 2, wallHeight / 2, 0),
        size: new THREE.Vector3(WALL_THICKNESS, wallHeight, d),
      },
      {
        letter: 'W',
        offset: new THREE.Vector3(-(w / 2 + WALL_THICKNESS / 2), wallHeight / 2, 0),
        size: new THREE.Vector3(WALL_THICKNESS, wallHeight, d),
      },
    ];

    for (const spec of specs) {
      if (!walls.includes(spec.letter)) continue;
      const center = localToWorld(spec.offset);
      const geometry = new THREE.BoxGeometry(spec.size.x, spec.size.y, spec.size.z);
      scaleUV(geometry, Math.max(spec.size.x, spec.size.z) / 2, 1);
      geometry.applyMatrix4(
        new THREE.Matrix4().compose(center, quaternion, new THREE.Vector3(1, 1, 1)),
      );
      this.pushSurface('wall', wallColor, geometry);

      this.bodies.push(
        this.physics.addBox(
          center,
          new THREE.Vector3(spec.size.x / 2, spec.size.y / 2, spec.size.z / 2),
          quaternion,
          { surface: 'wall', label: 'rail' },
        ),
      );
    }
  }

  /**
   * A dome (positive height) or a dish (negative height).
   *
   * ### Why a spherical cap rather than a trimesh
   * A dome is a *convex* solid, so it can be collided as a plain sphere — the
   * single most robust primitive cannon offers. Sphere-vs-trimesh is the weakest
   * pair in the engine: a ball crossing a triangle faster than its own radius
   * per sub-step can pass straight through, which in testing dropped the ball
   * out of the world and cost a phantom penalty stroke.
   *
   * Given a footprint radius `R` and apex height `h`, the sphere through both
   * the rim and the apex has radius `ρ = (R² + h²) / 2h`, centred `ρ - h` below
   * the apex. The visual mesh is generated from that same sphere, so what the
   * player sees and what the ball rolls on are the same surface by construction.
   *
   * Dishes are visual only. An inverted cap is not convex, and a 15 cm
   * depression contributes nothing mechanically that the cup's own magnetism
   * does not already provide — so it is painted, not simulated.
   */
  private addBump(piece: Extract<Piece, { kind: 'bump' }>): void {
    const { x, z, y = 0, radius, height, surface = 'green' } = piece;

    // A contour is a bulge in the fairway, not a separate object sitting on it,
    // so it takes the fairway's exact colour — and therefore the exact same
    // texture instance. An earlier version tinted the colour to signal
    // elevation, which generated a *second* grass texture whose mown stripes
    // landed at a different scale and phase from the floor's; the mismatch read
    // as a flat painted disc rather than a rise.
    const color = piece.color ?? this.defaultColor(surface);

    // A ring rather than a circle: RingGeometry tessellates radially, which is
    // exactly the topology a dome profile needs. The centre hole is 1 mm across
    // — far smaller than the ball, so it is not reachable.
    const segments = 24;
    const rings = 8;
    const geometry = new THREE.RingGeometry(0.001, radius, segments, rings);
    geometry.rotateX(-Math.PI / 2);

    const isDome = height > 0;
    // Cap sphere radius, and how far its centre sits below the apex.
    const sphereRadius = isDome ? (radius * radius + height * height) / (2 * height) : 0;
    const centreDrop = sphereRadius - height;

    const position = geometry.attributes.position as THREE.BufferAttribute;
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    // Elevation is carried by vertex colour instead of by the base colour.
    // Values deliberately exceed 1 at the apex: the attribute is raw floats, so
    // a rise can genuinely brighten rather than only being able to darken.
    const tint = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i);
      const pz = position.getZ(i);
      const r = Math.min(radius, Math.hypot(px, pz));
      const t = clamp01(r / radius);

      if (isDome) {
        // Exactly the sphere the physics body uses.
        position.setY(i, Math.sqrt(Math.max(0, sphereRadius * sphereRadius - r * r)) - centreDrop);
      } else {
        // Decorative dish: a cosine depression, flat at the rim.
        position.setY(i, (Math.cos(t * Math.PI) * 0.5 + 0.5) * height);
      }

      // World-space planar UVs at CONTOUR_UV_SCALE, which is the cadence every
      // floor tile uses. Matching both scale and phase is what lets the mown
      // stripes run over the contour unbroken.
      uv.setXY(i, (x + px) * CONTOUR_UV_SCALE, (z + pz) * CONTOUR_UV_SCALE);

      // Smoothstep so the gradient eases out at the rim and leaves no seam
      // against the surrounding fairway.
      const centreWeight = 1 - t * t * (3 - 2 * t);
      const shade = isDome ? 1 + 0.2 * centreWeight : 1 - 0.24 * centreWeight;
      tint[i * 3] = shade;
      tint[i * 3 + 1] = shade;
      tint[i * 3 + 2] = shade;
    }

    geometry.computeVertexNormals();
    geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    geometry.translate(x, y + (isDome ? 0 : 0.006), z);

    // Contours live in their own un-outlined bucket. An inverted-hull silhouette
    // around a shape that sits flush with the ground reads as a crater rim; the
    // screen-space Sobel pass still picks up the crease, which is the correct
    // line for a surface feature.
    this.bucket(`contour:${surface}:${color}`, () => ({
      geometries: [],
      material: this.surfaceMaterial(surface, color, true),
      outline: false,
      pixels: 0,
    })).geometries.push(geometry);

    if (isDome) {
      this.bodies.push(
        this.physics.addSphere(
          new THREE.Vector3(x, y + height - sphereRadius, z),
          sphereRadius,
          { surface, label: 'bump' },
        ),
      );
    }
  }

  private addRail(piece: Extract<Piece, { kind: 'rail' }>): void {
    const {
      points,
      y = 0,
      height = DEFAULT_WALL_HEIGHT,
      thickness = WALL_THICKNESS,
      closed = false,
      glow = false,
    } = piece;
    const color = piece.color ?? this.theme.wall;
    if (points.length < 2) return;

    const list = closed ? [...points, points[0]] : points;

    for (let i = 0; i < list.length - 1; i++) {
      const [x0, z0] = list[i];
      const [x1, z1] = list[i + 1];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const length = Math.hypot(dx, dz);
      if (length < 0.001) continue;

      const angle = Math.atan2(dx, dz);
      const center = new THREE.Vector3((x0 + x1) / 2, y + height / 2, (z0 + z1) / 2);
      const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));

      // Overlap segments by the wall thickness so corners have no gap.
      const geometry = new THREE.BoxGeometry(thickness, height, length + thickness);
      scaleUV(geometry, length / 2, 1);
      geometry.applyMatrix4(
        new THREE.Matrix4().compose(center, quaternion, new THREE.Vector3(1, 1, 1)),
      );

      if (glow) {
        this.bucket(`glowrail:${color}`, () => ({
          geometries: [],
          material: new CelMaterial({
            color,
            emissive: color,
            emissiveStrength: 1.4,
            bands: 3,
            specular: 0.5,
            rimColor: 0xffffff,
            rimStrength: 0.7,
          }),
          outline: true,
          pixels: 2.4,
        })).geometries.push(geometry);
      } else {
        this.pushSurface('wall', color, geometry);
      }

      this.bodies.push(
        this.physics.addBox(
          center,
          new THREE.Vector3(thickness / 2, height / 2, (length + thickness) / 2),
          quaternion,
          { surface: glow ? 'metal' : 'wall', label: 'rail' },
        ),
      );
    }
  }

  private addWater(piece: Extract<Piece, { kind: 'water' }>): void {
    const { x, z, w, d, y = -0.1 } = piece;
    const water = new Water({ x, y, z, width: w, depth: d }, this.theme);
    this.group.add(water.mesh);
    this.waters.push(water);

    // Penalty volume sits just under the surface so a ball skimming the very
    // top of a wave is not punished for a shot that visually cleared it.
    this.hazards.push({
      type: 'water',
      min: new THREE.Vector3(x - w / 2, y - 6, z - d / 2),
      max: new THREE.Vector3(x + w / 2, y + 0.16, z + d / 2),
    });
  }

  private addBumper(piece: Extract<Piece, { kind: 'bumper' }>): void {
    const { x, z, y = 0, radius = 0.45 } = piece;
    const color = piece.color ?? this.theme.accentAlt;
    const height = 0.7;

    const group = new THREE.Group();
    group.position.set(x, y, z);

    const body = new THREE.Mesh(
      unitCylinder(18),
      new CelMaterial({
        color,
        emissive: color,
        emissiveStrength: this.theme.id === 'neon' ? 0.9 : 0.25,
        bands: 3,
        specular: 0.5,
        rimColor: 0xffffff,
        rimStrength: 0.6,
      }),
    );
    body.scale.set(radius, height, radius);
    body.position.y = height / 2;
    group.add(body);
    addOutline(body, { color: this.theme.ink, pixels: 3 });

    const cap = new THREE.Mesh(
      unitSphere(14),
      new CelMaterial({
        color: 0xffffff,
        emissive: color,
        emissiveStrength: 0.6,
        bands: 3,
        specular: 0.7,
      }),
    );
    cap.scale.set(radius * 0.92, radius * 0.42, radius * 0.92);
    cap.position.y = height;
    group.add(cap);

    this.group.add(group);
    this.occluders.push(group);

    const physicsBody = this.physics.addCylinder(
      new THREE.Vector3(x, y + height / 2, z),
      radius,
      height,
      new THREE.Quaternion(),
      { surface: 'metal', bumper: true, label: 'bumper' },
    );
    this.bodies.push(physicsBody);

    // Reaction: a quick squash that recovers with an overshoot.
    let pulse = 0;
    this.reactors.set(physicsBody.id, (strength) => {
      pulse = Math.min(1, pulse + strength);
    });
    this.updaters.push((dt, elapsed) => {
      pulse = Math.max(0, pulse - dt * 3.2);
      const idle = 1 + Math.sin(elapsed * 2.4 + x) * 0.02;
      const squash = 1 - pulse * 0.3;
      body.scale.set(radius * (idle + pulse * 0.22), height * squash, radius * (idle + pulse * 0.22));
      cap.position.y = height * squash;
    });
  }

  /**
   * Windmill: a compound kinematic body spun about a horizontal axis.
   * Blades sweep to just above the surface, so timing the gap is the challenge.
   */
  private addWindmill(piece: Extract<Piece, { kind: 'windmill' }>): void {
    const { x, z, y = 0, rotY = 0, speed = 1.1, blades = 4, scale = 1 } = piece;

    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;

    // Tower.
    const towerMaterial = new CelMaterial({
      color: 0xffffff,
      map: stoneTexture(this.theme.wall, this.theme.wallTop),
      mapScale: [2, 2],
      bands: 3,
      rimColor: this.theme.rim,
      rimStrength: 0.3,
    });
    const tower = new THREE.Mesh(unitCylinder(12), towerMaterial);
    const towerHeight = 2.6 * scale;
    tower.scale.set(0.5 * scale, towerHeight, 0.62 * scale);
    tower.position.y = towerHeight / 2;
    group.add(tower);
    addOutline(tower, { color: this.theme.ink, pixels: 3 });

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.78 * scale, 0.7 * scale, 10),
      new CelMaterial({ color: this.theme.accentAlt, bands: 3, rimStrength: 0.4 }),
    );
    roof.position.y = towerHeight + 0.34 * scale;
    group.add(roof);
    addOutline(roof, { color: this.theme.ink, pixels: 3 });

    // Blade assembly.
    const hub = new THREE.Group();
    const hubHeight = 1.05 * scale;
    hub.position.set(0, hubHeight, 0.5 * scale);
    group.add(hub);

    const bladeMaterial = new CelMaterial({
      color: this.theme.accent,
      bands: 3,
      specular: 0.3,
      rimColor: 0xffffff,
      rimStrength: 0.5,
    });

    const bladeLength = 0.95 * scale;
    const bladeWidth = 0.34 * scale;

    for (let i = 0; i < blades; i++) {
      const blade = new THREE.Mesh(bladeGeometry(), bladeMaterial);
      blade.scale.set(bladeWidth / 0.28, bladeLength, 1);
      blade.rotation.z = (i / blades) * TAU;
      hub.add(blade);
      addOutline(blade, { color: this.theme.ink, pixels: 2.4 });
    }

    const hubCap = new THREE.Mesh(
      unitSphere(10),
      new CelMaterial({ color: 0xf2f2f2, bands: 3, specular: 0.5 }),
    );
    hubCap.scale.setScalar(0.16 * scale);
    hub.add(hubCap);

    this.group.add(group);
    this.occluders.push(group);

    // Compound physics body: one thin box per blade, offset from the hub.
    const worldHub = new THREE.Vector3(0, hubHeight, 0.5 * scale)
      .applyEuler(new THREE.Euler(0, rotY, 0))
      .add(new THREE.Vector3(x, y, z));

    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    for (let i = 0; i < blades; i++) {
      const angle = (i / blades) * TAU;
      const shape = new CANNON.Box(
        new CANNON.Vec3(bladeWidth / 2, bladeLength / 2, 0.09 * scale),
      );
      const offset = new CANNON.Vec3(
        -Math.sin(angle) * bladeLength * 0.55,
        Math.cos(angle) * bladeLength * 0.55,
        0,
      );
      const orientation = new CANNON.Quaternion();
      orientation.setFromEuler(0, 0, angle);
      body.addShape(shape, offset, orientation);
    }
    body.position.set(worldHub.x, worldHub.y, worldHub.z);
    body.quaternion.setFromEuler(0, rotY, 0);
    this.physics.register(body, { surface: 'wood', bumper: true, label: 'windmill' });
    this.bodies.push(body);

    // Spin axis is the windmill's facing direction, rotated into world space.
    const axis = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, rotY, 0));
    body.angularVelocity.set(axis.x * speed, axis.y * speed, axis.z * speed);

    this.updaters.push(() => {
      // Mirror the simulated rotation onto the visual hub.
      const q = body.quaternion;
      const world = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)).invert();
      hub.quaternion.copy(local.multiply(world));
    });
  }

  /** Revolving bar(s) sweeping about a vertical axis at ball height. */
  private addSpinner(piece: Extract<Piece, { kind: 'spinner' }>): void {
    const { x, z, y = 0, length = 2.4, speed = 1.4, arms = 2 } = piece;

    const group = new THREE.Group();
    group.position.set(x, y, z);
    this.group.add(group);
    this.occluders.push(group);

    const postMaterial = new CelMaterial({
      color: this.theme.wall,
      bands: 3,
      rimColor: this.theme.rim,
      rimStrength: 0.3,
    });
    const post = new THREE.Mesh(unitCylinder(10), postMaterial);
    post.scale.set(0.16, 1.1, 0.16);
    post.position.y = 0.55;
    group.add(post);
    addOutline(post, { color: this.theme.ink, pixels: 2.4 });

    const armMaterial = new CelMaterial({
      color: this.theme.accent,
      emissive: this.theme.id === 'neon' ? this.theme.accent : 0x000000,
      emissiveStrength: this.theme.id === 'neon' ? 0.9 : 0,
      bands: 3,
      specular: 0.4,
      rimColor: 0xffffff,
      rimStrength: 0.5,
    });

    const pivot = new THREE.Group();
    pivot.position.y = 0.28;
    group.add(pivot);

    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });

    for (let i = 0; i < arms; i++) {
      const angle = (i / arms) * Math.PI;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(length, 0.4, 0.22), armMaterial);
      arm.rotation.y = angle;
      pivot.add(arm);
      addOutline(arm, { color: this.theme.ink, pixels: 2.4 });

      const shape = new CANNON.Box(new CANNON.Vec3(length / 2, 0.2, 0.11));
      const orientation = new CANNON.Quaternion();
      orientation.setFromEuler(0, angle, 0);
      body.addShape(shape, new CANNON.Vec3(0, 0, 0), orientation);
    }

    body.position.set(x, y + 0.28, z);
    this.physics.register(body, { surface: 'wood', bumper: true, label: 'spinner' });
    this.bodies.push(body);
    body.angularVelocity.set(0, speed, 0);

    this.updaters.push(() => {
      const q = body.quaternion;
      pivot.quaternion.set(q.x, q.y, q.z, q.w);
    });
  }

  /** Vertically oscillating platform. */
  private addElevator(piece: Extract<Piece, { kind: 'elevator' }>): void {
    const { x, z, w, d, low, high, period = 4, phase = 0 } = piece;
    const color = piece.color ?? this.theme.fairway;
    const thickness = THIN_THICKNESS;

    const mesh = this.platformMesh(w, d, thickness, color);
    this.group.add(mesh);
    this.occluders.push(mesh);

    const body = this.physics.addKinematicBox(
      new THREE.Vector3(x, low - thickness / 2, z),
      new THREE.Vector3(w / 2, thickness / 2, d / 2),
      new THREE.Quaternion(),
      { surface: 'platform', label: 'elevator' },
    );
    this.bodies.push(body);

    this.updaters.push((dt, elapsed) => {
      const targetTop = low + (high - low) * dwellProfile(elapsed / period + phase / TAU);
      const targetY = targetTop - thickness / 2;
      // Drive by velocity rather than teleporting, so contact friction carries
      // the ball with the platform instead of letting it slide.
      body.velocity.set(0, dt > 0 ? (targetY - body.position.y) / dt : 0, 0);
      mesh.position.set(x, body.position.y, z);
    });
  }

  /** Horizontally sliding platform. */
  private addMover(piece: Extract<Piece, { kind: 'mover' }>): void {
    const { x, z, y, w, d, axis, distance, period = 5, phase = 0 } = piece;
    const color = piece.color ?? this.theme.fairway;
    const thickness = THIN_THICKNESS;

    const mesh = this.platformMesh(w, d, thickness, color);
    this.group.add(mesh);
    this.occluders.push(mesh);

    const body = this.physics.addKinematicBox(
      new THREE.Vector3(x, y - thickness / 2, z),
      new THREE.Vector3(w / 2, thickness / 2, d / 2),
      new THREE.Quaternion(),
      { surface: 'platform', label: 'mover' },
    );
    this.bodies.push(body);

    this.updaters.push((dt, elapsed) => {
      // Same dwell profile as the lift: a ferry that pauses at each bank is a
      // crossing the player can time, not a lottery.
      const offset = (dwellProfile(elapsed / period + phase / TAU) * 2 - 1) * distance;
      const targetX = axis === 'x' ? x + offset : x;
      const targetZ = axis === 'z' ? z + offset : z;
      body.velocity.set(
        dt > 0 ? (targetX - body.position.x) / dt : 0,
        0,
        dt > 0 ? (targetZ - body.position.z) / dt : 0,
      );
      mesh.position.set(body.position.x, body.position.y, body.position.z);
    });
  }

  /** Spinning disc that drags the ball around with it. */
  private addRotator(piece: Extract<Piece, { kind: 'rotator' }>): void {
    const { x, z, y, radius, speed = 0.9 } = piece;
    const color = piece.color ?? this.theme.fairway;
    const thickness = THIN_THICKNESS;

    const group = new THREE.Group();
    group.position.set(x, y - thickness / 2, z);

    const disc = new THREE.Mesh(
      unitCylinder(24),
      new CelMaterial({
        color,
        bands: 4,
        specular: 0.2,
        rimColor: this.theme.rim,
        rimStrength: 0.35,
      }),
    );
    disc.scale.set(radius, thickness, radius);
    group.add(disc);
    addOutline(disc, { color: this.theme.ink, pixels: 3 });

    // Radial stripes so the rotation is legible — a plain disc looks static.
    const stripeMaterial = new CelMaterial({
      color: this.theme.accent,
      emissive: this.theme.id === 'neon' ? this.theme.accent : 0x000000,
      emissiveStrength: this.theme.id === 'neon' ? 1.1 : 0,
      bands: 3,
      rimStrength: 0.2,
    });
    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(unitBox(), stripeMaterial);
      stripe.scale.set(radius * 0.9, 0.03, 0.12);
      stripe.rotation.y = (i / 6) * Math.PI;
      stripe.position.y = thickness / 2;
      group.add(stripe);
    }

    this.group.add(group);
    this.occluders.push(group);

    const body = this.physics.addKinematicCylinder(
      new THREE.Vector3(x, y - thickness / 2, z),
      radius,
      thickness,
      // Deliberately NOT the grippy `platform` surface the lifts use. A rotator is
      // a hazard the ball crosses, not transport it rides: with a carry surface
      // under it the disc hooks the ball on contact and slings it straight off
      // the edge, which is a coin flip rather than a shot the player can read.
      { surface: 'metal', label: 'rotator' },
    );
    this.bodies.push(body);
    body.angularVelocity.set(0, speed, 0);

    this.updaters.push(() => {
      const q = body.quaternion;
      group.quaternion.set(q.x, q.y, q.z, q.w);
    });
  }

  private platformMesh(w: number, d: number, thickness: number, color: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(w, thickness, d);
    scaleUV(geometry, w / 4, d / 4);
    const mesh = new THREE.Mesh(geometry, this.surfaceMaterial('platform', color));
    addOutline(mesh, { color: this.theme.ink, pixels: 3 });
    return mesh;
  }

  /** Pad that fires the ball straight up. */
  private addJumpPad(piece: Extract<Piece, { kind: 'jump' }>): void {
    const { x, z, y = 0, power = 11, radius = 0.7 } = piece;
    const color = this.theme.accent;

    const group = new THREE.Group();
    group.position.set(x, y, z);

    const pad = new THREE.Mesh(
      unitCylinder(20),
      new CelMaterial({
        color,
        emissive: color,
        emissiveStrength: 1.3,
        bands: 3,
        specular: 0.5,
        rimColor: 0xffffff,
        rimStrength: 0.6,
      }),
    );
    pad.scale.set(radius, 0.12, radius);
    pad.position.y = 0.06;
    group.add(pad);
    addOutline(pad, { color: this.theme.ink, pixels: 2.6 });

    // Rising rings advertise what the pad does before the player touches it.
    const rings: THREE.Mesh[] = [];
    const ringMaterial = new CelMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveStrength: 1.6,
      bands: 3,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      rimStrength: 0,
    });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.8, 0.035, 6, 20), ringMaterial);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      rings.push(ring);
    }

    this.group.add(group);

    const body = this.physics.addBox(
      new THREE.Vector3(x, y + 0.06, z),
      new THREE.Vector3(radius * 0.8, 0.09, radius * 0.8),
      new THREE.Quaternion(),
      { surface: 'boost', launch: power, label: 'jump' },
    );
    this.bodies.push(body);

    let flash = 0;
    this.reactors.set(body.id, (strength) => {
      flash = Math.min(1.4, flash + strength);
    });

    this.updaters.push((dt, elapsed) => {
      flash = Math.max(0, flash - dt * 2.2);
      for (let i = 0; i < rings.length; i++) {
        const t = ((elapsed * 0.8 + i / rings.length) % 1);
        rings[i].position.y = 0.1 + t * 1.5;
        rings[i].scale.setScalar(1 - t * 0.45);
      }
      ringMaterial.setOpacity(0.35 + flash * 0.5);
      pad.scale.y = 0.12 * (1 + flash * 1.6);
    });
  }

  /** Directional accelerator pad. */
  private addBooster(piece: Extract<Piece, { kind: 'booster' }>): void {
    const { x, z, y = 0, rotY = 0, w = 1.4, d = 2.2, power = 13 } = piece;
    const color = this.theme.accent;

    const group = new THREE.Group();
    // 6 mm of clearance: enough that the pad never z-fights the fairway it is
    // inlaid into, shallow enough that it reads as part of the surface rather
    // than as a slab dropped on top of it.
    group.position.set(x, y + 0.006, z);
    group.rotation.y = rotY;

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.05, d),
      new CelMaterial({
        color: 0x101a2e,
        emissive: color,
        emissiveStrength: 0.35,
        bands: 3,
        specular: 0.4,
        rimColor: color,
        rimStrength: 0.7,
      }),
    );
    pad.position.y = 0.025;
    group.add(pad);
    addOutline(pad, { color: this.theme.ink, pixels: 2.6 });

    // Chevrons scroll along the pad in the boost direction.
    const chevronMaterial = new CelMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveStrength: 2,
      bands: 3,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      rimStrength: 0,
    });
    const chevrons: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const chevron = new THREE.Mesh(chevronGeometry(), chevronMaterial);
      chevron.scale.set(w * 0.75, 1, d * 0.28);
      chevron.position.y = 0.056;
      group.add(chevron);
      chevrons.push(chevron);
    }

    this.group.add(group);

    const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, rotY, 0));
    // The trigger box is sunk until only 5 mm of it stands proud of the deck.
    //
    // It used to sit with its top 0.25 above the floor, which is taller than the
    // ball's centre of mass — so an approaching ball struck the pad's leading
    // *face* rather than rolling onto its top, and bounced straight back off it
    // at the boost surface's restitution. A speed pad that repels the ball is
    // worse than no pad: on Zen Ascent it fired full-power approaches back down
    // the fairway and made the ramp behind it effectively unreachable.
    const body = this.physics.addBox(
      new THREE.Vector3(x, y - 0.075, z),
      new THREE.Vector3(w / 2, 0.08, d / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
      {
        surface: 'boost',
        boost: power,
        boostDir: { x: direction.x, z: direction.z },
        label: 'booster',
      },
    );
    this.bodies.push(body);

    let flash = 0;
    this.reactors.set(body.id, (strength) => {
      flash = Math.min(1.5, flash + strength);
    });

    this.updaters.push((dt, elapsed) => {
      flash = Math.max(0, flash - dt * 2.5);
      for (let i = 0; i < chevrons.length; i++) {
        const t = ((elapsed * 1.6 + i / chevrons.length) % 1);
        chevrons[i].position.z = d / 2 - t * d;
        chevrons[i].scale.y = 1;
      }
      chevronMaterial.setOpacity(0.55 + flash * 0.45);
    });
  }

  private addProp(piece: Extract<Piece, { kind: 'prop' }>): void {
    const result = buildProp(piece.type, this.theme, {
      x: piece.x,
      z: piece.z,
      y: piece.y ?? 0,
      rotY: piece.rotY ?? 0,
      scale: piece.scale ?? 1,
      color: piece.color,
    });
    this.group.add(result.object);
    // Props are decoration, but they are also solid-looking and often sit right
    // behind the tee (torii gates, arcade signs). Without them in the occluder
    // set the camera happily parks inside one and the player sees a wall.
    this.occluders.push(result.object);
    if (result.update) this.updaters.push(result.update);

    // Ground shadow, sized per prop. Things that float — balloons, crystals,
    // koi — deliberately get none, since a shadow pinned under them would
    // contradict the fact that they are not touching anything.
    const footprint: Partial<Record<PropKind, number>> = {
      lantern: 0.9,
      torii: 3.6,
      bamboo: 1.6,
      rock: 1.5,
      bridge: 3.2,
      chime: 0.7,
      pillar: 1.2,
      arcadeSign: 2.6,
    };
    const radius = footprint[piece.type];
    if (radius !== undefined) {
      this.groundShadows.push({
        x: piece.x,
        y: piece.y ?? 0,
        z: piece.z,
        radius: radius * (piece.scale ?? 1),
      });
    }
  }

  private addTree(piece: Extract<Piece, { kind: 'tree' }>): void {
    const tree = buildTree(
      piece.type,
      this.theme,
      Math.round(piece.x * 397 + piece.z * 131 + 7),
      piece.scale ?? 1,
    );
    tree.position.set(piece.x, piece.y ?? 0, piece.z);
    this.group.add(tree);
    this.occluders.push(tree);
    this.groundShadows.push({
      x: piece.x,
      y: piece.y ?? 0,
      z: piece.z,
      radius: 3.2 * (piece.scale ?? 1),
    });
  }

  private addScatter(piece: Extract<Piece, { kind: 'scatter' }>): void {
    const options = {
      count: piece.count,
      x: piece.x,
      z: piece.z,
      width: piece.w,
      depth: piece.d,
      y: piece.y ?? 0,
      seed: Math.round(piece.x * 71 + piece.z * 29 + piece.count),
    };

    const mesh =
      piece.type === 'grass'
        ? buildGrassField(options, this.theme)
        : piece.type === 'flowers'
          ? buildFlowerField(options, this.theme)
          : buildRockField(options, this.theme);

    if (!mesh) return;
    this.group.add(mesh);

    // Ground cover is excluded from the ink prepass entirely. Hundreds of
    // blade-sized objects each pick up a crease line, and at any real distance
    // the result is a field of black scribbles rather than grass — the outline
    // reads as detail only when the shape it traces is bigger than the line.
    if (piece.type !== 'rocks') mesh.layers.set(LAYER_NO_EDGE);
    else addOutline(mesh, { color: this.theme.ink, pixels: 2 });
  }

  /**
   * One instanced disc per ground-standing prop and tree.
   *
   * The screen-space contact shading only reaches about half a unit, which is
   * enough to seat a rail into the green but not enough for a tree: a trunk is
   * thin, the canopy is metres above the ground, and neither leaves a mark. A
   * projected disc is the cel-animation answer — it is not a real shadow, it is
   * the *drawing* of one, and it is what stops set dressing reading as stickers
   * pasted onto the fairway.
   *
   * Instanced, so an entire hole's worth costs a single draw call.
   */
  private buildGroundShadows(): void {
    if (this.groundShadows.length === 0) return;

    const material = new THREE.MeshBasicMaterial({
      map: radialTexture('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      fog: false,
    });

    const mesh = new THREE.InstancedMesh(groundPlane(), material, this.groundShadows.length);
    mesh.name = 'ground-shadows';
    mesh.frustumCulled = false;
    // Above the floor, below anything else transparent.
    mesh.renderOrder = 1;
    mesh.layers.set(LAYER_NO_EDGE);

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();

    this.groundShadows.forEach((shadow, index) => {
      position.set(shadow.x, shadow.y + 0.018, shadow.z);
      scale.set(shadow.radius, 1, shadow.radius);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;

    this.group.add(mesh);
    this.groundShadows = [];
  }

  // --- Cup & tee ------------------------------------------------------------

  private buildCup(hole: HoleDef): void {
    const group = new THREE.Group();
    group.position.set(hole.cup.x, hole.cup.y, hole.cup.z);

    // Sunken shaft: a dark cylinder that reads as depth without needing a hole
    // cut through the collision surface.
    const shaft = new THREE.Mesh(
      unitCylinder(20),
      new CelMaterial({
        color: 0x120f18,
        bands: 3,
        rimColor: this.theme.rim,
        rimStrength: 0.15,
        specular: 0,
        shadowTint: 0,
      }),
    );
    shaft.scale.set(CUP_RADIUS, 0.5, CUP_RADIUS);
    shaft.position.y = -0.25;
    group.add(shaft);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(CUP_RADIUS, 0.035, 8, 24),
      new CelMaterial({
        color: 0xffffff,
        bands: 3,
        specular: 0.5,
        rimColor: this.theme.rim,
        rimStrength: 0.5,
      }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.012;
    group.add(rim);

    // A soft target ring pulses so the cup is findable from across the hole.
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(CUP_RADIUS * 1.3, CUP_RADIUS * 1.75, 24),
      new CelMaterial({
        color: this.theme.accent,
        emissive: this.theme.accent,
        emissiveStrength: 1.1,
        bands: 3,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        rimStrength: 0,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    group.add(halo);

    const pin = buildPin(this.theme);
    group.add(pin.group);
    this.updaters.push(pin.update);

    const haloMaterial = halo.material as CelMaterial;
    this.updaters.push((_dt, elapsed) => {
      const pulse = 0.35 + Math.sin(elapsed * 2.2) * 0.18;
      haloMaterial.setOpacity(pulse);
      halo.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.05);
    });

    this.group.add(group);
  }

  private buildTee(hole: HoleDef): void {
    const group = new THREE.Group();
    group.position.set(hole.tee.x, hole.tee.y - 0.18, hole.tee.z);

    const material = new CelMaterial({
      color: 0xffffff,
      bands: 3,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      rimColor: this.theme.rim,
      rimStrength: 0.3,
    });

    const marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 20), material);
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.19;
    group.add(marker);

    this.group.add(group);
  }

  private defaultColor(surface: SurfaceKind): number {
    switch (surface) {
      case 'sand':
        return this.theme.sand;
      case 'wall':
        return this.theme.wall;
      case 'wood':
        return 0xc0693f;
      case 'ice':
        return 0xbfeaff;
      case 'metal':
      case 'platform':
        return this.theme.wall;
      case 'fairway':
        return this.theme.fairway;
      case 'boost':
        return this.theme.accent;
      default:
        return this.theme.green;
    }
  }
}
