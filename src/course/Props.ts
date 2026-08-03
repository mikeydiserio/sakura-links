import * as THREE from 'three';
import { CelMaterial } from '../render/CelMaterial';
import { addOutline } from '../render/OutlineMaterial';
import { unitBox, unitCylinder, unitSphere, rockGeometry, unitTorus } from '../render/GeometryCache';
import { mergeGeometries } from '../world/Environment';
import { buildBamboo, buildLantern } from '../world/Foliage';
import { woodTexture, stoneTexture } from '../render/TextureFactory';
import { Rng, TAU } from '../util/math';
import type { Theme } from '../render/Palette';
import type { PropKind } from './types';

/**
 * Decorative set dressing. None of it collides — props exist purely to make the
 * course feel like a place rather than a layout.
 *
 * Anything that moves returns an `update` callback which the hole runtime ticks;
 * anything static returns just an object, so the update list stays as short as
 * the animation actually requires.
 */
export interface PropResult {
  object: THREE.Object3D;
  update?: (dt: number, elapsed: number) => void;
}

export interface PropOptions {
  x: number;
  z: number;
  y: number;
  rotY: number;
  scale: number;
  color?: number;
}

export function buildProp(type: PropKind, theme: Theme, options: PropOptions): PropResult {
  switch (type) {
    case 'lantern':
      return { object: place(buildLantern(0, 0, 0, theme), options) };
    case 'bamboo':
      return { object: place(buildBamboo(0, 0, 0, Math.round(options.x * 71 + options.z), theme), options) };
    case 'torii':
      return { object: place(buildTorii(theme), options) };
    case 'rock':
      return { object: place(buildRock(theme, options), options) };
    case 'bridge':
      return { object: place(buildBridge(theme), options) };
    case 'chime':
      return buildChime(theme, options);
    case 'crystal':
      return buildCrystal(theme, options);
    case 'arcadeSign':
      return buildArcadeSign(theme, options);
    case 'balloon':
      return buildBalloon(theme, options);
    case 'pillar':
      return { object: place(buildPillar(theme), options) };
    case 'koi':
      return buildKoi(theme, options);
    default:
      return { object: new THREE.Group() };
  }
}

function place(object: THREE.Object3D, options: PropOptions): THREE.Object3D {
  object.position.set(options.x, options.y, options.z);
  object.rotation.y = options.rotY;
  object.scale.multiplyScalar(options.scale);
  return object;
}

/** Vermilion torii gate — two posts, a curved lintel and a tie beam. */
function buildTorii(theme: Theme): THREE.Group {
  const group = new THREE.Group();
  const material = new CelMaterial({
    color: 0xd4453a,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.4,
    specular: 0.15,
    shadowTint: 0.3,
  });

  const geometries: THREE.BufferGeometry[] = [];
  const postHeight = 3.4;

  for (const side of [-1, 1]) {
    const post = new THREE.CylinderGeometry(0.14, 0.19, postHeight, 10);
    post.translate(side * 1.5, postHeight / 2, 0);
    geometries.push(post);
  }

  // Kasagi (top lintel): built from three boxes with a slight upward sweep at
  // each end — the detail that makes a torii read as a torii.
  const centre = new THREE.BoxGeometry(4.0, 0.22, 0.42);
  centre.translate(0, postHeight + 0.28, 0);
  geometries.push(centre);

  for (const side of [-1, 1]) {
    const tip = new THREE.BoxGeometry(0.7, 0.2, 0.42);
    tip.rotateZ(side * -0.16);
    tip.translate(side * 2.25, postHeight + 0.34, 0);
    geometries.push(tip);
  }

  const nuki = new THREE.BoxGeometry(3.5, 0.17, 0.3);
  nuki.translate(0, postHeight - 0.62, 0);
  geometries.push(nuki);

  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  geometries.forEach((g) => g.dispose());
  group.add(mesh);
  addOutline(mesh, { color: theme.ink, pixels: 3 });
  return group;
}

function buildRock(theme: Theme, options: PropOptions): THREE.Group {
  const group = new THREE.Group();
  const rng = new Rng(Math.round(options.x * 131 + options.z * 17));
  const material = new CelMaterial({
    color: options.color ?? theme.wall,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.28,
    shadowTint: 0.4,
  });
  const mesh = new THREE.Mesh(rockGeometry(rng.int(0, 3)), material);
  mesh.scale.set(rng.range(0.8, 1.4), rng.range(0.6, 1.1), rng.range(0.8, 1.4));
  mesh.rotation.y = rng.range(0, TAU);
  mesh.position.y = mesh.scale.y * 0.4;
  group.add(mesh);
  addOutline(mesh, { color: theme.ink, pixels: 2.5 });
  return group;
}

/** Arched wooden footbridge with railings. */
function buildBridge(theme: Theme): THREE.Group {
  const group = new THREE.Group();

  const deckMaterial = new CelMaterial({
    color: 0xffffff,
    map: woodTexture(0xc0693f),
    mapScale: [3, 1],
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.3,
    shadowTint: 0.3,
  });

  // Deck: planks stepped along an arc so the bridge curves over the pond.
  const planks = 12;
  const span = 12.4;
  const width = 3.2;
  const rise = 0.95;
  const deckGeometries: THREE.BufferGeometry[] = [];
  for (let i = 0; i < planks; i++) {
    const t = i / (planks - 1);
    const x = (t - 0.5) * span;
    const y = Math.sin(t * Math.PI) * rise;
    const angle = Math.cos(t * Math.PI) * -0.45;
    const plank = new THREE.BoxGeometry(span / planks + 0.06, 0.14, width);
    plank.rotateZ(angle);
    plank.translate(x, y, 0);
    deckGeometries.push(plank);
  }
  const deck = new THREE.Mesh(mergeGeometries(deckGeometries), deckMaterial);
  deckGeometries.forEach((g) => g.dispose());
  group.add(deck);
  addOutline(deck, { color: theme.ink, pixels: 2.5 });

  // Railings.
  const railMaterial = new CelMaterial({
    color: 0xd4453a,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.35,
    shadowTint: 0.3,
  });
  const railGeometries: THREE.BufferGeometry[] = [];
  const railOffset = width / 2 + 0.15;
  for (const side of [-1, 1]) {
    for (let i = 0; i < planks; i += 2) {
      const t = i / (planks - 1);
      const x = (t - 0.5) * span;
      const y = Math.sin(t * Math.PI) * rise;
      const post = new THREE.BoxGeometry(0.1, 0.62, 0.1);
      post.translate(x, y + 0.34, side * railOffset);
      railGeometries.push(post);
    }
    for (let i = 0; i < planks - 1; i++) {
      const t0 = i / (planks - 1);
      const t1 = (i + 1) / (planks - 1);
      const x0 = (t0 - 0.5) * span;
      const x1 = (t1 - 0.5) * span;
      const y0 = Math.sin(t0 * Math.PI) * rise + 0.62;
      const y1 = Math.sin(t1 * Math.PI) * rise + 0.62;
      const bar = new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.02, 0.09, 0.09);
      bar.rotateZ(Math.atan2(y1 - y0, x1 - x0));
      bar.translate((x0 + x1) / 2, (y0 + y1) / 2, side * railOffset);
      railGeometries.push(bar);
    }
  }
  const rails = new THREE.Mesh(mergeGeometries(railGeometries), railMaterial);
  railGeometries.forEach((g) => g.dispose());
  group.add(rails);
  addOutline(rails, { color: theme.ink, pixels: 2 });

  // Arch beams.
  const archGeometries: THREE.BufferGeometry[] = [];
  const archOffset = railOffset + 0.07;
  const archThickness = 0.16;
  for (const side of [-1, 1]) {
    for (let i = 0; i < planks; i++) {
      const t = i / (planks - 1);
      const x = (t - 0.5) * span;
      const y = Math.sin(t * Math.PI) * rise + 0.36;
      const angle = Math.cos(t * Math.PI) * -0.45;
      const beam = new THREE.BoxGeometry(span / planks + 0.02, archThickness, 0.12);
      beam.rotateZ(angle);
      beam.translate(x, y, side * archOffset);
      archGeometries.push(beam);
    }
  }
  const arches = new THREE.Mesh(mergeGeometries(archGeometries), railMaterial);
  archGeometries.forEach((g) => g.dispose());
  group.add(arches);
  addOutline(arches, { color: theme.ink, pixels: 2 });

  return group;
}

/** Hanging wind chime — swings gently and is the visual cue for the wind system. */
function buildChime(theme: Theme, options: PropOptions): PropResult {
  const group = new THREE.Group();
  const pivot = new THREE.Group();

  const frameMaterial = new CelMaterial({
    color: 0x8a6a45,
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.3,
  });
  const post = new THREE.Mesh(unitCylinder(8), frameMaterial);
  post.scale.set(0.08, 2.6, 0.08);
  post.position.y = 1.3;
  group.add(post);

  const arm = new THREE.Mesh(unitBox(), frameMaterial);
  // The post is 0.16 wide (2x its 0.08 radius) but the arm's original 0.09
  // cross-section was thinner than that in both x and z — the arm sat inside
  // the post's silhouette rather than the other way round, so for the ~4.5cm
  // of vertical run where post and arm actually overlap, the post's round
  // surface poked out through the arm's flat front/back/end faces. Widened so
  // the arm's socket comfortably contains the post's full diameter with a
  // couple of centimetres to spare.
  arm.scale.set(1.18, 0.09, 0.2);
  arm.position.set(0.5, 2.6, 0);
  group.add(arm);
  addOutline(post, { color: theme.ink, pixels: 2 });
  addOutline(arm, { color: theme.ink, pixels: 2 });

  const chimeMaterial = new CelMaterial({
    color: theme.accent,
    bands: 3,
    specular: 0.45,
    rimColor: 0xffffff,
    rimStrength: 0.5,
  });

  const rng = new Rng(Math.round(options.x * 53 + options.z * 29));
  for (let i = 0; i < 5; i++) {
    const tube = new THREE.Mesh(unitCylinder(6), chimeMaterial);
    const length = rng.range(0.3, 0.62);
    tube.scale.set(0.035, length, 0.035);
    tube.position.set(0.16 + i * 0.17, 2.44 - length / 2, 0);
    pivot.add(tube);
  }
  pivot.position.set(0, 0, 0);
  group.add(pivot);

  place(group, options);

  return {
    object: group,
    update: (_dt, elapsed) => {
      pivot.rotation.z = Math.sin(elapsed * 1.6) * 0.09;
      pivot.rotation.x = Math.cos(elapsed * 1.1) * 0.06;
    },
  };
}

/** Floating arcade crystal — spins and bobs, heavily emissive for the bloom pass. */
function buildCrystal(theme: Theme, options: PropOptions): PropResult {
  const group = new THREE.Group();
  const color = options.color ?? theme.accent;

  const material = new CelMaterial({
    color,
    emissive: color,
    emissiveStrength: 1.1,
    bands: 3,
    specular: 0.6,
    rimColor: 0xffffff,
    rimStrength: 0.8,
    rimPower: 1.6,
    opacity: 0.92,
    transparent: true,
  });

  const geometry = new THREE.OctahedronGeometry(0.55, 0);
  const crystal = new THREE.Mesh(geometry, material);
  crystal.scale.set(1, 1.7, 1);
  crystal.position.y = 1.2;
  group.add(crystal);
  addOutline(crystal, { color: theme.ink, pixels: 2.5 });

  const ring = new THREE.Mesh(unitTorus(), new CelMaterial({
    color,
    emissive: color,
    emissiveStrength: 0.8,
    bands: 3,
    rimStrength: 0,
  }));
  ring.scale.set(0.75, 0.75, 0.75);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.2;
  group.add(ring);

  place(group, options);

  return {
    object: group,
    update: (_dt, elapsed) => {
      crystal.rotation.y = elapsed * 1.1;
      crystal.position.y = 1.2 + Math.sin(elapsed * 1.7) * 0.14;
      ring.rotation.z = elapsed * 0.8;
      ring.position.y = crystal.position.y;
    },
  };
}

/** Backlit arcade sign with an animated chase-light border. */
function buildArcadeSign(theme: Theme, options: PropOptions): PropResult {
  const group = new THREE.Group();

  const panel = new THREE.Mesh(
    unitBox(),
    new CelMaterial({
      color: 0x1a1038,
      bands: 3,
      rimColor: theme.accent,
      rimStrength: 0.9,
      rimPower: 1.7,
    }),
  );
  // The post is 0.32 wide (2x its 0.16 radius) but the panel was only 0.22
  // deep — thinner than the post's own diameter — so for the top ~10cm of the
  // post that rises into the panel's footprint, the post's round surface broke
  // out through both the panel's front and back faces instead of staying
  // hidden inside it. Deepened the panel so it comfortably sockets the full
  // post diameter with margin to spare.
  panel.scale.set(3.4, 1.6, 0.36);
  panel.position.y = 2.6;
  group.add(panel);
  addOutline(panel, { color: theme.ink, pixels: 3 });

  const post = new THREE.Mesh(unitCylinder(8), new CelMaterial({ color: 0x241a4a, bands: 3 }));
  post.scale.set(0.16, 1.9, 0.16);
  post.position.y = 0.95;
  group.add(post);

  // Chase lights: a ring of emissive dots pulsed in sequence.
  const bulbs: THREE.Mesh[] = [];
  const bulbMaterialA = new CelMaterial({
    color: theme.accent,
    emissive: theme.accent,
    emissiveStrength: 2.2,
    bands: 3,
    rimStrength: 0,
  });
  const bulbMaterialB = new CelMaterial({
    color: theme.accentAlt,
    emissive: theme.accentAlt,
    emissiveStrength: 2.2,
    bands: 3,
    rimStrength: 0,
  });

  const perSide = 7;
  for (let i = 0; i < perSide; i++) {
    for (const sy of [-1, 1]) {
      const bulb = new THREE.Mesh(unitSphere(6), i % 2 ? bulbMaterialA : bulbMaterialB);
      bulb.scale.setScalar(0.09);
      // Panel's front face moved from z=0.11 to z=0.18 when it was deepened
      // (see above) to stop the post poking through it; keep the bulbs at the
      // same ~2cm stand-off from the front face rather than the old absolute z,
      // or they'd now be sitting inside the panel instead of on top of it.
      bulb.position.set(-1.6 + (i / (perSide - 1)) * 3.2, 2.6 + sy * 0.78, 0.2);
      group.add(bulb);
      bulbs.push(bulb);
    }
  }

  place(group, options);

  return {
    object: group,
    update: (_dt, elapsed) => {
      for (let i = 0; i < bulbs.length; i++) {
        const pulse = 0.6 + 0.4 * Math.sin(elapsed * 6 - i * 0.5);
        bulbs[i].scale.setScalar(0.07 + pulse * 0.05);
      }
    },
  };
}

/** Tethered balloon that bobs — a Sky Islands landmark for judging distance. */
function buildBalloon(theme: Theme, options: PropOptions): PropResult {
  const group = new THREE.Group();
  const color = options.color ?? theme.accentAlt;

  const balloon = new THREE.Mesh(
    unitSphere(14),
    new CelMaterial({
      color,
      bands: 4,
      specular: 0.35,
      rimColor: 0xffffff,
      rimStrength: 0.5,
    }),
  );
  balloon.scale.set(1.1, 1.35, 1.1);
  balloon.position.y = 4.2;
  group.add(balloon);
  addOutline(balloon, { color: theme.ink, pixels: 3 });

  const basket = new THREE.Mesh(
    unitBox(),
    new CelMaterial({ color: 0xa8763f, bands: 3, rimStrength: 0.25 }),
  );
  basket.scale.set(0.6, 0.5, 0.6);
  basket.position.y = 2.6;
  group.add(basket);
  addOutline(basket, { color: theme.ink, pixels: 2 });

  place(group, options);

  return {
    object: group,
    update: (_dt, elapsed) => {
      const bob = Math.sin(elapsed * 0.8 + options.x) * 0.3;
      balloon.position.y = 4.2 + bob;
      basket.position.y = 2.6 + bob;
      group.rotation.y = options.rotY + Math.sin(elapsed * 0.3) * 0.2;
    },
  };
}

/** Weathered stone pillar, optionally broken — vertical interest near tees. */
function buildPillar(theme: Theme): THREE.Group {
  const group = new THREE.Group();
  const material = new CelMaterial({
    color: 0xffffff,
    map: stoneTexture(theme.wall, theme.wallTop),
    mapScale: [1, 3],
    bands: 3,
    rimColor: theme.rim,
    rimStrength: 0.25,
    shadowTint: 0.35,
  });

  const geometries: THREE.BufferGeometry[] = [];
  const base = new THREE.BoxGeometry(0.9, 0.24, 0.9);
  base.translate(0, 0.12, 0);
  geometries.push(base);
  const shaft = new THREE.CylinderGeometry(0.28, 0.34, 2.6, 10);
  shaft.translate(0, 1.5, 0);
  geometries.push(shaft);
  const cap = new THREE.BoxGeometry(0.8, 0.2, 0.8);
  cap.translate(0, 2.9, 0);
  geometries.push(cap);

  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  geometries.forEach((g) => g.dispose());
  group.add(mesh);
  addOutline(mesh, { color: theme.ink, pixels: 2.5 });
  return group;
}

/** Koi swimming a slow loop just under a pond surface. */
function buildKoi(_theme: Theme, options: PropOptions): PropResult {
  const group = new THREE.Group();
  const rng = new Rng(Math.round(options.x * 97 + options.z * 43));

  const fish: Array<{ mesh: THREE.Mesh; radius: number; speed: number; phase: number }> = [];
  const bodyGeometry = new THREE.SphereGeometry(0.22, 8, 6);
  bodyGeometry.scale(1, 0.5, 2.1);

  for (let i = 0; i < 3; i++) {
    const material = new CelMaterial({
      color: rng.pick([0xff7a3d, 0xffffff, 0xffd166]),
      bands: 3,
      rimColor: 0xffffff,
      rimStrength: 0.4,
      specular: 0.3,
    });
    const mesh = new THREE.Mesh(bodyGeometry, material);
    // Geometry is shared between the three fish; teardown must not double-free.
    bodyGeometry.userData.shared = true;
    group.add(mesh);
    fish.push({
      mesh,
      radius: rng.range(0.9, 2.1),
      speed: rng.range(0.4, 0.85) * (rng.bool() ? 1 : -1),
      phase: rng.range(0, TAU),
    });
  }

  place(group, options);

  return {
    object: group,
    update: (_dt, elapsed) => {
      for (const f of fish) {
        const angle = elapsed * f.speed + f.phase;
        f.mesh.position.set(
          Math.cos(angle) * f.radius,
          Math.sin(elapsed * 1.5 + f.phase) * 0.05 - 0.12,
          Math.sin(angle) * f.radius,
        );
        f.mesh.rotation.y = -angle + Math.PI / 2;
        // Tail wag, faked by yawing the whole body slightly.
        f.mesh.rotation.z = Math.sin(elapsed * 6 + f.phase) * 0.16;
      }
    },
  };
}

/** Flag and pin that mark the cup. Returned separately so the cup can own it. */
export function buildPin(theme: Theme): { group: THREE.Group; update: (dt: number, elapsed: number) => void } {
  const group = new THREE.Group();

  const poleMaterial = new CelMaterial({
    color: 0xf5f5f5,
    bands: 3,
    specular: 0.3,
    rimColor: theme.rim,
    rimStrength: 0.4,
  });
  const pole = new THREE.Mesh(unitCylinder(8), poleMaterial);
  pole.scale.set(0.028, 1.9, 0.028);
  pole.position.y = 0.95;
  group.add(pole);
  addOutline(pole, { color: theme.ink, pixels: 1.6 });

  // Flag cloth: a small grid deformed by a travelling wave in the update loop.
  const columns = 8;
  const rows = 5;
  const clothGeometry = new THREE.PlaneGeometry(0.85, 0.5, columns, rows);
  clothGeometry.translate(0.425, 0, 0);
  const clothMaterial = new CelMaterial({
    color: theme.accentAlt,
    bands: 3,
    side: THREE.DoubleSide,
    rimColor: 0xffffff,
    rimStrength: 0.4,
    specular: 0.1,
  });
  const cloth = new THREE.Mesh(clothGeometry, clothMaterial);
  cloth.position.set(0.02, 1.66, 0);
  group.add(cloth);

  const base = clothGeometry.attributes.position.clone();

  return {
    group,
    update: (_dt, elapsed) => {
      const position = clothGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        const x = base.getX(i);
        const y = base.getY(i);
        // Amplitude grows with distance from the pole so the cloth ripples out.
        // The clamp matters: the geometry was translated to start at x = 0, so
        // the pole-side column can land on a tiny negative from float error, and
        // a negative base raised to a fractional power is NaN — which would
        // propagate into the vertex buffer and, from there, the bloom chain.
        const amount = Math.max(0, x / 0.85) ** 1.4;
        position.setZ(i, Math.sin(x * 7 - elapsed * 7 + y * 2) * 0.14 * amount);
        position.setY(i, y + Math.sin(x * 5 - elapsed * 6) * 0.03 * amount);
      }
      position.needsUpdate = true;
      clothGeometry.computeVertexNormals();
    },
  };
}
