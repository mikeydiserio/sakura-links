import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BloomPass } from './BloomPass';
import { EdgePass } from './EdgePass';
import { GradePass } from './GradePass';
import { SharedCelUniforms } from './CelMaterial';
import { outlineRegistry } from './OutlineMaterial';
import type { Theme } from './Palette';
import type { SettingsData } from '../core/Storage';
import { clamp } from '../util/math';

/**
 * Owns the WebGL context and the full post-processing chain.
 *
 * ### Pipeline
 * ```
 * RenderPass ──► EdgePass (Sobel ink) ──► UnrealBloomPass ──► GradePass ──► OutputPass
 * ```
 * - Ink is applied *before* bloom so neon linework blooms along with the geometry
 *   it outlines, which is what makes the arcade course glow correctly.
 * - `OutputPass` performs the linear → sRGB encode. Every shader in the project
 *   therefore writes linear colour and never calls an encoding include.
 *
 * ### Adaptive resolution
 * The renderer measures a rolling average frame time and walks the pixel ratio
 * down (never below 1.0) when it drifts past the 60 FPS budget, then back up
 * when there is headroom. Resolution is the cheapest quality dial available and
 * the first thing to give on an integrated GPU.
 */

/** Objects on this layer are excluded from the normal/depth prepass. */
export const LAYER_DEFAULT = 0;
export const LAYER_NO_EDGE = 1;

export class Renderer {
  readonly webgl: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly grade: GradePass;

  private readonly renderPass: RenderPass;
  private readonly edgePass: EdgePass;
  private readonly bloomPass: BloomPass;
  private readonly outputPass: OutputPass;

  private readonly maxPixelRatio: number;
  private currentPixelRatio: number;
  private frameTimes: number[] = [];
  private adaptTimer = 0;
  private qualityScale = 1;

  private bloomBase = 0.6;

  constructor(
    canvas: HTMLCanvasElement,
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    settings: SettingsData,
  ) {
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // The composer resolves aliasing; MSAA on the default
      // framebuffer would be discarded by the first pass anyway.
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });

    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.currentPixelRatio = this.maxPixelRatio;
    this.webgl.setPixelRatio(this.currentPixelRatio);
    this.webgl.setSize(window.innerWidth, window.innerHeight, false);

    // Tone mapping stays off — see GradePass for the custom shoulder.
    this.webgl.toneMapping = THREE.NoToneMapping;
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.setClearColor(0x000000, 1);
    this.webgl.autoClear = true;

    const { width, height } = this.bufferSize();

    this.composer = new EffectComposer(this.webgl);
    this.composer.setPixelRatio(this.currentPixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.renderPass = new RenderPass(scene, camera);
    this.edgePass = new EdgePass(scene, camera, width, height);
    this.bloomPass = new BloomPass(width, height, {
      strength: this.bloomBase,
      threshold: 0.82, // only genuinely bright pixels bloom
      knee: 0.3,
    });
    this.grade = new GradePass();
    this.outputPass = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.edgePass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.outputPass);

    this.applySettings(settings);
    outlineRegistry.setProjection(camera.fov, height);
  }

  private bufferSize(): { width: number; height: number } {
    return {
      width: Math.floor(window.innerWidth * this.currentPixelRatio),
      height: Math.floor(window.innerHeight * this.currentPixelRatio),
    };
  }

  applySettings(settings: SettingsData): void {
    this.qualityScale = settings.quality === 'low' ? 0.7 : settings.quality === 'medium' ? 0.85 : 1;
    this.bloomPass.enabled = settings.bloom;
    this.bloomPass.strength = this.bloomBase * (settings.quality === 'low' ? 0.7 : 1);
    this.edgePass.enabled = settings.outlines;
    // Low quality drops the interior crease term but keeps silhouettes.
    this.edgePass.setOpacity(settings.quality === 'low' ? 0.7 : 1);
    // Contact shading is the most expensive part of the ink pass (16 extra
    // depth taps), so it is the first thing to go on the low preset.
    this.edgePass.setContactShading(
      settings.quality === 'low' ? 0 : settings.quality === 'medium' ? 0.45 : 0.65,
    );
    this.setPixelRatio(this.maxPixelRatio * this.qualityScale);
  }

  applyTheme(theme: Theme): void {
    this.edgePass.setInk(theme.ink);
    // Occluded areas fall toward the theme's own shadow colour rather than a
    // neutral grey, so contact seams stay inside the palette.
    this.edgePass.setContactShading(
      this.qualityScale >= 1 ? 0.65 : 0.45,
      theme.id === 'neon' ? 0x120a26 : theme.ambientBottom,
    );
    this.bloomBase = theme.bloom;
    this.bloomPass.strength = theme.bloom;
    this.grade.configure(
      theme.id === 'neon' ? 1.24 : 1.14,
      theme.id === 'neon' ? 1.1 : 1.05,
      theme.id === 'neon' ? 0.6 : 0.4,
    );
  }

  /** Per-frame shared uniform sync. One write, every material sees it. */
  syncUniforms(elapsed: number): void {
    SharedCelUniforms.uTime.value = elapsed;
    this.camera.getWorldPosition(SharedCelUniforms.uCamPos.value);
  }

  setPixelRatio(ratio: number): void {
    const clamped = clamp(ratio, 0.65, this.maxPixelRatio);
    if (Math.abs(clamped - this.currentPixelRatio) < 0.01) return;
    this.currentPixelRatio = clamped;
    this.webgl.setPixelRatio(clamped);
    this.composer.setPixelRatio(clamped);
    this.resize(false);
  }

  resize(updateCamera = true): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (updateCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    this.webgl.setSize(width, height, false);
    this.composer.setSize(width, height);

    const buffer = this.bufferSize();
    this.edgePass.setSize(buffer.width, buffer.height);
    this.bloomPass.setSize(buffer.width, buffer.height);
    outlineRegistry.setProjection(this.camera.fov, buffer.height);
  }

  /**
   * Rolling frame-time average → pixel ratio. Sampled over ~1s windows so a
   * single hitch (hole load, GC) never triggers a visible resolution change.
   */
  private adapt(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();

    this.adaptTimer += dt;
    if (this.adaptTimer < 1 || this.frameTimes.length < 60) return;
    this.adaptTimer = 0;

    const average = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const target = this.maxPixelRatio * this.qualityScale;

    if (average > 0.0208 && this.currentPixelRatio > 0.7) {
      // Below ~48 FPS: shed 15% of the pixels.
      this.setPixelRatio(this.currentPixelRatio * 0.85);
    } else if (average < 0.0142 && this.currentPixelRatio < target) {
      // Above ~70 FPS: claw resolution back gradually.
      this.setPixelRatio(Math.min(target, this.currentPixelRatio * 1.08));
    }
  }

  render(dt: number, elapsed: number): void {
    this.syncUniforms(elapsed);
    // Manual reset: three clears render stats on every `render()` call, and the
    // composer makes several. Left on auto, the debug readout would only ever
    // show the final full-screen quad — one draw, two triangles.
    this.webgl.info.autoReset = false;
    this.webgl.info.reset();
    this.composer.render(dt);
    this.adapt(dt);
  }

  get pixelRatio(): number {
    return this.currentPixelRatio;
  }

  get drawCalls(): number {
    return this.webgl.info.render.calls;
  }

  get triangles(): number {
    return this.webgl.info.render.triangles;
  }

  dispose(): void {
    this.edgePass.dispose();
    this.bloomPass.dispose();
    this.grade.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.webgl.dispose();
  }
}
