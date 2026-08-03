import * as THREE from 'three';
import { CelMaterial } from '../render/CelMaterial';
import { cloudTexture, grassTexture } from '../render/TextureFactory';
import { LAYER_NO_EDGE } from '../render/Renderer';
import { addOutline } from '../render/OutlineMaterial';
import { Rng, TAU, clamp01, fbm2D } from '../util/math';
import { disposeObject } from '../util/dispose';
import type { Theme } from '../render/Palette';

/**
 * The world *around* the hole: distant mountain silhouettes, drifting clouds and
 * the ground plane the course floats above.
 *
 * All of it is decorative and never collides. It is rebuilt per theme (not per
 * hole) and lives on `LAYER_NO_EDGE` where interior ink lines would only add
 * noise at that distance.
 */
export class Environment {
  readonly group = new THREE.Group();

  private cloudSprites: Array<{ mesh: THREE.Mesh; speed: number; bob: number }> = [];

  constructor() {
    this.group.name = 'environment';
  }

  build(theme: Theme): void {
    this.clear();

    if (theme.id === 'sky') {
      // The Sky Islands course is meant to feel bottomless: no ground, just a
      // deep cloud sea far below.
      this.group.add(this.buildCloudSea(theme));
    } else {
      this.group.add(this.buildGround(theme));
    }

    this.group.add(this.buildMountains(theme));
    this.group.add(this.buildClouds(theme));

    if (theme.id === 'neon') this.group.add(this.buildNeonSkyline(theme));
  }

  /** A wide, gently undulating plane far below the course. */
  private buildGround(theme: Theme): THREE.Mesh {
    const size = 420;
    const segments = 48;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    // Rolling hills via fbm. The centre is flattened so the course never
    // intersects a hill it did not ask for.
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const distance = Math.hypot(x, z);
      const mask = THREE.MathUtils.smoothstep(distance, 34, 130);
      const height = (fbm2D(x / 55, z / 55, 4, 3) - 0.5) * 34;
      position.setY(i, height * mask - 8);
    }
    geometry.computeVertexNormals();

    // Unmown, and a shade deeper than the course, so the fairway reads as a
    // maintained thing sitting inside rough country rather than as one more
    // patch of the same lawn.
    // The shift goes into the *texture*, not the material tint: `uColor` and the
    // map multiply, so tinting a map that already carries the colour squares it.
    const rough = new THREE.Color(theme.green).offsetHSL(-0.02, -0.12, -0.08).getHex();
    const roughAlt = new THREE.Color(theme.greenAlt).offsetHSL(-0.02, -0.12, -0.08).getHex();
    const material = new CelMaterial({
      color: 0xffffff,
      map: grassTexture(rough, roughAlt, false),
      mapScale: [24, 24],
      bands: 4,
      rimColor: theme.rim,
      rimStrength: 0.1,
      shadowTint: 0.3,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'ground';
    mesh.layers.set(LAYER_NO_EDGE);
    return mesh;
  }

  /**
   * An ocean of cloud far below the islands.
   *
   * Earlier this was three flat translucent discs. Seen from a camera only a
   * few units above the play surface they present almost edge-on, so they
   * collapsed into a single pale band at the horizon and the whole lower half
   * of the frame became a flat cream wash — the opposite of the vertigo the
   * course is built around.
   *
   * Displacing the layers with fbm fixes it for two reasons. Billowing tops
   * catch the key light, and the cel material's three bands turn that into hard
   * light/shade steps, so the surface reads as *volume* rather than as a plane.
   * And because the relief is a few units tall, the near tops occlude the far
   * ones, which is the only depth cue available when there is nothing else out
   * there to judge distance against.
   */
  private buildCloudSea(theme: Theme): THREE.Group {
    const group = new THREE.Group();
    group.name = 'cloudsea';
    const rng = new Rng(404);

    for (let layer = 0; layer < 3; layer++) {
      const span = 460 - layer * 60;
      // 40 segments across a 400-unit span is one vertex every ~10 units, which
      // is about the size a single cloud top wants to be at this distance.
      const geometry = new THREE.PlaneGeometry(span, span, 40, 40);
      geometry.rotateX(-Math.PI / 2);

      const position = geometry.attributes.position as THREE.BufferAttribute;
      const half = span / 2;
      const seed = layer * 13.7;
      for (let i = 0; i < position.count; i++) {
        const px = position.getX(i);
        const pz = position.getZ(i);
        // Radial falloff so the sheet settles flat at its rim and never shows a
        // hard cut-off edge against the sky.
        const edge = clamp01(1 - Math.hypot(px, pz) / half);
        const relief = fbm2D(px * 0.012 + seed, pz * 0.012 - seed);
        position.setY(i, relief * 24 * (edge * edge));
      }
      geometry.computeVertexNormals();

      const material = new CelMaterial({
        // The top layer is the bright cloud deck; lower layers fall toward the
        // horizon glow, which is what sells them as being further down.
        // Not pure white: a cloud deck at full white clips through the bloom
        // pass and reads as snow. A faint sky tint keeps it in the palette.
        color: layer === 0 ? 0xeef5ff : new THREE.Color(theme.skyBottom).getHex(),
        opacity: 0.78 - layer * 0.18,
        transparent: true,
        depthWrite: false,
        bands: 3,
        rimColor: theme.rim,
        rimStrength: 0.25,
        fog: 0.4,
      });

      const mesh = new THREE.Mesh(geometry, material);
      // Far enough down that the relief reads in silhouette rather than being
      // seen almost edge-on from the play surface.
      mesh.position.y = -68 - layer * 26;
      mesh.position.x = rng.range(-20, 20);
      mesh.position.z = rng.range(-20, 20);
      mesh.layers.set(LAYER_NO_EDGE);
      mesh.renderOrder = -10 + layer;
      group.add(mesh);
    }
    return group;
  }

  /**
   * Distant ranges built from extruded triangular prisms.
   * Three rings at different radii, each tinted further toward the fog colour —
   * a cheap, very readable atmospheric-perspective cue.
   */
  private buildMountains(theme: Theme): THREE.Group {
    const group = new THREE.Group();
    group.name = 'mountains';

    const rings = [
      { radius: 200, count: 14, height: 46, tint: 0.35 },
      { radius: 265, count: 12, height: 66, tint: 0.55 },
      { radius: 330, count: 10, height: 88, tint: 0.72 },
    ];

    const rng = new Rng(1337);
    const fog = new THREE.Color(theme.fogColor);

    for (const ring of rings) {
      const base = new THREE.Color(theme.id === 'neon' ? theme.wall : theme.greenAlt);
      const color = base.clone().lerp(fog, ring.tint);

      const material = new CelMaterial({
        color: color.getHex(),
        bands: 3,
        rimColor: theme.rim,
        rimStrength: 0.16,
        specular: 0,
        shadowTint: 0.12,
        fog: 0.85,
      });

      // One merged geometry per ring keeps a whole horizon at a single draw call.
      const geometries: THREE.BufferGeometry[] = [];
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * TAU + rng.range(-0.12, 0.12);
        const radius = ring.radius * rng.range(0.92, 1.08);
        const height = ring.height * rng.range(0.7, 1.3);
        const width = ring.radius * rng.range(0.28, 0.42);

        const shape = new THREE.Shape();
        shape.moveTo(-width / 2, 0);
        // Asymmetric peak with one shoulder — a symmetric triangle reads as a
        // party hat, not a mountain.
        shape.lineTo(-width * 0.12, height * rng.range(0.62, 0.8));
        shape.lineTo(width * 0.04, height);
        shape.lineTo(width * 0.22, height * rng.range(0.55, 0.75));
        shape.lineTo(width / 2, 0);
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: width * 0.5,
          bevelEnabled: false,
          curveSegments: 1,
        });

        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, -angle + Math.PI / 2, 0),
        );
        matrix.compose(
          new THREE.Vector3(Math.cos(angle) * radius, -10, Math.sin(angle) * radius),
          quaternion,
          new THREE.Vector3(1, 1, 1),
        );
        geometry.applyMatrix4(matrix);
        geometries.push(geometry);
      }

      const merged = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, material);
      mesh.layers.set(LAYER_NO_EDGE);
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    return group;
  }

  /** Camera-facing cloud billboards that drift and slowly bob. */
  private buildClouds(theme: Theme): THREE.Group {
    const group = new THREE.Group();
    group.name = 'clouds';
    const rng = new Rng(2024);
    const texture = cloudTexture();
    const count = theme.id === 'neon' ? 6 : 16;

    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: rng.range(0.5, 0.9),
        color: new THREE.Color(theme.id === 'neon' ? theme.accentAlt : 0xffffff),
        fog: false,
      });

      const scale = rng.range(28, 70);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale * 0.5), material);
      const angle = rng.range(0, TAU);
      const radius = rng.range(90, 210);
      mesh.position.set(
        Math.cos(angle) * radius,
        rng.range(24, 62),
        Math.sin(angle) * radius,
      );
      mesh.renderOrder = -500;
      mesh.layers.set(LAYER_NO_EDGE);
      group.add(mesh);

      this.cloudSprites.push({
        mesh,
        speed: rng.range(0.25, 0.8),
        bob: rng.range(0, TAU),
      });
    }

    return group;
  }

  /** Arcade backdrop: a bank of glowing towers behind the course. */
  private buildNeonSkyline(theme: Theme): THREE.Group {
    const group = new THREE.Group();
    group.name = 'skyline';
    const rng = new Rng(808);

    const towerMaterial = new CelMaterial({
      color: 0x140d2e,
      bands: 3,
      rimColor: theme.accent,
      rimStrength: 0.75,
      rimPower: 1.9,
      shadowTint: 0.1,
      fog: 0.9,
    });

    const geometries: THREE.BufferGeometry[] = [];
    const stripGeometries: THREE.BufferGeometry[] = [];

    for (let i = 0; i < 42; i++) {
      const angle = rng.range(0, TAU);
      const radius = rng.range(95, 175);
      const width = rng.range(6, 16);
      const height = rng.range(18, 74);

      const box = new THREE.BoxGeometry(width, height, width);
      box.translate(Math.cos(angle) * radius, height / 2 - 12, Math.sin(angle) * radius);
      geometries.push(box);

      // A vertical light strip up one face; these are what the bloom pass grabs.
      const strip = new THREE.BoxGeometry(width * 0.14, height * 0.8, width * 0.14);
      strip.translate(
        Math.cos(angle) * (radius - width * 0.52),
        height / 2 - 12,
        Math.sin(angle) * (radius - width * 0.52),
      );
      stripGeometries.push(strip);
    }

    const towers = new THREE.Mesh(mergeGeometries(geometries), towerMaterial);
    towers.layers.set(LAYER_NO_EDGE);
    towers.frustumCulled = false;
    group.add(towers);
    geometries.forEach((g) => g.dispose());

    const stripMaterial = new CelMaterial({
      color: theme.accent,
      emissive: theme.accent,
      emissiveStrength: 1.5,
      bands: 3,
      rimStrength: 0,
      fog: 0.5,
    });
    const strips = new THREE.Mesh(mergeGeometries(stripGeometries), stripMaterial);
    strips.layers.set(LAYER_NO_EDGE);
    strips.frustumCulled = false;
    group.add(strips);
    stripGeometries.forEach((g) => g.dispose());

    return group;
  }

  update(dt: number, elapsed: number, camera: THREE.Camera): void {
    for (const cloud of this.cloudSprites) {
      cloud.mesh.position.x += cloud.speed * dt;
      cloud.mesh.position.y += Math.sin(elapsed * 0.3 + cloud.bob) * dt * 0.4;
      // Wrap around rather than respawn — no allocation, no popping in the
      // player's forward view.
      if (cloud.mesh.position.x > 230) cloud.mesh.position.x = -230;
      cloud.mesh.quaternion.copy(camera.quaternion);
    }
  }

  clear(): void {
    this.cloudSprites = [];
    for (const child of [...this.group.children]) disposeObject(child);
    this.group.clear();
  }

  dispose(): void {
    this.clear();
    this.group.parent?.remove(this.group);
  }
}

/**
 * Minimal geometry merge for non-indexed/indexed position+normal+uv buffers.
 *
 * Three ships `BufferGeometryUtils.mergeGeometries`, but importing it pulls in
 * the whole utils module for one function; this handles exactly the attribute
 * layout the environment generates.
 */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  if (geometries.length === 0) return merged;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  // Vertex colours are only emitted if at least one input carries them —
  // otherwise every merged surface would pay for an attribute it never reads.
  // Where one input has them and another does not, the missing side defaults to
  // white so it passes through the shader's multiply unchanged. Silently
  // dropping the attribute instead is worse than useless: a material with
  // `vertexColors` on and no attribute reads the generic vertex attribute,
  // which is black, and the whole surface renders unlit.
  const anyColors = geometries.some((g) => g.attributes.color !== undefined);

  for (const geometry of geometries) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.attributes.position as THREE.BufferAttribute;
    const normal = source.attributes.normal as THREE.BufferAttribute | undefined;
    const uv = source.attributes.uv as THREE.BufferAttribute | undefined;
    const color = source.attributes.color as THREE.BufferAttribute | undefined;

    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      if (normal) normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      else normals.push(0, 1, 0);
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
      else uvs.push(0, 0);
      if (anyColors) {
        if (color) colors.push(color.getX(i), color.getY(i), color.getZ(i));
        else colors.push(1, 1, 1);
      }
    }

    if (source !== geometry) source.dispose();
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (anyColors) merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

// Re-exported so course props can build merged decorations too.
export { addOutline };
