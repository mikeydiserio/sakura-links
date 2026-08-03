import * as THREE from 'three';

/**
 * Recursively frees GPU resources for a subtree and detaches it from its parent.
 *
 * Holes are torn down and rebuilt every time the player advances, so leaking a
 * single geometry per hole would compound across a round. Geometries and
 * materials owned by the shared caches (see `render/GeometryCache.ts`) opt out
 * via the `userData.shared` flag so they survive teardown.
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh & { isMesh?: boolean };
    if (!mesh.isMesh && !(obj as THREE.Points).isPoints && !(obj as THREE.Line).isLine) return;

    // Outline shells borrow their parent's geometry; freeing it here would
    // double-dispose the buffer the parent still owns.
    const geometry = (mesh as unknown as { geometry?: THREE.BufferGeometry }).geometry;
    if (geometry && !geometry.userData.shared && !obj.userData.outline) geometry.dispose();

    const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (!material) return;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else disposeMaterial(material);
  });

  root.parent?.remove(root);
}

export function disposeMaterial(material: THREE.Material): void {
  if (material.userData.shared) return;

  // Free any texture uniforms this material owns (procedural textures are per-material).
  const shader = material as THREE.ShaderMaterial;
  if (shader.uniforms) {
    for (const key of Object.keys(shader.uniforms)) {
      const value = shader.uniforms[key]?.value as THREE.Texture | undefined;
      if (value && (value as THREE.Texture).isTexture && !value.userData.shared) value.dispose();
    }
  }

  const record = material as unknown as Record<string, unknown>;
  for (const key of ['map', 'alphaMap', 'emissiveMap', 'normalMap']) {
    const tex = record[key] as THREE.Texture | undefined;
    if (tex && tex.isTexture && !tex.userData.shared) tex.dispose();
  }

  material.dispose();
}

/** Marks a resource as cache-owned so `disposeObject` leaves it alone. */
export function markShared<T extends { userData: Record<string, unknown> }>(resource: T): T {
  resource.userData.shared = true;
  return resource;
}
