import * as THREE from 'three';

/**
 * Inverted-hull ink outlines.
 *
 * The mesh is drawn a second time with `side: BackSide`, its vertices pushed
 * along their normals. Because front faces overwrite the expanded back faces,
 * only a shell of the expanded copy survives — the outline.
 *
 * ### Constant screen-space thickness
 * A naive `position + normal * k` outline shrinks with distance. Offsetting in
 * *view* space by `k * -mv.z` instead cancels the perspective divide exactly, so
 * a 3 px line stays 3 px at any depth. `uThickness` carries the
 * pixels → view-units conversion factor derived from the camera FOV and the
 * drawing buffer height:
 *
 *     thickness = pixels * 2 * tan(fov / 2) / viewportHeight
 *
 * ### Why this coexists with the Sobel pass
 * Hull outlines give clean, weighty *silhouettes* that survive at any resolution
 * and never flicker. The screen-space Sobel pass (see `EdgePass.ts`) catches
 * *interior* creases — where two faces of the same object meet — which a hull
 * can never produce. Running both is what makes the linework read as ink.
 */

const outlineVertex = /* glsl */ `
  uniform float uThickness;
  uniform float uMinDepth;

  void main() {
    mat4 modelM = modelMatrix;
    #ifdef USE_INSTANCING
      modelM = modelMatrix * instanceMatrix;
    #endif

    mat4 modelViewM = viewMatrix * modelM;
    vec4 mvPosition = modelViewM * vec4(position, 1.0);

    // View-space normal. mat3 of the model-view matrix is adequate here: any
    // shear from non-uniform scale only nudges line weight, never correctness.
    vec3 viewNormal = normalize(mat3(modelViewM) * normal);

    // -mvPosition.z is view depth. Clamping it keeps outlines from collapsing
    // to nothing on geometry that is nearly touching the near plane.
    float depth = max(-mvPosition.z, uMinDepth);
    mvPosition.xyz += viewNormal * depth * uThickness;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const outlineFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

export interface OutlineOptions {
  color?: THREE.ColorRepresentation;
  /** Line weight in CSS pixels. */
  pixels?: number;
  opacity?: number;
}

export class OutlineMaterial extends THREE.ShaderMaterial {
  /** Requested weight in pixels; converted to view units on every resize. */
  pixels: number;

  constructor({ color = 0x201a26, pixels = 3, opacity = 1 }: OutlineOptions = {}) {
    super({
      vertexShader: outlineVertex,
      fragmentShader: outlineFragment,
      side: THREE.BackSide,
      transparent: opacity < 1,
      depthWrite: true,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uThickness: { value: 0.004 },
        uMinDepth: { value: 1.5 },
        uOpacity: { value: opacity },
      },
    });
    this.pixels = pixels;
  }

  /** Recomputes the pixels → view-space factor. Call on resize and FOV change. */
  updateProjection(fovDegrees: number, viewportHeight: number): void {
    const fov = THREE.MathUtils.degToRad(fovDegrees);
    this.uniforms.uThickness.value =
      (this.pixels * 2 * Math.tan(fov / 2)) / Math.max(1, viewportHeight);
  }
}

/**
 * Registry of live outline materials so a resize updates all of them at once
 * without walking the scene graph.
 */
class OutlineRegistry {
  private materials = new Set<OutlineMaterial>();
  private fov = 55;
  private height = 1080;

  register(material: OutlineMaterial): OutlineMaterial {
    material.updateProjection(this.fov, this.height);
    this.materials.add(material);
    return material;
  }

  unregister(material: OutlineMaterial): void {
    this.materials.delete(material);
  }

  setProjection(fovDegrees: number, viewportHeight: number): void {
    this.fov = fovDegrees;
    this.height = viewportHeight;
    for (const material of this.materials) material.updateProjection(fovDegrees, viewportHeight);
  }
}

export const outlineRegistry = new OutlineRegistry();

/**
 * Attaches an ink outline to a mesh by adding an inverted-hull child that shares
 * the parent's geometry (no extra vertex memory, no extra draw-call setup cost
 * beyond the draw itself).
 *
 * Instanced meshes are supported — the child re-uses the same `instanceMatrix`
 * attribute, so a field of 400 flowers still costs exactly one outline draw.
 */
export function addOutline(
  mesh: THREE.Mesh | THREE.InstancedMesh,
  options: OutlineOptions = {},
): THREE.Mesh {
  const material = outlineRegistry.register(new OutlineMaterial(options));

  let shell: THREE.Mesh;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const source = mesh as THREE.InstancedMesh;
    const instanced = new THREE.InstancedMesh(source.geometry, material, source.count);
    instanced.instanceMatrix = source.instanceMatrix;
    instanced.count = source.count;
    instanced.frustumCulled = false;
    shell = instanced;
  } else {
    shell = new THREE.Mesh(mesh.geometry, material);
  }

  shell.name = `${mesh.name || 'mesh'}:outline`;
  // The shell shares the parent's geometry — teardown must not free it twice.
  shell.userData.outline = true;
  shell.renderOrder = (mesh.renderOrder ?? 0) - 1;
  shell.castShadow = false;
  shell.receiveShadow = false;
  mesh.add(shell);
  return shell;
}
