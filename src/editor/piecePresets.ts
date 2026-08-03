import type { PieceKind, PropKind } from '../course/types';
import type { SurfaceKind } from '../physics/PhysicsWorld';
import type { TreeKind } from '../world/Foliage';

/**
 * Per-kind authoring metadata: human labels, palette grouping, inspector fields
 * and the defaults a freshly placed piece starts from.
 *
 * The defaults mirror the destructuring defaults in `HoleBuilder` — when a
 * piece is placed with a missing field, the builder and the preset must agree
 * on what the piece means.
 */

export interface FieldConfig {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select' | 'toggle' | 'color' | 'textarea';
  step?: number;
  min?: number;
  max?: number;
  /** Choices for `select` fields. */
  options?: string[];
  title?: string;
}

export interface PiecePreset {
  kind: PieceKind;
  label: string;
  summary: string;
  group: 'Terrain' | 'Hazards' | 'Decoration';
  fields: FieldConfig[];
  defaults: Record<string, unknown>;
}

const NUMBER: FieldConfig['type'] = 'number';
const TEXT: FieldConfig['type'] = 'text';
const SELECT: FieldConfig['type'] = 'select';
const TOGGLE: FieldConfig['type'] = 'toggle';
const COLOR: FieldConfig['type'] = 'color';

/** Renders as `[x,z, x,z, …]` — the compass of every authored rail/rail run. */
const TEXTAREA: FieldConfig['type'] = 'textarea';

const SURFACES: SurfaceKind[] = [
  'green',
  'fairway',
  'sand',
  'wall',
  'ice',
  'metal',
  'platform',
  'wood',
  'boost',
];

export const PROP_KINDS: PropKind[] = [
  'lantern',
  'torii',
  'bamboo',
  'rock',
  'bridge',
  'chime',
  'crystal',
  'arcadeSign',
  'balloon',
  'pillar',
  'koi',
];

export const TREE_KINDS: TreeKind[] = ['sakura', 'pine', 'floating', 'palm'];

const SCATTER_KINDS = ['grass', 'flowers', 'rocks'];

/** Wall height when a tile defaults its rails and a rail defaults its height. */
export const DEFAULT_WALL_HEIGHT = 1.05;
/** Rail thickness — half of it is the margin a boundary rail sits outside a floor. */
export const DEFAULT_RAIL_THICKNESS = 0.26;

const POSITION = (): FieldConfig[] => [
  { key: 'x', label: 'X', type: NUMBER, step: 0.25 },
  { key: 'z', label: 'Z', type: NUMBER, step: 0.25 },
  { key: 'y', label: 'Y', type: NUMBER, step: 0.25 },
];

export const PIECE_PRESETS: PiecePreset[] = [
  {
    kind: 'tile',
    label: 'Tile',
    summary: 'Flat (or tilted) slab with optional rails',
    group: 'Terrain',
    fields: [
      ...POSITION(),
      { key: 'w', label: 'Width', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'd', label: 'Depth', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'rotY', label: 'Rotation', type: NUMBER, step: 15, title: 'Degrees of yaw' },
      { key: 'tilt', label: 'Tilt', type: NUMBER, step: 0.05, title: 'Radians about X — lifts the north edge' },
      { key: 'roll', label: 'Roll', type: NUMBER, step: 0.05, title: 'Radians about Z — lifts the east edge' },
      { key: 'walls', label: 'Walls', type: TEXT, title: 'Compass letters N S E W — e.g. NSEW or ""' },
      { key: 'surface', label: 'Surface', type: SELECT, options: SURFACES },
      { key: 'color', label: 'Color', type: COLOR, title: 'Overrides the theme surface colour' },
      { key: 'wallHeight', label: 'Wall height', type: NUMBER, step: 0.1, min: 0.2 },
      { key: 'thin', label: 'Thin (floating)', type: TOGGLE },
    ],
    defaults: {
      w: 6,
      d: 6,
      y: 0,
      rotY: 0,
      tilt: 0,
      roll: 0,
      walls: 'NSEW',
      surface: 'green',
      wallHeight: DEFAULT_WALL_HEIGHT,
    },
  },
  {
    kind: 'bump',
    label: 'Bump',
    summary: 'Dome (or dish) built from a sphere cap',
    group: 'Terrain',
    fields: [
      ...POSITION(),
      { key: 'radius', label: 'Radius', type: NUMBER, step: 0.25, min: 0.5 },
      { key: 'height', label: 'Height', type: NUMBER, step: 0.1, title: 'Positive domes, negative dishes' },
      { key: 'surface', label: 'Surface', type: SELECT, options: SURFACES },
      { key: 'color', label: 'Color', type: COLOR },
    ],
    defaults: { x: 0, z: 0, y: 0, radius: 2.5, height: 0.6, surface: 'green' },
  },
  {
    kind: 'rail',
    label: 'Rail',
    summary: 'Free-standing wall run along a polyline',
    group: 'Terrain',
    fields: [
      { key: 'points', label: 'Points', type: TEXTAREA, title: 'Comma list of x,z pairs, e.g. -3,0, 3,0' },
      ...POSITION().filter((f) => f.key === 'y'),
      { key: 'height', label: 'Height', type: NUMBER, step: 0.1, min: 0.2 },
      { key: 'thickness', label: 'Thickness', type: NUMBER, step: 0.05, min: 0.1 },
      { key: 'closed', label: 'Closed loop', type: TOGGLE },
      { key: 'glow', label: 'Glow', type: TOGGLE, title: 'Neon rail that feeds the bloom pass' },
      { key: 'color', label: 'Color', type: COLOR },
    ],
    defaults: {
      points: [
        [-3, 0],
        [3, 0],
      ],
      y: 0,
      height: DEFAULT_WALL_HEIGHT,
      thickness: DEFAULT_RAIL_THICKNESS,
      closed: false,
      glow: false,
    },
  },
  {
    kind: 'water',
    label: 'Water',
    summary: 'Animated hazard with a penalty below the surface',
    group: 'Terrain',
    fields: [
      ...POSITION(),
      { key: 'w', label: 'Width', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'd', label: 'Depth', type: NUMBER, step: 0.5, min: 0.5 },
    ],
    defaults: { x: 0, z: 0, w: 5, d: 5, y: -0.1 },
  },
  {
    kind: 'bumper',
    label: 'Bumper',
    summary: 'Kicks the ball away with extra energy',
    group: 'Hazards',
    fields: [
      ...POSITION(),
      { key: 'radius', label: 'Radius', type: NUMBER, step: 0.1, min: 0.2 },
      { key: 'color', label: 'Color', type: COLOR },
    ],
    defaults: { x: 0, z: 0, y: 0, radius: 0.45 },
  },
  {
    kind: 'windmill',
    label: 'Windmill',
    summary: 'Rotating blades sweep the play line',
    group: 'Hazards',
    fields: [
      ...POSITION(),
      { key: 'rotY', label: 'Facing', type: NUMBER, step: 15, title: 'Degrees' },
      { key: 'speed', label: 'Speed', type: NUMBER, step: 0.1, title: 'Radians per second; negative reverses' },
      { key: 'blades', label: 'Blades', type: NUMBER, step: 1, min: 2, max: 8 },
      { key: 'scale', label: 'Scale', type: NUMBER, step: 0.1, min: 0.4 },
      { key: 'color', label: 'Blade color', type: COLOR },
    ],
    defaults: { x: 0, z: 0, y: 0, rotY: 0, speed: 1.1, blades: 4, scale: 1 },
  },
  {
    kind: 'spinner',
    label: 'Spinner',
    summary: 'Revolving bar about a vertical axis',
    group: 'Hazards',
    fields: [
      ...POSITION(),
      { key: 'length', label: 'Length', type: NUMBER, step: 0.2, min: 0.6 },
      { key: 'speed', label: 'Speed', type: NUMBER, step: 0.1 },
      { key: 'arms', label: 'Arms', type: NUMBER, step: 1, min: 1, max: 6 },
      { key: 'color', label: 'Color', type: COLOR },
    ],
    defaults: { x: 0, z: 0, y: 0, length: 2.4, speed: 1.4, arms: 2 },
  },
  {
    kind: 'elevator',
    label: 'Elevator',
    summary: 'Platform that rises and falls',
    group: 'Hazards',
    fields: [
      ...POSITION(),
      { key: 'w', label: 'Width', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'd', label: 'Depth', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'low', label: 'Low height', type: NUMBER, step: 0.25 },
      { key: 'high', label: 'High height', type: NUMBER, step: 0.25 },
      { key: 'period', label: 'Period (s)', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'phase', label: 'Phase', type: NUMBER, step: 0.25 },
      { key: 'color', label: 'Color', type: COLOR },
    ],
    defaults: { x: 0, z: 0, w: 3, d: 3, low: 0, high: 2.6, period: 4, phase: 0 },
  },
  {
    kind: 'mover',
    label: 'Mover',
    summary: 'Platform that slides along one axis',
    group: 'Hazards',
    fields: [
      ...POSITION(),
      { key: 'w', label: 'Width', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'd', label: 'Depth', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'axis', label: 'Axis', type: SELECT, options: ['x', 'z'] },
      { key: 'distance', label: 'Distance', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'period', label: 'Period (s)', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'phase', label: 'Phase', type: NUMBER, step: 0.25 },
      { key: 'color', label: 'Color', type: COLOR },
    ],
    defaults: { x: 0, z: 0, y: 0, w: 3, d: 3, axis: 'x', distance: 3, period: 5, phase: 0 },
  },
  {
    kind: 'rotator',
    label: 'Rotator',
    summary: 'Disc that spins, carrying the ball',
    group: 'Hazards',
    fields: [
      ...POSITION(),
      { key: 'radius', label: 'Radius', type: NUMBER, step: 0.25, min: 0.5 },
      { key: 'speed', label: 'Speed', type: NUMBER, step: 0.1 },
      { key: 'color', label: 'Color', type: COLOR },
    ],
    defaults: { x: 0, z: 0, y: 0, radius: 2, speed: 0.9 },
  },
  {
    kind: 'jump',
    label: 'Jump Pad',
    summary: 'Fires the ball straight up',
    group: 'Hazards',
    fields: [
      ...POSITION(),
      { key: 'power', label: 'Power', type: NUMBER, step: 1, min: 2 },
      { key: 'radius', label: 'Radius', type: NUMBER, step: 0.1, min: 0.4 },
    ],
    defaults: { x: 0, z: 0, y: 0, power: 11, radius: 0.7 },
  },
  {
    kind: 'booster',
    label: 'Booster',
    summary: 'Accelerates the ball along its facing',
    group: 'Hazards',
    fields: [
      ...POSITION(),
      { key: 'rotY', label: 'Facing', type: NUMBER, step: 15 },
      { key: 'w', label: 'Width', type: NUMBER, step: 0.2, min: 0.5 },
      { key: 'd', label: 'Depth', type: NUMBER, step: 0.2, min: 0.5 },
      { key: 'power', label: 'Power', type: NUMBER, step: 1, min: 2 },
    ],
    defaults: { x: 0, z: 0, y: 0, rotY: 0, w: 1.4, d: 2.2, power: 13 },
  },
  {
    kind: 'prop',
    label: 'Prop',
    summary: 'Decorative object, no collision',
    group: 'Decoration',
    fields: [
      ...POSITION(),
      { key: 'type', label: 'Type', type: SELECT, options: PROP_KINDS },
      { key: 'rotY', label: 'Facing', type: NUMBER, step: 15 },
      { key: 'scale', label: 'Scale', type: NUMBER, step: 0.1, min: 0.2 },
      { key: 'color', label: 'Color', type: COLOR },
    ],
    defaults: { x: 0, z: 0, y: 0, rotY: 0, scale: 1, type: 'lantern' },
  },
  {
    kind: 'tree',
    label: 'Tree',
    summary: 'A tree',
    group: 'Decoration',
    fields: [
      ...POSITION(),
      { key: 'type', label: 'Type', type: SELECT, options: TREE_KINDS },
      { key: 'scale', label: 'Scale', type: NUMBER, step: 0.1, min: 0.2 },
    ],
    defaults: { x: 0, z: 0, y: 0, scale: 1, type: 'sakura' },
  },
  {
    kind: 'scatter',
    label: 'Scatter',
    summary: 'Instanced dressing over a rectangle',
    group: 'Decoration',
    fields: [
      ...POSITION(),
      { key: 'type', label: 'Type', type: SELECT, options: SCATTER_KINDS },
      { key: 'w', label: 'Width', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'd', label: 'Depth', type: NUMBER, step: 0.5, min: 0.5 },
      { key: 'count', label: 'Count', type: NUMBER, step: 5, min: 1, max: 500 },
    ],
    defaults: { x: 0, z: 0, y: 0, w: 6, d: 6, count: 40, type: 'grass' },
  },
];

export const PRESET_BY_KIND = new Map(PIECE_PRESETS.map((preset) => [preset.kind, preset]));

export const PRESET_GROUPS = ['Terrain', 'Hazards', 'Decoration'] as const;