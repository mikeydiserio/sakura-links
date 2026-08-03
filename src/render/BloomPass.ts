import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Threshold bloom: bright-pass → three progressively smaller separable blurs →
 * additive composite.
 *
 * ### Why not `UnrealBloomPass`
 * Two reasons, one practical and one artistic.
 *
 * 1. **NaN safety.** Three's bloom has no guard on its input. A single non-finite
 *    pixel — from a degenerate transform, a `normalize()` of a zero vector, or an
 *    alpha comparison that a NaN silently passes — propagates through the blur
 *    chain and paints an entire mip-sized rectangle black. That is exactly the
 *    failure this project hit. The bright pass here sanitises every sample with
 *    an explicit `finite()` test (`x >= 0.0` is false for NaN), so a bad pixel
 *    can never spread.
 * 2. **Cost and look.** Unreal's five mip levels are tuned for photoreal HDR.
 *    Three levels with a hard-ish threshold gives the punchy, contained glow a
 *    cel-shaded palette wants, for roughly half the bandwidth.
 *
 * ### Structure
 * ```
 * scene ─► bright (½ res) ─┬─► blurH ─► blurV ─► level0 ──┐
 *                          ├─► (¼)  ─► … ─────► level1 ──┼─► composite ─► out
 *                          └─► (⅛)  ─► … ─────► level2 ──┘
 * ```
 */

const LEVELS = 3;

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const brightFragment = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;

  // NaN and Inf guard. A NaN fails every comparison, so the negated test below
  // catches it where a clamp() would pass it straight through.
  vec3 finite(vec3 c) {
    if (!(c.r >= 0.0)) c.r = 0.0;
    if (!(c.g >= 0.0)) c.g = 0.0;
    if (!(c.b >= 0.0)) c.b = 0.0;
    return min(c, vec3(48.0));
  }

  void main() {
    vec3 color = finite(texture2D(tDiffuse, vUv).rgb);

    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

    // Soft knee: a hard cutoff makes bloom pop in and out as a surface rotates
    // through the threshold. The quadratic shoulder fades it in over uKnee.
    float soft = luma - uThreshold + uKnee;
    soft = clamp(soft, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 0.0001);
    float contribution = max(soft, luma - uThreshold) / max(luma, 0.0001);

    gl_FragColor = vec4(color * contribution, 1.0);
  }
`;

/**
 * Nine-tap Gaussian, separable. Weights are the normalised binomial row, which
 * is what a true Gaussian converges to and costs nothing to hard-code.
 */
const blurFragment = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  uniform float uRadius;
  varying vec2 vUv;

  void main() {
    vec2 step = uDirection * uRadius;

    vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
    sum += texture2D(tDiffuse, vUv + step * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tDiffuse, vUv - step * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tDiffuse, vUv + step * 3.2307692308).rgb * 0.0702702703;
    sum += texture2D(tDiffuse, vUv - step * 3.2307692308).rgb * 0.0702702703;

    gl_FragColor = vec4(sum, 1.0);
  }
`;

const compositeFragment = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tLevel0;
  uniform sampler2D tLevel1;
  uniform sampler2D tLevel2;
  uniform float uStrength;
  uniform vec3 uTint;
  varying vec2 vUv;

  void main() {
    vec4 base = texture2D(tDiffuse, vUv);

    // Wider levels contribute less, which is what produces a natural falloff
    // from a tight core to a broad halo.
    vec3 bloom = texture2D(tLevel0, vUv).rgb * 1.0
               + texture2D(tLevel1, vUv).rgb * 0.62
               + texture2D(tLevel2, vUv).rgb * 0.38;

    gl_FragColor = vec4(base.rgb + bloom * uStrength * uTint, base.a);
  }
`;

export interface BloomOptions {
  strength?: number;
  threshold?: number;
  knee?: number;
  radius?: number;
  tint?: THREE.ColorRepresentation;
}

export class BloomPass extends Pass {
  strength: number;

  private readonly bright: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  /** Ping-pong targets, one pair per level, each half the size of the last. */
  private readonly targetsA: THREE.WebGLRenderTarget[] = [];
  private readonly targetsB: THREE.WebGLRenderTarget[] = [];

  private width = 1;
  private height = 1;

  constructor(width: number, height: number, options: BloomOptions = {}) {
    super();

    const {
      strength = 0.6,
      threshold = 0.82,
      knee = 0.28,
      radius = 1,
      tint = 0xffffff,
    } = options;

    this.strength = strength;

    this.bright = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: brightFragment,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: threshold },
        uKnee: { value: knee },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.blur = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: blurFragment,
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uRadius: { value: 0.002 * radius },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.composite = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: compositeFragment,
      uniforms: {
        tDiffuse: { value: null },
        tLevel0: { value: null },
        tLevel1: { value: null },
        tLevel2: { value: null },
        uStrength: { value: strength },
        uTint: { value: new THREE.Color(tint) },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new FullScreenQuad(this.bright);

    for (let i = 0; i < LEVELS; i++) {
      const options2: THREE.RenderTargetOptions = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        type: THREE.HalfFloatType,
      };
      this.targetsA.push(new THREE.WebGLRenderTarget(1, 1, options2));
      this.targetsB.push(new THREE.WebGLRenderTarget(1, 1, options2));
    }

    this.setSize(width, height);
  }

  setThreshold(value: number): void {
    this.bright.uniforms.uThreshold.value = value;
  }

  setTint(color: THREE.ColorRepresentation): void {
    (this.composite.uniforms.uTint.value as THREE.Color).set(color);
  }

  override setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    for (let i = 0; i < LEVELS; i++) {
      const divisor = 2 << i; // 2, 4, 8
      const w = Math.max(1, Math.floor(this.width / divisor));
      const h = Math.max(1, Math.floor(this.height / divisor));
      this.targetsA[i].setSize(w, h);
      this.targetsB[i].setSize(w, h);
    }
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    // --- Bright pass into the largest level --------------------------------
    this.bright.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.bright;
    renderer.setRenderTarget(this.targetsA[0]);
    renderer.clear();
    this.quad.render(renderer);

    // --- Blur each level, downsampling as we go ----------------------------
    this.quad.material = this.blur;
    for (let i = 0; i < LEVELS; i++) {
      // Levels beyond the first start from the previous level's result, which
      // is both cheaper and smoother than re-thresholding the source.
      if (i > 0) {
        this.blur.uniforms.tDiffuse.value = this.targetsA[i - 1].texture;
        this.blur.uniforms.uDirection.value.set(0, 0); // pure downsample copy
        renderer.setRenderTarget(this.targetsA[i]);
        renderer.clear();
        this.quad.render(renderer);
      }

      const width = this.targetsA[i].width;
      const height = this.targetsA[i].height;

      // Horizontal.
      this.blur.uniforms.tDiffuse.value = this.targetsA[i].texture;
      this.blur.uniforms.uDirection.value.set(1 / width, 0);
      this.blur.uniforms.uRadius.value = 1;
      renderer.setRenderTarget(this.targetsB[i]);
      renderer.clear();
      this.quad.render(renderer);

      // Vertical.
      this.blur.uniforms.tDiffuse.value = this.targetsB[i].texture;
      this.blur.uniforms.uDirection.value.set(0, 1 / height);
      renderer.setRenderTarget(this.targetsA[i]);
      renderer.clear();
      this.quad.render(renderer);
    }

    // --- Composite ---------------------------------------------------------
    this.composite.uniforms.tDiffuse.value = readBuffer.texture;
    this.composite.uniforms.tLevel0.value = this.targetsA[0].texture;
    this.composite.uniforms.tLevel1.value = this.targetsA[1].texture;
    this.composite.uniforms.tLevel2.value = this.targetsA[2].texture;
    this.composite.uniforms.uStrength.value = this.strength;

    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);

    renderer.autoClear = previousAutoClear;
  }

  override dispose(): void {
    for (const target of [...this.targetsA, ...this.targetsB]) target.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}
