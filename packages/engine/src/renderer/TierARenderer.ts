/**
 * @module renderer/TierARenderer
 *
 * Tier A — "Fast Preview" renderer.
 *
 * Render order (back to front):
 *   1. PassthroughRenderer  — camera feed fills the canvas
 *   2. WarpMesh             — garment quad warped by control points
 *                             composited with alpha blending
 *
 * The renderer accepts:
 *   - A garment ImageBitmap (loaded from the selected candidate)
 *   - Live control points from TrackingPipeline + GarmentKeypoints
 *   - A mask texture from the segmentation pass (clothes class)
 *
 * WebGL state management:
 *   - Enable blending (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) for the warp pass
 *   - Disable depth test (2D compositor)
 */

import { WebGLContext } from './WebGLContext.js';
import { PassthroughRenderer } from './PassthroughRenderer.js';
import { WarpMesh } from './WarpMesh.js';
import { WARP_VERT, WARP_FRAG } from './shaders/warp.js';
import type { ControlPoint } from '../tracking/GarmentKeypoints.js';

export interface TierARendererOptions {
  /** Garment opacity [0, 1]. Default: 0.92 */
  opacity?: number;
  /** Edge softness [0, 0.15]. Default: 0.05 */
  edgeFade?: number;
}

export class TierARenderer {
  private _ctx: WebGLContext;
  private _passthrough: PassthroughRenderer;
  private _warpProgram: WebGLProgram;
  private _warpMesh: WarpMesh;

  // Uniforms
  private _uGarment: WebGLUniformLocation;
  private _uMask: WebGLUniformLocation;
  private _uOpacity: WebGLUniformLocation;
  private _uEdgeFade: WebGLUniformLocation;

  // Textures
  private _garmentTexture: WebGLTexture;
  private _maskTexture: WebGLTexture;
  private _whiteMask: WebGLTexture; // 1×1 white — no mask fallback

  private _options: Required<TierARendererOptions>;
  private _hasGarment = false;
  private _latestControlPoints: ControlPoint[] = [];

  constructor(ctx: WebGLContext, options: TierARendererOptions = {}) {
    this._ctx = ctx;
    this._options = {
      opacity: options.opacity ?? 0.92,
      edgeFade: options.edgeFade ?? 0.05,
    };

    const { gl } = ctx;

    // Setup passthrough for camera background
    this._passthrough = new PassthroughRenderer(ctx);

    // Compile warp shader program
    this._warpProgram = ctx.createProgram(WARP_VERT, WARP_FRAG);

    // Get uniform locations
    this._uGarment = gl.getUniformLocation(this._warpProgram, 'uGarment')!;
    this._uMask    = gl.getUniformLocation(this._warpProgram, 'uMask')!;
    this._uOpacity = gl.getUniformLocation(this._warpProgram, 'uOpacity')!;
    this._uEdgeFade = gl.getUniformLocation(this._warpProgram, 'uEdgeFade')!;

    // Create warp mesh
    this._warpMesh = new WarpMesh(gl, this._warpProgram);

    // Create garment texture
    this._garmentTexture = ctx.createTexture();

    // Create mask texture (default: 1×1 white = full visibility)
    this._whiteMask = this._create1x1Texture([255, 255, 255, 255]);
    this._maskTexture = this._whiteMask;

    // Enable blending globally — camera passthrough writes opaque pixels
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
  }

  // ---- Public API ----------------------------------------------------------

  get mirror(): boolean { return this._passthrough.mirror; }
  set mirror(value: boolean) { this._passthrough.mirror = value; }

  set opacity(value: number) { this._options.opacity = Math.max(0, Math.min(1, value)); }
  set edgeFade(value: number) { this._options.edgeFade = Math.max(0, Math.min(0.2, value)); }
  get controlPoints(): readonly ControlPoint[] { return this._latestControlPoints; }

  /**
   * Upload a new garment image to the GPU.
   * Call when the user selects a new garment candidate.
   */
  setGarment(source: TexImageSource): void {
    this._ctx.updateTexture(this._garmentTexture, source);
    this._hasGarment = true;

    // Initialize mesh to identity so garment appears immediately
    this._warpMesh.updateIdentity();
  }

  /** Clear the garment. */
  clearGarment(): void {
    this._hasGarment = false;
    this._latestControlPoints = [];
  }

  /**
   * Update control points from the tracking pipeline.
   * Called on every TrackingPipeline result.
   */
  setControlPoints(controlPoints: ControlPoint[]): void {
    this._latestControlPoints = controlPoints;
    if (controlPoints.length >= 2) {
      this._warpMesh.update(controlPoints);
    }
  }

  /**
   * Update segmentation mask texture.
   * The mask encodes which pixels are "clothes" (channel R = confidence).
   */
  setMaskTexture(source: TexImageSource | null): void {
    if (source) {
      this._ctx.updateTexture(this._maskTexture, source);
    } else {
      this._maskTexture = this._whiteMask;
    }
  }

  /**
   * Full render pass.
   * Call this once per render frame from the rVFC loop.
   */
  draw(videoSource: TexImageSource): void {
    const { gl } = this._ctx;
    if (this._ctx.isContextLost) return;

    // --- Pass 1: camera passthrough (opaque) ---
    gl.blendFunc(gl.ONE, gl.ZERO); // Disable blending for background
    this._passthrough.draw(videoSource);

    // --- Pass 2: garment warp overlay (alpha blend) ---
    if (!this._hasGarment) return;

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this._warpProgram);

    // Bind garment to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._garmentTexture);
    gl.uniform1i(this._uGarment, 0);

    // Bind mask to texture unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._maskTexture);
    gl.uniform1i(this._uMask, 1);

    // Uniforms
    gl.uniform1f(this._uOpacity, this._options.opacity);
    gl.uniform1f(this._uEdgeFade, this._options.edgeFade);

    // Draw the warped mesh
    this._warpMesh.draw();
  }

  dispose(): void {
    const { gl } = this._ctx;
    this._passthrough.dispose();
    this._warpMesh.dispose();
    gl.deleteProgram(this._warpProgram);
    gl.deleteTexture(this._garmentTexture);
    gl.deleteTexture(this._whiteMask);
  }

  // ---- Private helpers -----------------------------------------------------

  private _create1x1Texture(rgba: [number, number, number, number]): WebGLTexture {
    const { gl } = this._ctx;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return tex;
  }
}
