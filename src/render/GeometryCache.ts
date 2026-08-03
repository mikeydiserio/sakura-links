import * as THREE from 'three';
import { markShared } from '../util/dispose';
import { TAU, Rng } from '../util/math';

/**
 * Shared, immutable geometry.
 *
 * Nine holes reuse the same box, cylinder and prop shapes constantly. Building
 * them once and marking them `shared` means hole teardown frees only the
 * genuinely unique meshes, and the GPU keeps one vertex buffer per shape for the
 * lifetime of the session.
 *
 * All primitives are unit-sized and scaled at instance time — a box is 1×1×1,
 * a cylinder is radius 1 / height 1 — so a single buffer serves every wall,
 * post and bumper in the game.
 */
const cache = new Map<string, THREE.BufferGeometry>();

function memo(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = cache.get(key);
  if (hit) return hit;
  const geometry = markShared(build());
  cache.set(key, geometry);
  return geometry;
}

export const unitBox = (): THREE.BufferGeometry =>
  memo('box', () => new THREE.BoxGeometry(1, 1, 1));

export const unitCylinder = (segments = 20): THREE.BufferGeometry =>
  memo(`cyl:${segments}`, () => new THREE.CylinderGeometry(1, 1, 1, segments));

export const unitCone = (segments = 16): THREE.BufferGeometry =>
  memo(`cone:${segments}`, () => new THREE.ConeGeometry(1, 1, segments));

export const unitSphere = (segments = 18): THREE.BufferGeometry =>
  memo(`sphere:${segments}`, () => new THREE.SphereGeometry(1, segments, Math.ceil(segments / 2)));

export const unitTorus = (): THREE.BufferGeometry =>
  memo('torus', () => new THREE.TorusGeometry(1, 0.22, 10, 28));

export const unitPlane = (): THREE.BufferGeometry =>
  memo('plane', () => new THREE.PlaneGeometry(1, 1, 1, 1));

/** A quad lying in XZ with its origin at the centre, facing +Y. */
export const groundPlane = (segments = 1): THREE.BufferGeometry =>
  memo(`groundplane:${segments}`, () => {
    const geometry = new THREE.PlaneGeometry(1, 1, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });

/**
 * Low-poly rock: an icosahedron with vertices jittered along their normals.
 * Faceting is preserved (`flatShading` equivalent) by computing flat normals so
 * the cel bands break cleanly on each face.
 */
export const rockGeometry = (variant = 0): THREE.BufferGeometry =>
  memo(`rock:${variant}`, () => {
    // PolyhedronGeometry already emits non-indexed triangles, so no conversion
    // is needed — calling toNonIndexed() here only logs a warning.
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const rng = new Rng(variant * 977 + 13);
    const vertex = new THREE.Vector3();
    // Jitter per *unique position*, not per vertex, so shared corners stay welded.
    const offsets = new Map<string, number>();
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      const key = `${vertex.x.toFixed(3)}|${vertex.y.toFixed(3)}|${vertex.z.toFixed(3)}`;
      let scale = offsets.get(key);
      if (scale === undefined) {
        scale = rng.range(0.74, 1.18);
        offsets.set(key, scale);
      }
      vertex.multiplyScalar(scale);
      vertex.y *= 0.72;
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  });

/** Stylised blade of grass: a tapered, slightly curved quad strip. */
export const grassBlade = (): THREE.BufferGeometry =>
  memo('grassblade', () => {
    const segments = 3;
    const height = 1;
    const halfWidth = 0.07;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const w0 = halfWidth * (1 - t0 * 0.85);
      const w1 = halfWidth * (1 - t1 * 0.85);
      // Gentle forward curl so blades do not read as flat cards.
      const z0 = t0 * t0 * 0.16;
      const z1 = t1 * t1 * 0.16;
      const y0 = t0 * height;
      const y1 = t1 * height;

      positions.push(-w0, y0, z0, w0, y0, z0, w1, y1, z1);
      positions.push(-w0, y0, z0, w1, y1, z1, -w1, y1, z1);
      for (let n = 0; n < 6; n++) normals.push(0, 0.35, 1);
      uvs.push(0, t0, 1, t0, 1, t1, 0, t0, 1, t1, 0, t1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    return geometry;
  });

/** Five-petal blossom built from extruded shapes — used for ground flowers. */
export const flowerGeometry = (): THREE.BufferGeometry =>
  memo('flower', () => {
    const shape = new THREE.Shape();
    const petals = 5;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      // Rose curve: r = 0.4 + 0.6|cos(2.5θ)| gives five soft lobes.
      const r = 0.42 + 0.58 * Math.abs(Math.cos((a * petals) / 2));
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSize: 0.05,
      bevelThickness: 0.05,
      bevelSegments: 1,
      curveSegments: 2,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  });

/**
 * Rounded-rectangle plate used for platforms, signage and arcade panels.
 * Built with ExtrudeGeometry so the bevel picks up a clean specular band.
 */
export const roundedPlate = (radius = 0.2, depth = 0.2): THREE.BufferGeometry =>
  memo(`plate:${radius}:${depth}`, () => {
    const w = 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(-w + radius, -w);
    shape.lineTo(w - radius, -w);
    shape.quadraticCurveTo(w, -w, w, -w + radius);
    shape.lineTo(w, w - radius);
    shape.quadraticCurveTo(w, w, w - radius, w);
    shape.lineTo(-w + radius, w);
    shape.quadraticCurveTo(-w, w, -w, w - radius);
    shape.lineTo(-w, -w + radius);
    shape.quadraticCurveTo(-w, -w, -w + radius, -w);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.035,
      bevelThickness: 0.035,
      bevelSegments: 1,
      curveSegments: 3,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, depth / 2, 0);
    geometry.computeVertexNormals();
    return geometry;
  });

/** Chevron arrow used on boost pads and aim indicators. */
export const chevronGeometry = (): THREE.BufferGeometry =>
  memo('chevron', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.5);
    shape.lineTo(0.5, 0);
    shape.lineTo(0.5, -0.22);
    shape.lineTo(0, 0.28);
    shape.lineTo(-0.5, -0.22);
    shape.lineTo(-0.5, 0);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });

/** Windmill blade: a tapered paddle with a slight twist. */
export const bladeGeometry = (): THREE.BufferGeometry =>
  memo('blade', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.12, 0);
    shape.lineTo(0.12, 0);
    shape.lineTo(0.28, 1);
    shape.lineTo(-0.28, 1);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -0.05);
    geometry.computeVertexNormals();
    return geometry;
  });

/** Torii-gate cross-section, extruded — a Sakura Gardens landmark. */
export const toriiPost = (): THREE.BufferGeometry =>
  memo('toriipost', () => {
    const geometry = new THREE.CylinderGeometry(0.85, 1, 1, 10);
    return geometry;
  });

export function disposeGeometryCache(): void {
  for (const geometry of cache.values()) geometry.dispose();
  cache.clear();
}
