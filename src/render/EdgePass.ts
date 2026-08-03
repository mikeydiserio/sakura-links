import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Screen-space ink outlines via a Sobel filter over depth + view-space normals.
 *
 * ### How the buffers are produced
 * One extra scene render into an RT whose colour target holds view normals
 * (`MeshNormalMaterial` as an override) and whose `DepthTexture` holds depth.
 * That single prepass costs one geometry pass — no MRT extension needed, which
 * keeps the pipeline portable.
 *
 * ### Why two edge terms
 * - **Depth Sobel** catches silhouettes and anywhere geometry overlaps itself.
 *   Depth is linearised first, otherwise the non-linear distribution makes
 *   distant edges vanish and near ones fatten.
 * - **Normal Sobel** catches creases *within* a smooth depth field — the join
 *   between a ramp and the green, panel seams, the fold of a roof. These are
 *   exactly the lines an inverted hull cannot produce.
 *
 * The depth term is scaled by view distance so a fixed threshold works from the
 * putting camera all the way out to a cinematic wide shot.
 */

const edgeFragment = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;

  uniform vec2 uTexel;
  uniform vec3 uInk;
  uniform float uNormalStrength;
  uniform float uDepthStrength;
  uniform float uNormalBias;
  uniform float uDepthBias;
  uniform float uNear;
  uniform float uFar;
  uniform float uOpacity;

  uniform float uAoStrength;
  uniform float uAoRadius;
  uniform float uProjScale;
  uniform vec3 uAoTint;

  varying vec2 vUv;

  // Converts the non-linear depth buffer value into view-space distance.
  float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x;
    float ndc = z * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
  }

  /**
   * Contact shading from the same depth prepass the ink lines use.
   *
   * Not a physically-motivated ambient occlusion term — it is a cheap
   * "is anything in front of me nearby" test. For each of eight taps on a disc
   * around the pixel, a neighbour that is closer to the camera counts as an
   * occluder, weighted so that distant geometry contributes nothing.
   *
   * Its whole job is to put a dark seam where the green meets a rail, under
   * every prop and tree, and around the ball. Without it a cel-shaded scene has
   * no value change at contact points at all, and everything reads as stickers
   * floating a few centimetres above the ground.
   *
   * The sample radius is divided by depth so the darkened band is a constant
   * *world* size rather than a constant number of pixels — otherwise the effect
   * grows into a smear as the camera pulls back.
   */
  float contactShading(float centre, vec3 normal) {
    if (uAoStrength <= 0.0) return 1.0;

    // Eight points on a disc, pre-rotated so the pattern has no axis bias.
    vec2 taps[8];
    taps[0] = vec2( 1.0,  0.0); taps[1] = vec2( 0.707,  0.707);
    taps[2] = vec2( 0.0,  1.0); taps[3] = vec2(-0.707,  0.707);
    taps[4] = vec2(-1.0,  0.0); taps[5] = vec2(-0.707, -0.707);
    taps[6] = vec2( 0.0, -1.0); taps[7] = vec2( 0.707, -0.707);

    float radiusPx = uAoRadius * uProjScale / max(centre, 0.5);
    // Deliberately not named "step" — that shadows the GLSL builtin used a few
    // lines down, and the shader fails to compile.
    vec2 spacing = uTexel * radiusPx;

    float occlusion = 0.0;
    for (int i = 0; i < 8; i++) {
      // Two rings: a tight one for the hard contact seam, a wider one for the
      // soft falloff away from it.
      for (int ring = 1; ring <= 2; ring++) {
        float scale = float(ring) * 0.5;
        vec2 offset = taps[i] * spacing * scale;
        float neighbour = linearDepth(vUv + offset);
        float delta = centre - neighbour;

        // Reconstruct the neighbour's offset in view space. Depth alone cannot
        // distinguish a neighbour that is closer because it is *occluding* this
        // pixel from one that is closer merely because the surface curves
        // toward the camera — which is why a depth-only test paints a dark
        // disc over every dome. Comparing the direction against the surface
        // normal separates the two: only a neighbour sitting above this pixel's
        // own hemisphere can occlude it.
        vec3 dir = vec3(
          (offset.x / uTexel.x) * centre / uProjScale,
          (offset.y / uTexel.y) * centre / uProjScale,
          delta
        );
        float len = length(dir);
        if (len < 1e-5) continue;

        // The bias has to clear the worst-case error in the reconstruction, not
        // just floating-point noise. On a fairway seen at a grazing angle the
        // normal already leans well toward the camera, so a small bias lets
        // ordinary depth slope register as occlusion and paints soft grey
        // smudges across flat ground. A real contact points almost straight
        // along the normal (dot 0.7-1.0) and clears 0.3 comfortably.
        float facing = max(dot(dir / len, normal) - 0.3, 0.0);

        // Only within a hand's breadth — beyond that it is a separate object,
        // not a contact.
        float inRange = 1.0 - smoothstep(0.0, uAoRadius * 1.6, abs(delta));
        occlusion += facing * inRange / float(ring);
      }
    }

    occlusion /= 8.0;
    return 1.0 - clamp(occlusion, 0.0, 1.0) * uAoStrength;
  }

  void main() {
    vec4 base = texture2D(tDiffuse, vUv);

    // 3x3 Sobel taps.
    vec2 o = uTexel;
    vec2 uv[9];
    uv[0] = vUv + vec2(-o.x, -o.y); uv[1] = vUv + vec2(0.0, -o.y); uv[2] = vUv + vec2(o.x, -o.y);
    uv[3] = vUv + vec2(-o.x,  0.0); uv[4] = vUv;                   uv[5] = vUv + vec2(o.x,  0.0);
    uv[6] = vUv + vec2(-o.x,  o.y); uv[7] = vUv + vec2(0.0,  o.y); uv[8] = vUv + vec2(o.x,  o.y);

    // --- Depth edges -------------------------------------------------------
    float d[9];
    for (int i = 0; i < 9; i++) d[i] = linearDepth(uv[i]);

    float gxD = d[0] + 2.0 * d[3] + d[6] - d[2] - 2.0 * d[5] - d[8];
    float gyD = d[0] + 2.0 * d[1] + d[2] - d[6] - 2.0 * d[7] - d[8];
    float depthEdge = length(vec2(gxD, gyD));

    // Normalise by the *nearest* tap rather than the centre one. Using the centre
    // would divide a silhouette against the sky by the far-plane distance and
    // erase it; the nearest tap is always the surface that owns the edge.
    float dmin = min(min(min(d[0], d[1]), min(d[2], d[3])),
                     min(min(d[4], d[5]), min(min(d[6], d[7]), d[8])));
    depthEdge /= max(dmin, 0.001);
    depthEdge = smoothstep(uDepthBias, uDepthBias * 2.4, depthEdge) * uDepthStrength;

    // --- Normal edges ------------------------------------------------------
    vec3 n[9];
    for (int i = 0; i < 9; i++) n[i] = texture2D(tNormal, uv[i]).xyz * 2.0 - 1.0;

    vec3 gxN = n[0] + 2.0 * n[3] + n[6] - n[2] - 2.0 * n[5] - n[8];
    vec3 gyN = n[0] + 2.0 * n[1] + n[2] - n[6] - 2.0 * n[7] - n[8];
    float normalEdge = sqrt(dot(gxN, gxN) + dot(gyN, gyN));
    normalEdge = smoothstep(uNormalBias, uNormalBias * 2.0, normalEdge) * uNormalStrength;

    // Fade interior crease lines with distance so the far field stays clean and
    // does not alias into a shimmering mess as the camera moves.
    normalEdge *= 1.0 - smoothstep(35.0, 90.0, dmin);

    float edge = clamp(max(depthEdge, normalEdge), 0.0, 1.0) * uOpacity;

    // Contact shading goes on before the ink, so a line drawn over a shaded
    // seam stays full-strength ink rather than being darkened twice.
    vec3 shaded = base.rgb * mix(uAoTint, vec3(1.0), contactShading(d[4], normalize(n[4])));

    gl_FragColor = vec4(mix(shaded, uInk, edge), base.a);
  }
`;

const edgeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export interface EdgePassOptions {
  ink?: THREE.ColorRepresentation;
  normalStrength?: number;
  depthStrength?: number;
  opacity?: number;
  /** 0 disables contact shading entirely (low quality preset). */
  aoStrength?: number;
  /** Contact-shading reach, in world units. */
  aoRadius?: number;
  /** Colour a fully-occluded pixel is tinted toward. */
  aoTint?: THREE.ColorRepresentation;
}

export class EdgePass extends Pass {
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  /** Renders only layer 0 — sky, particles and UI-space props sit on layer 1. */
  private readonly prepassCamera = new THREE.PerspectiveCamera();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    options: EdgePassOptions = {},
  ) {
    super();

    const depthTexture = new THREE.DepthTexture(width, height);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.type = THREE.UnsignedIntType;

    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.material = new THREE.ShaderMaterial({
      vertexShader: edgeVertex,
      fragmentShader: edgeFragment,
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: this.target.texture },
        tDepth: { value: depthTexture },
        uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
        uInk: { value: new THREE.Color(options.ink ?? 0x201a26) },
        uNormalStrength: { value: options.normalStrength ?? 0.85 },
        uDepthStrength: { value: options.depthStrength ?? 1 },
        uNormalBias: { value: 0.85 },
        uDepthBias: { value: 0.035 },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uOpacity: { value: options.opacity ?? 1 },
        uAoStrength: { value: options.aoStrength ?? 0.85 },
        uAoRadius: { value: options.aoRadius ?? 0.55 },
        uAoTint: { value: new THREE.Color(options.aoTint ?? 0x2a2438) },
        uProjScale: { value: height * 0.5 },
      },
    });

    this.quad = new FullScreenQuad(this.material);
    this.prepassCamera.layers.set(0);
  }

  setInk(color: THREE.ColorRepresentation): void {
    (this.material.uniforms.uInk.value as THREE.Color).set(color);
  }

  setOpacity(value: number): void {
    this.material.uniforms.uOpacity.value = value;
  }

  setContactShading(strength: number, tint?: THREE.ColorRepresentation): void {
    this.material.uniforms.uAoStrength.value = strength;
    if (tint !== undefined) (this.material.uniforms.uAoTint.value as THREE.Color).set(tint);
  }

  override setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    (this.material.uniforms.uTexel.value as THREE.Vector2).set(1 / width, 1 / height);
    // Pixels-per-world-unit at one unit of depth. Keeps the contact-shading
    // radius a fixed world size at any resolution or field of view.
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    this.material.uniforms.uProjScale.value = height * 0.5 / Math.tan(fov / 2);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    // --- Prepass: view normals + depth ---
    this.prepassCamera.copy(this.camera);
    this.prepassCamera.layers.set(0);

    const previousOverride = this.scene.overrideMaterial;
    const previousBackground = this.scene.background;
    this.scene.overrideMaterial = this.normalMaterial;
    this.scene.background = null;

    renderer.setRenderTarget(this.target);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.prepassCamera);

    this.scene.overrideMaterial = previousOverride;
    this.scene.background = previousBackground;

    // --- Composite ---
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.uNear.value = this.camera.near;
    this.material.uniforms.uFar.value = this.camera.far;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.target.dispose();
    this.target.depthTexture?.dispose();
    this.material.dispose();
    this.normalMaterial.dispose();
    this.quad.dispose();
  }
}
