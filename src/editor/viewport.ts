import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BuiltHole } from '../course/HoleBuilder';
import type { Piece } from '../course/types';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { Theme } from '../render/Palette';

/**
 * The editor's 3D viewport: its own renderer, camera and drafting overlays,
 * independent of the game's renderer and camera rig.
 *
 * ### Picking
 * `HoleBuilder` merges static geometry per material bucket, so preview meshes
 * cannot be raycast back to a piece. Instead every piece gets an invisible
 * axis-aligned pick box (computed from its authored bounds) and selection
 * raycasts against those boxes — the geometry itself is never touched.
 *
 * ### Camera interaction
 * Left-drag rotates (via OrbitControls) when the press starts on empty space,
 * and moves the selected piece when it starts on a pick box. Right-drag
 * pans, wheel zooms.
 */

export interface PickTarget {
  id: string;
  bounds: THREE.Box3;
}

const GHOST_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

const GHOST_DISC_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});

export class EditorViewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly domElement: HTMLCanvasElement;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pickMeshes: THREE.Mesh[] = [];
  private readonly pickIds = new Map<THREE.Mesh, string>();
  private selectionOutline: THREE.LineSegments | null = null;
  private readonly ghost = new THREE.Group();
  private readonly resizeObserver: ResizeObserver;
  private readonly grid: THREE.GridHelper;
  private readonly ground: THREE.Mesh;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.HemisphereLight;

  constructor(container: HTMLElement, theme: Theme) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.domElement = this.renderer.domElement;
    this.domElement.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(this.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
    this.camera.position.set(14, 12, 14);

    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 120;
    // Keep the camera above the floor; looking up from under the world is
    // disorienting for a course designer.
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.keyLight = new THREE.DirectionalLight(theme.lightColor, 2.4);
    this.scene.add(this.keyLight);
    this.fillLight = new THREE.HemisphereLight(theme.ambientTop, theme.ambientBottom, 1.4);
    this.scene.add(this.fillLight);

    this.grid = new THREE.GridHelper(80, 80, 0xffffff, 0xffffff);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.16;
    this.grid.position.y = 0.01;
    this.grid.visible = false;
    this.scene.add(this.grid);

    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshLambertMaterial({ color: 0x232230 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.02;
    this.scene.add(this.ground);

    this.scene.add(this.ghost);
    this.ghost.visible = false;

    this.applyTheme(theme);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  applyTheme(theme: Theme): void {
    this.renderer.setClearColor(theme.skyMid);
    this.keyLight.color.set(theme.lightColor);
    this.keyLight.position.copy(theme.lightDir).multiplyScalar(50);
    this.fillLight.color.set(theme.ambientTop);
    this.fillLight.groundColor.set(theme.ambientBottom);
    (this.ground.material as THREE.MeshLambertMaterial).color.set(theme.ink).multiplyScalar(0.35);
  }

  /** Toggles the drafting grid. */
  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  get gridVisible(): boolean {
    return this.grid.visible;
  }

  private resize(): void {
    const width = this.domElement.clientWidth || 1;
    const height = this.domElement.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // --- Frame ----------------------------------------------------------------

  frame(dt: number, elapsed: number, physics: PhysicsWorld, built: BuiltHole | null): void {
    physics.step(dt);
    if (built) {
      for (const update of built.updaters) update(dt, elapsed);
      for (const water of built.waters) water.update(elapsed, this.camera.position);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setBuiltGroup(group: THREE.Group | null): void {
    const existing = this.scene.getObjectByName('__editor_built');
    if (existing) this.scene.remove(existing);
    if (group) {
      group.name = '__editor_built';
      this.scene.add(group);
    }
  }

  // --- Picking --------------------------------------------------------------

  /** Rebuilds the invisible pick-box set. Call after every document change. */
  setPickTargets(targets: PickTarget[]): void {
    for (const mesh of this.pickMeshes) {
      this.scene.remove(mesh);
    }
    this.pickMeshes.length = 0;
    this.pickIds.clear();

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    for (const target of targets) {
      const mesh = new THREE.Mesh(geometry, material);
      target.bounds.getCenter(mesh.position);
      target.bounds.getSize(mesh.scale);
      mesh.visible = false;
      mesh.name = `pick:${target.id}`;
      this.pickMeshes.push(mesh);
      this.pickIds.set(mesh, target.id);
      this.scene.add(mesh);
    }
  }

  /** Raycasts the pick boxes. Returns the target id, or null on a miss. */
  pickAt(ndc: { x: number; y: number }): string | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
    const hits = this.raycaster.intersectObjects(this.pickMeshes, false);
    const hit = hits[0];
    return hit ? (this.pickIds.get(hit.object as THREE.Mesh) ?? null) : null;
  }

  /** Projects a screen point onto the horizontal plane at `groundY`. */
  screenToGround(ndc: { x: number; y: number }, groundY: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, point) ? point : null;
  }

  // --- Selection & ghost ----------------------------------------------------

  /** Draws (or clears) the selection box around `bounds`. */
  setSelection(bounds: THREE.Box3 | null, color = 0xffe066): void {
    if (this.selectionOutline) {
      this.scene.remove(this.selectionOutline);
      this.selectionOutline.geometry.dispose();
      this.selectionOutline = null;
    }
    if (!bounds) return;
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selectionOutline = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    bounds.getCenter(this.selectionOutline.position);
    bounds.getSize(this.selectionOutline.scale);
    this.selectionOutline.renderOrder = 10;
    this.scene.add(this.selectionOutline);
  }

  /** Translucent box that previews a placement or a drag in progress. */
  showGhostBox(bounds: THREE.Box3): void {
    this.ghost.clear();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), GHOST_MATERIAL);
    bounds.getCenter(mesh.position);
    bounds.getSize(mesh.scale);
    this.ghost.add(mesh);
    this.ghost.visible = true;
  }

  /** Translucent disc that previews tee/cup placement. */
  showGhostDisc(x: number, z: number, radius: number, y: number): void {
    this.ghost.clear();
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), GHOST_DISC_MATERIAL);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.02, z);
    this.ghost.add(mesh);
    this.ghost.visible = true;
  }

  hideGhost(): void {
    this.ghost.visible = false;
  }

  /** Smoothly move the camera to frame the given bounds (or the whole scene). */
  frameBounds(bounds: THREE.Box3 | null, animate = true): void {
    const target = bounds ?? new THREE.Box3(new THREE.Vector3(-10, -2, -10), new THREE.Vector3(10, 4, 10));
    const center = new THREE.Vector3();
    target.getCenter(center);
    const size = new THREE.Vector3();
    target.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.8 + 2;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const newPos = center.clone().add(dir.multiplyScalar(dist));
    if (animate) {
      const start = { px: this.camera.position.x, py: this.camera.position.y, pz: this.camera.position.z,
                      tx: this.controls.target.x, ty: this.controls.target.y, tz: this.controls.target.z };
      const end = { px: newPos.x, py: newPos.y, pz: newPos.z,
                    tx: center.x, ty: center.y, tz: center.z };
      let t = 0;
      const anim = () => {
        t = Math.min(1, t + 0.08);
        const ease = 1 - Math.pow(1 - t, 3);
        this.camera.position.set(start.px + (end.px - start.px) * ease,
                                 start.py + (end.py - start.py) * ease,
                                 start.pz + (end.pz - start.pz) * ease);
        this.controls.target.set(start.tx + (end.tx - start.tx) * ease,
                                 start.ty + (end.ty - start.ty) * ease,
                                 start.tz + (end.tz - start.tz) * ease);
        if (t < 1) requestAnimationFrame(anim);
      };
      anim();
    } else {
      this.camera.position.copy(newPos);
      this.controls.target.copy(center);
    }
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const mesh of this.pickMeshes) this.scene.remove(mesh);
    this.pickMeshes.length = 0;
    if (this.selectionOutline) {
      this.scene.remove(this.selectionOutline);
      this.selectionOutline.geometry.dispose();
    }
    this.ghost.clear();
    this.renderer.dispose();
  }
}

// --- Piece bounds -----------------------------------------------------------

/** Default wall height when a tile's rails use the builder default. */
const WALL_HEIGHT = 1.05;
const THICKNESS = 0.26;

/**
 * Axis-aligned world-space bounds of a piece, used for pick boxes and the
 * drag ghost. Deliberately generous: rotY is ignored (the box stays axis
 * aligned) and moving platforms span their whole travel.
 */
export function boundsForPiece(piece: Piece): THREE.Box3 {
  const min = new THREE.Vector3();
  const max = new THREE.Vector3();
  switch (piece.kind) {
    case 'tile': {
      const bottom = piece.y ?? 0;
      const walled = piece.walls !== '' && piece.walls !== undefined;
      const top = bottom + (walled ? (piece.wallHeight ?? WALL_HEIGHT) : 0.9);
      const half = 0.25;
      min.set(piece.x - piece.w / 2 - half, bottom - 0.1, piece.z - piece.d / 2 - half);
      max.set(piece.x + piece.w / 2 + half, Math.max(top, bottom + 0.5), piece.z + piece.d / 2 + half);
      break;
    }
    case 'bump': {
      const y = piece.y ?? 0;
      const r = piece.radius;
      min.set(piece.x - r, y + Math.min(0, piece.height) - 0.1, piece.z - r);
      max.set(piece.x + r, y + Math.max(0, piece.height) + 0.4, piece.z + r);
      break;
    }
    case 'rail': {
      const y = piece.y ?? 0;
      const height = piece.height ?? WALL_HEIGHT;
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of piece.points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      if (!Number.isFinite(minX)) {
        minX = -1;
        maxX = 1;
        minZ = -1;
        maxZ = 1;
      }
      min.set(minX - 0.4, y - 0.1, minZ - 0.4);
      max.set(maxX + 0.4, y + height + 0.4, maxZ + 0.4);
      break;
    }
    case 'water': {
      const y = piece.y ?? -0.1;
      min.set(piece.x - piece.w / 2, y - 0.4, piece.z - piece.d / 2);
      max.set(piece.x + piece.w / 2, y + 0.3, piece.z + piece.d / 2);
      break;
    }
    case 'bumper': {
      const r = piece.radius ?? 0.45;
      const y = piece.y ?? 0;
      min.set(piece.x - r, y, piece.z - r);
      max.set(piece.x + r, y + 1.1, piece.z + r);
      break;
    }
    case 'windmill': {
      const scale = piece.scale ?? 1;
      const y = piece.y ?? 0;
      min.set(piece.x - 1.3 * scale, y, piece.z - 1.3 * scale);
      max.set(piece.x + 1.3 * scale, y + 3.3 * scale, piece.z + 1.3 * scale);
      break;
    }
    case 'spinner': {
      const length = piece.length ?? 2.4;
      const y = piece.y ?? 0;
      const r = length / 2 + 0.4;
      min.set(piece.x - r, y, piece.z - r);
      max.set(piece.x + r, y + 1.4, piece.z + r);
      break;
    }
    case 'elevator': {
      min.set(piece.x - piece.w / 2 - THICKNESS, piece.low - 0.1, piece.z - piece.d / 2 - THICKNESS);
      max.set(piece.x + piece.w / 2 + THICKNESS, piece.high + 0.3, piece.z + piece.d / 2 + THICKNESS);
      break;
    }
    case 'mover': {
      const reach = piece.distance / 2;
      const xMin = piece.axis === 'x' ? piece.x - reach - piece.w / 2 - 0.2 : piece.x - piece.w / 2 - 0.2;
      const xMax = piece.axis === 'x' ? piece.x + reach + piece.w / 2 + 0.2 : piece.x + piece.w / 2 + 0.2;
      const zMin = piece.axis === 'z' ? piece.z - reach - piece.d / 2 - 0.2 : piece.z - piece.d / 2 - 0.2;
      const zMax = piece.axis === 'z' ? piece.z + reach + piece.d / 2 + 0.2 : piece.z + piece.d / 2 + 0.2;
      min.set(xMin, piece.y - 0.1, zMin);
      max.set(xMax, piece.y + 0.6, zMax);
      break;
    }
    case 'rotator': {
      const r = piece.radius;
      min.set(piece.x - r, piece.y - 0.1, piece.z - r);
      max.set(piece.x + r, piece.y + 0.5, piece.z + r);
      break;
    }
    case 'jump': {
      const r = piece.radius ?? 0.7;
      const y = piece.y ?? 0;
      min.set(piece.x - r, y, piece.z - r);
      max.set(piece.x + r, y + 1.7, piece.z + r);
      break;
    }
    case 'booster': {
      const w = piece.w ?? 1.4;
      const d = piece.d ?? 2.2;
      const y = piece.y ?? 0;
      min.set(piece.x - w / 2 - 0.1, y, piece.z - d / 2 - 0.1);
      max.set(piece.x + w / 2 + 0.1, y + 0.4, piece.z + d / 2 + 0.1);
      break;
    }
    case 'prop': {
      const scale = piece.scale ?? 1;
      const y = piece.y ?? 0;
      min.set(piece.x - 1.2 * scale, y, piece.z - 1.2 * scale);
      max.set(piece.x + 1.2 * scale, y + 2.4 * scale, piece.z + 1.2 * scale);
      break;
    }
    case 'tree': {
      const scale = piece.scale ?? 1;
      const y = piece.y ?? 0;
      min.set(piece.x - 1.8 * scale, y, piece.z - 1.8 * scale);
      max.set(piece.x + 1.8 * scale, y + 3.6 * scale, piece.z + 1.8 * scale);
      break;
    }
    case 'scatter': {
      const y = piece.y ?? 0;
      min.set(piece.x - piece.w / 2 - 0.2, y, piece.z - piece.d / 2 - 0.2);
      max.set(piece.x + piece.w / 2 + 0.2, y + 0.5, piece.z + piece.d / 2 + 0.2);
      break;
    }
  }
  return new THREE.Box3(min, max);
}

/** Anchor (tee/cup) pick volume. */
export const ANCHOR_BOUNDS = (x: number, y: number, z: number): THREE.Box3 =>
  new THREE.Box3(
    new THREE.Vector3(x - 0.5, y - 0.2, z - 0.5),
    new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
  );
