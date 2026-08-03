import * as THREE from 'three';
import { CelMaterial } from '../render/CelMaterial';
import { addOutline } from '../render/OutlineMaterial';
import { grassBlade, flowerGeometry, rockGeometry, unitCylinder } from '../render/GeometryCache';
import { mergeGeometries } from './Environment';
import { Rng, TAU } from '../util/math';
import type { Theme } from '../render/Palette';

/**
 * Procedural plant life: trees, grass tufts, flowers and rocks.
 *
 * Everything scatterable is an `InstancedMesh` — a hole can carry 600 grass
 * blades and 200 flowers for two draw calls each (geometry + ink outline).
 * Instance colour is varied per blade so a field never looks like a decal.
 *
 * Trees are *not* instanced: there are only a handful per hole and each is
 * generated with its own silhouette, which matters far more visually than the
 * handful of draw calls it costs.
 */

export type TreeKind = 'sakura' | 'pine' | 'floating' | 'palm';

/** Builds one stylised tree. Deterministic for a given seed. */
export function buildTree(kind: TreeKind, theme: Theme, seed: number, scale = 1): THREE.Group {
  const group = new THREE.Group();
  group.name = `tree:${kind}`;
  const rng = new Rng(seed);

  const barkColor = kind === 'sakura' ? 0x6b4b52 : kind === 'palm' ? 0x8a6a45 : 0x5a4436;
  const barkMaterial = new CelMaterial({
    color: barkColor,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.3,
    shadowTint: 0.35,
  });

  // --- Trunk: stacked, tapering, slightly drunken segments -----------------
  const trunkSegments = kind === 'palm' ? 7 : 4;
  const trunkGeometries: THREE.BufferGeometry[] = [];
  let y = 0;
  let radius = 0.22 * scale;
  let tiltX = 0;
  let tiltZ = 0;

  for (let i = 0; i < trunkSegments; i++) {
    const height = (kind === 'palm' ? 0.62 : 0.75) * scale * rng.range(0.85, 1.15);
    const nextRadius = radius * rng.range(0.72, 0.88);
    const geometry = new THREE.CylinderGeometry(nextRadius, radius, height, 7, 1);
    // A palm leans; everything else just wobbles.
    tiltX += rng.range(-0.07, 0.07) + (kind === 'palm' ? 0.06 : 0);
    tiltZ += rng.range(-0.07, 0.07);
    geometry.rotateX(tiltX);
    geometry.rotateZ(tiltZ);
    geometry.translate(Math.sin(tiltZ) * -height * i * 0.3, y + height / 2, Math.sin(tiltX) * height * i * 0.3);
    trunkGeometries.push(geometry);
    y += height * 0.94;
    radius = nextRadius;
  }

  const trunk = new THREE.Mesh(mergeGeometries(trunkGeometries), barkMaterial);
  trunkGeometries.forEach((g) => g.dispose());
  trunk.name = 'trunk';
  group.add(trunk);
  addOutline(trunk, { color: theme.ink, pixels: 2.5 });

  // --- Canopy --------------------------------------------------------------
  const canopyColor =
    kind === 'sakura'
      ? theme.accent
      : kind === 'pine'
        ? 0x3f7f52
        : kind === 'floating'
          ? 0x7fe0b0
          : 0x4fa86a;

  const canopyMaterial = new CelMaterial({
    color: canopyColor,
    bands: 3,
    rimColor: kind === 'sakura' ? 0xffffff : theme.rim,
    rimStrength: 0.45,
    rimPower: 2.2,
    specular: 0.12,
    sway: 0.5,
    shadowTint: 0.3,
  });

  if (kind === 'pine') {
    // Stacked cones — the classic low-poly conifer.
    const tiers = 4;
    const geometries: THREE.BufferGeometry[] = [];
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const coneRadius = (1.5 - t * 0.95) * scale;
      const coneHeight = 1.3 * scale;
      const geometry = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
      geometry.translate(0, y * 0.55 + i * 0.72 * scale, 0);
      geometries.push(geometry);
    }
    const canopy = new THREE.Mesh(mergeGeometries(geometries), canopyMaterial);
    geometries.forEach((g) => g.dispose());
    group.add(canopy);
    addOutline(canopy, { color: theme.ink, pixels: 3 });
  } else if (kind === 'palm') {
    // Fronds: long tapered blades arranged radially and drooping.
    const geometries: THREE.BufferGeometry[] = [];
    const fronds = 7;
    for (let i = 0; i < fronds; i++) {
      const angle = (i / fronds) * TAU + rng.range(-0.2, 0.2);
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.12);
      shape.quadraticCurveTo(1.2 * scale, -0.5 * scale, 2.4 * scale, -0.9 * scale);
      shape.quadraticCurveTo(1.2 * scale, 0.1 * scale, 0, 0.12);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.06,
        bevelEnabled: false,
        curveSegments: 4,
      });
      geometry.rotateX(Math.PI / 2);
      geometry.rotateY(angle);
      geometry.translate(0, y, 0);
      geometries.push(geometry);
    }
    // Fronds are single-sided cards; both faces must shade.
    canopyMaterial.side = THREE.DoubleSide;
    const canopy = new THREE.Mesh(mergeGeometries(geometries), canopyMaterial);
    geometries.forEach((g) => g.dispose());
    group.add(canopy);
    addOutline(canopy, { color: theme.ink, pixels: 2 });
  } else {
    // Blobby cluster canopy — overlapping low-poly spheres, squashed and
    // offset so the silhouette is lumpy rather than a single ball.
    const blobs = kind === 'floating' ? 4 : 6;
    const geometries: THREE.BufferGeometry[] = [];
    for (let i = 0; i < blobs; i++) {
      const angle = (i / blobs) * TAU + rng.range(-0.4, 0.4);
      const spread = rng.range(0.35, 1.05) * scale;
      const size = rng.range(0.85, 1.35) * scale;
      const geometry = new THREE.IcosahedronGeometry(size, 0);
      geometry.scale(1, 0.78, 1);
      geometry.translate(
        Math.cos(angle) * spread,
        y + rng.range(-0.15, 0.55) * scale,
        Math.sin(angle) * spread,
      );
      geometries.push(geometry);
    }
    const canopy = new THREE.Mesh(mergeGeometries(geometries), canopyMaterial);
    geometries.forEach((g) => g.dispose());
    group.add(canopy);
    addOutline(canopy, { color: theme.ink, pixels: 3 });
  }

  return group;
}

export interface ScatterOptions {
  count: number;
  /** Rectangular region to scatter within. */
  x: number;
  z: number;
  width: number;
  depth: number;
  y: number;
  seed?: number;
  /** Radius around the hole line to keep clear so foliage never blocks a putt. */
  avoid?: Array<{ x: number; z: number; radius: number }>;
}

/** Grass tufts: several blades per instance point, instanced across the field. */
export function buildGrassField(options: ScatterOptions, theme: Theme): THREE.InstancedMesh | null {
  const points = scatterPoints(options);
  if (points.length === 0) return null;

  const material = new CelMaterial({
    color: theme.greenAlt,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.35,
    sway: 1.1,
    side: THREE.DoubleSide,
    shadowTint: 0.2,
    // The aim camera sits ~4u from the tee, and decorative patches are often
    // authored right where it stands. The dissolve is linear in distance, so at
    // 3.4u of a 3.5u fade only ~3% of pixels drop — it costs nothing at the rail
    // line and only really bites when a blade is about to fill the lens.
    nearFade: 3.5,
  });

  const mesh = new THREE.InstancedMesh(grassBlade(), material, points.length);
  mesh.name = 'grass';
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const rng = new Rng((options.seed ?? 1) + 51);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const height = rng.range(0.28, 0.62);
    matrix.compose(
      new THREE.Vector3(p.x, options.y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, TAU), rng.range(-0.2, 0.2))),
      new THREE.Vector3(rng.range(0.8, 1.3), height, 1),
    );
    mesh.setMatrixAt(i, matrix);
    // Per-instance tint keeps a large field from banding into one flat colour.
    color.setHex(theme.greenAlt).offsetHSL(rng.range(-0.03, 0.03), 0, rng.range(-0.12, 0.14));
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Ground flowers with per-instance hue variation. */
export function buildFlowerField(
  options: ScatterOptions,
  theme: Theme,
  palette: number[] = [0xffffff, 0xffd166, 0xff8fb1, 0xa78bfa],
): THREE.InstancedMesh | null {
  const points = scatterPoints(options);
  if (points.length === 0) return null;

  const material = new CelMaterial({
    color: 0xffffff,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.4,
    specular: 0.2,
    sway: 0.6,
    shadowTint: 0.15,
    nearFade: 2.5,
  });

  const mesh = new THREE.InstancedMesh(flowerGeometry(), material, points.length);
  mesh.name = 'flowers';
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const rng = new Rng((options.seed ?? 1) + 77);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const scale = rng.range(0.1, 0.19);
    matrix.compose(
      // The flower geometry's own base sits at local y = -0.05, so a fixed
      // +0.04 lift left every instance hovering a few centimetres over the turf
      // — worse at small scales, and unmissable once the ink pass drew a hard
      // line under each one. Scaling the offset with the instance and then
      // sinking it 4 mm plants the stem in the ground where it belongs.
      new THREE.Vector3(p.x, options.y + scale * 0.05 - 0.004, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, TAU), 0)),
      new THREE.Vector3(scale, scale, scale),
    );
    mesh.setMatrixAt(i, matrix);
    color.setHex(rng.pick(palette));
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Scattered decorative rocks. */
export function buildRockField(options: ScatterOptions, theme: Theme): THREE.InstancedMesh | null {
  const points = scatterPoints(options);
  if (points.length === 0) return null;

  const material = new CelMaterial({
    color: theme.wall,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.3,
    shadowTint: 0.35,
  });

  const mesh = new THREE.InstancedMesh(rockGeometry(0), material, points.length);
  mesh.name = 'rocks';
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const rng = new Rng((options.seed ?? 1) + 303);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const scale = rng.range(0.18, 0.55);
    matrix.compose(
      new THREE.Vector3(p.x, options.y + scale * 0.3, p.z),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rng.range(0, 0.4), rng.range(0, TAU), rng.range(0, 0.4)),
      ),
      new THREE.Vector3(scale * rng.range(0.8, 1.4), scale, scale * rng.range(0.8, 1.4)),
    );
    mesh.setMatrixAt(i, matrix);
    color.setHex(theme.wall).offsetHSL(0, 0, rng.range(-0.1, 0.1));
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Bamboo stand — vertical segmented stalks, a Sakura Gardens signature. */
export function buildBamboo(x: number, z: number, y: number, seed: number, theme: Theme): THREE.Group {
  const group = new THREE.Group();
  const rng = new Rng(seed);
  const material = new CelMaterial({
    color: 0x8fbf5a,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.4,
    sway: 0.35,
    shadowTint: 0.25,
  });

  const geometries: THREE.BufferGeometry[] = [];
  const stalks = rng.int(4, 7);
  for (let i = 0; i < stalks; i++) {
    const sx = x + rng.range(-0.6, 0.6);
    const sz = z + rng.range(-0.6, 0.6);
    const height = rng.range(2.4, 4.6);
    const radius = rng.range(0.055, 0.09);
    const segments = Math.floor(height / 0.62);
    for (let s = 0; s < segments; s++) {
      // Segment length must exceed the pitch, not fall short of it. At 0.58
      // long on a 0.62 pitch every joint left a 4 cm hole straight through the
      // stalk; 0.66 makes each node overlap its neighbour by 4 cm instead, so
      // the culm reads as continuous and the joint still shows as a ridge.
      const geometry = new THREE.CylinderGeometry(radius, radius * 1.04, 0.66, 6);
      geometry.translate(sx, y + s * 0.62 + 0.3, sz);
      geometries.push(geometry);
    }
  }

  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  geometries.forEach((g) => g.dispose());
  group.add(mesh);
  addOutline(mesh, { color: theme.ink, pixels: 2 });
  return group;
}

/** Stone lantern (tōrō): base, pillar, light box and cap. */
export function buildLantern(x: number, z: number, y: number, theme: Theme): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const stone = new CelMaterial({
    color: theme.wall,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.3,
    shadowTint: 0.35,
  });

  const parts: Array<[number, number, number, number, number]> = [
    // [radiusTop, radiusBottom, height, y, sides]
    [0.34, 0.42, 0.18, 0.09, 8],
    [0.14, 0.16, 0.62, 0.5, 8],
    [0.4, 0.34, 0.34, 0.98, 8],
    [0.06, 0.46, 0.26, 1.28, 8],
  ];

  const geometries: THREE.BufferGeometry[] = [];
  for (const [rt, rb, h, py, sides] of parts) {
    const geometry = new THREE.CylinderGeometry(rt, rb, h, sides);
    geometry.translate(0, py, 0);
    geometries.push(geometry);
  }
  const mesh = new THREE.Mesh(mergeGeometries(geometries), stone);
  geometries.forEach((g) => g.dispose());
  group.add(mesh);
  addOutline(mesh, { color: theme.ink, pixels: 2.5 });

  // The flame: a small emissive core the bloom pass picks up at dusk.
  const flameMaterial = new CelMaterial({
    color: 0xffd27a,
    emissive: 0xffb347,
    emissiveStrength: 2.4,
    bands: 3,
    rimStrength: 0,
  });
  const flame = new THREE.Mesh(unitCylinder(8), flameMaterial);
  flame.scale.set(0.16, 0.24, 0.16);
  flame.position.y = 0.98;
  flame.name = 'lantern-flame';
  group.add(flame);

  return group;
}

/**
 * Poisson-ish scatter: jittered grid points, rejected if they fall inside an
 * avoid-circle. A grid keeps distribution even (pure random clumps badly) and
 * costs a fraction of true Poisson-disc sampling.
 */
function scatterPoints(options: ScatterOptions): Array<{ x: number; z: number }> {
  const { count, x, z, width, depth, seed = 1, avoid = [] } = options;
  if (count <= 0) return [];

  const rng = new Rng(seed);
  const points: Array<{ x: number; z: number }> = [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * (width / Math.max(depth, 0.001)))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellW = width / columns;
  const cellD = depth / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (points.length >= count) break;
      const px = x - width / 2 + (c + 0.5) * cellW + rng.range(-cellW * 0.42, cellW * 0.42);
      const pz = z - depth / 2 + (r + 0.5) * cellD + rng.range(-cellD * 0.42, cellD * 0.42);

      let blocked = false;
      for (const zone of avoid) {
        if ((px - zone.x) ** 2 + (pz - zone.z) ** 2 < zone.radius * zone.radius) {
          blocked = true;
          break;
        }
      }
      if (!blocked) points.push({ x: px, z: pz });
    }
  }

  return points;
}
