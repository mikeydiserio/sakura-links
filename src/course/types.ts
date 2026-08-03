import type { SurfaceKind } from '../physics/PhysicsWorld';
import type { ThemeId } from '../render/Palette';
import type { TreeKind } from '../world/Foliage';

/**
 * The hole-authoring DSL.
 *
 * Holes are *data*, not code. Every piece below has a matching branch in
 * `HoleBuilder`, which produces geometry, collision and behaviour together. That
 * split is what makes nine holes cost authoring time rather than engineering
 * time, and it means a hole can be reasoned about — and balanced — by reading a
 * single object literal.
 *
 * ### Coordinate conventions
 * - `x` grows east, `z` grows south, `y` grows up.
 * - A tile's `y` is the height of its **top surface**, so authoring a ramp only
 *   requires the heights the ball actually rolls on.
 * - Wall flags are compass letters in the tile's **local** space, applied before
 *   `rotY`: `N` = -Z, `S` = +Z, `E` = +X, `W` = -X.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** A flat (or tilted) slab of playable surface, optionally walled on any edge. */
export interface TilePiece {
  kind: 'tile';
  x: number;
  z: number;
  /** Size along local X and Z. */
  w: number;
  d: number;
  /** Height of the top surface. Defaults to 0. */
  y?: number;
  rotY?: number;
  /** Pitch in radians about local X: positive lifts the north edge. */
  tilt?: number;
  /** Roll in radians about local Z: positive lifts the **east** edge. */
  roll?: number;
  /** Compass letters for the edges that get a rail. Defaults to all four. */
  walls?: string;
  surface?: SurfaceKind;
  color?: number;
  wallHeight?: number;
  /** Skips the thick side skirt — used for thin floating platforms. */
  thin?: boolean;
}

/** A smooth dome or bowl, built as a trimesh so the ball rolls over it cleanly. */
export interface BumpPiece {
  kind: 'bump';
  x: number;
  z: number;
  y?: number;
  radius: number;
  /** Positive domes upward, negative dishes downward into a funnel. */
  height: number;
  surface?: SurfaceKind;
  color?: number;
}

/** Free-standing wall run described by a polyline of XZ points. */
export interface RailPiece {
  kind: 'rail';
  points: Array<[number, number]>;
  y?: number;
  height?: number;
  thickness?: number;
  color?: number;
  closed?: boolean;
  /** Neon rails glow and feed the bloom pass. */
  glow?: boolean;
}

/** Water hazard: an animated surface plus a penalty volume. */
export interface WaterPiece {
  kind: 'water';
  x: number;
  z: number;
  w: number;
  d: number;
  /** Surface height. The penalty triggers below `y + 0.15`. */
  y?: number;
}

/** Circular bumper that kicks the ball away with extra energy. */
export interface BumperPiece {
  kind: 'bumper';
  x: number;
  z: number;
  y?: number;
  radius?: number;
  color?: number;
}

/** Rotating windmill; blades sweep through the play line at ground level. */
export interface WindmillPiece {
  kind: 'windmill';
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  /** Radians per second. Negative reverses. */
  speed?: number;
  blades?: number;
  scale?: number;
}

/** Horizontal bar sweeping about a vertical axis, like a revolving door. */
export interface SpinnerPiece {
  kind: 'spinner';
  x: number;
  z: number;
  y?: number;
  length?: number;
  speed?: number;
  arms?: number;
}

/** Platform that rises and falls on a sine cycle. */
export interface ElevatorPiece {
  kind: 'elevator';
  x: number;
  z: number;
  w: number;
  d: number;
  /** Low and high surface heights. */
  low: number;
  high: number;
  /** Seconds for a full up-down cycle. */
  period?: number;
  phase?: number;
  color?: number;
}

/** Platform that slides back and forth along one axis. */
export interface MoverPiece {
  kind: 'mover';
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  axis: 'x' | 'z';
  distance: number;
  period?: number;
  phase?: number;
  color?: number;
}

/** Disc that spins about its own centre, carrying the ball with it. */
export interface RotatorPiece {
  kind: 'rotator';
  x: number;
  z: number;
  y: number;
  radius: number;
  speed?: number;
  color?: number;
}

/** Pad that launches the ball vertically on contact. */
export interface JumpPadPiece {
  kind: 'jump';
  x: number;
  z: number;
  y?: number;
  power?: number;
  radius?: number;
}

/** Pad that accelerates the ball along its facing direction. */
export interface BoosterPiece {
  kind: 'booster';
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  w?: number;
  d?: number;
  power?: number;
}

export type PropKind =
  | 'lantern'
  | 'torii'
  | 'bamboo'
  | 'rock'
  | 'bridge'
  | 'chime'
  | 'crystal'
  | 'arcadeSign'
  | 'balloon'
  | 'pillar'
  | 'koi';

/** Purely decorative object with no collision. */
export interface PropPiece {
  kind: 'prop';
  type: PropKind;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  scale?: number;
  color?: number;
}

export interface TreePiece {
  kind: 'tree';
  type: TreeKind;
  x: number;
  z: number;
  y?: number;
  scale?: number;
}

/** Instanced ground dressing scattered over a rectangle. */
export interface ScatterPiece {
  kind: 'scatter';
  type: 'grass' | 'flowers' | 'rocks';
  x: number;
  z: number;
  w: number;
  d: number;
  y?: number;
  count: number;
}

export type Piece =
  | TilePiece
  | BumpPiece
  | RailPiece
  | WaterPiece
  | BumperPiece
  | WindmillPiece
  | SpinnerPiece
  | ElevatorPiece
  | MoverPiece
  | RotatorPiece
  | JumpPadPiece
  | BoosterPiece
  | PropPiece
  | TreePiece
  | ScatterPiece;

export interface HoleDef {
  id: string;
  name: string;
  par: number;
  /** One-line coaching tip shown on the hole intro card. */
  hint: string;
  tee: Vec3Like;
  cup: Vec3Like;
  /** Starting aim yaw in radians; defaults to facing the cup. */
  aim?: number;
  pieces: Piece[];
}

export interface CourseDef {
  id: string;
  name: string;
  tagline: string;
  theme: ThemeId;
  /** Course that must be completed before this one unlocks. */
  requires?: string;
  holes: HoleDef[];
}

export const coursePar = (course: CourseDef): number =>
  course.holes.reduce((total, hole) => total + hole.par, 0);
