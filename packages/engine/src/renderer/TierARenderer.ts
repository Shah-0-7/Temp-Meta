/**
 * @module renderer/TierARenderer
 *
 * Tier A: live, local, no network.
 *
 * Render order (back to front):
 *   1. Passthrough: camera frame fills the canvas
 *   2. Garment:     MLS-warped mesh, premultiplied, with lighting transfer
 *   3. Occlusion:   face / hair / hands drawn back on top of the garment
 *
 * Temporal behaviour (what makes it feel smooth):
 *   - Tracking runs at 15-30 Hz, rendering at display rate. Control points are
 *     eased toward the latest targets every frame (critically-damped-style
 *     exponential smoothing), so the garment glides instead of stepping.
 *   - When the pose is lost the garment holds for a short grace period, then
 *     fades out; it fades back in when the pose returns (no popping).
 *
 * The same class renders high-resolution stills for the local "Realistic" mode
 * (see LocalTryOnGenerator): `snapTo()` skips the easing, `gridSize` can be raised.
 */

import { WebGLContext } from './WebGLContext.js';
import { PassthroughRenderer } from './PassthroughRenderer.js';
import { WarpMesh } from './WarpMesh.js';
import { OcclusionPass } from './OcclusionPass.js';
import { WARP_VERT, WARP_FRAG, WARP_GRID_SIZE } from './shaders/warp.js';
import type { ControlPoint } from '../tracking/GarmentKeypoints.js';
import type { OcclusionMask } from '../tracking/types.js';

export interface TierARendererOptions {
  /** Garment opacity [0, 1]. Default 0.97 */
  opacity?: number;
  /** Fade at the garment image border [0, 0.2]. Default 0.02 */
  edgeFade?: number;
  /** Lighting-transfer strength [0, 1]. Default 0.5. 0 disables it (and the mip-chain cost). */
  shading?: number;
  /** Mesh subdivisions. Default 16 (live) - use 32+ for stills. */
  gridSize?: number;
  /** Time constant of the follow-smoothing in ms. 0 = no smoothing. Default 45 */
  smoothingMs?: number;
  /** How long to keep drawing after the last pose before fading out. Default 350 */
  lostGraceMs?: number;
  /** Fade in/out duration in ms. Default 220 */
  fadeMs?: number;
  /** MLS falloff exponent. Default 1.2 */
  warpAlpha?: number;
}

interface SmoothedPoint {
  u: number;
  v: number;
  w: number;
  /** Last known garment-space position (kept so a fading point still has one). */
  su: number;
  sv: number;
}

export class TierARenderer {
  private readonly _ctx: WebGLContext;
  private readonly _passthrough: PassthroughRenderer;
  private readonly _occlusion: OcclusionPass;
  private readonly _warpProgram: WebGLProgram;
  private readonly _warpMesh: WarpMesh;

  private readonly _uGarment: WebGLUniformLocation | null;
  private readonly _uVideo: WebGLUniformLocation | null;
  private readonly _uResolution: WebGLUniformLocation | null;
  private readonly _uMirror: WebGLUniformLocation | null;
  private readonly _uOpacity: WebGLUniformLocation | null;
  private readonly _uEdgeFade: WebGLUniformLocation | null;
  private readonly _uShading: WebGLUniformLocation | null;
  private readonly _uLodFine: WebGLUniformLocation | null;
  private readonly _uLodCoarse: WebGLUniformLocation | null;

  private readonly _garmentTexture: WebGLTexture;
  private readonly _options: Required<TierARendererOptions>;

  private _hasGarment = false;
  private _garmentAspect = 0.8;

  // Control-point state
  private _targets = new Map<string, ControlPoint>();
  private _current = new Map<string, SmoothedPoint>();
  private _lastTargetTime = -Infinity;
  private _lastDrawTime = 0;
  private _visibility = 0;
  private _meshDirty = false;
  private _smoothed: ControlPoint[] = [];

  constructor(ctx: WebGLContext, options: TierARendererOptions = {}) {
    this._ctx = ctx;
    this._options = {
      opacity: options.opacity ?? 0.97,
      edgeFade: options.edgeFade ?? 0.02,
      shading: options.shading ?? 0.5,
      gridSize: options.gridSize ?? WARP_GRID_SIZE,
      smoothingMs: options.smoothingMs ?? 45,
      lostGraceMs: options.lostGraceMs ?? 350,
      fadeMs: options.fadeMs ?? 220,
      warpAlpha: options.warpAlpha ?? 1.2,
    };

    const { gl } = ctx;
    this._passthrough = new PassthroughRenderer(ctx);
    this._occlusion = new OcclusionPass(ctx);

    this._warpProgram = ctx.createProgram(WARP_VERT, WARP_FRAG);
    const u = (name: string) => gl.getUniformLocation(this._warpProgram, name);
    this._uGarment = u('uGarment');
    this._uVideo = u('uVideo');
    this._uResolution = u('uResolution');
    this._uMirror = u('uMirror');
    this._uOpacity = u('uOpacity');
    this._uEdgeFade = u('uEdgeFade');
    this._uShading = u('uShading');
    this._uLodFine = u('uLodFine');
    this._uLodCoarse = u('uLodCoarse');

    this._warpMesh = new WarpMesh(gl, this._warpProgram, this._options.gridSize);
    this._garmentTexture = ctx.createTexture();

    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }

  // ---- Settings ----------------------------------------------------------------

  get mirror(): boolean { return this._passthrough.mirror; }
  set mirror(value: boolean) { this._passthrough.mirror = value; }

  set opacity(value: number) { this._options.opacity = clamp(value, 0, 1); }
  set edgeFade(value: number) { this._options.edgeFade = clamp(value, 0, 0.2); }
  set shading(value: number) { this._options.shading = clamp(value, 0, 1); }
  set smoothingMs(value: number) { this._options.smoothingMs = Math.max(0, value); }
  get shading(): number { return this._options.shading; }

  /** Smoothed control points currently driving the mesh (for the debug overlay). */
  get controlPoints(): readonly ControlPoint[] { return this._smoothed; }
  get hasGarment(): boolean { return this._hasGarment; }
  /** 0..1: how visible the garment currently is (fades with tracking). */
  get visibility(): number { return this._visibility; }
  get garmentAspect(): number { return this._garmentAspect; }

  // ---- Garment -----------------------------------------------------------------

  /**
   * Upload the garment. Pass a cut-out with transparency for the best result.
   * The image should fill its frame (tight crop); see garment/prepareGarment.
   */
  setGarment(source: TexImageSource): void {
    this._ctx.updateTexture(this._garmentTexture, source, {
      premultiply: true,
      mipmaps: true,
      anisotropy: 4,
    });
    const w = (source as { width?: number; videoWidth?: number }).width ?? 0;
    const h = (source as { height?: number; videoHeight?: number }).height ?? 0;
    if (w > 0 && h > 0) this._garmentAspect = w / h;
    this._hasGarment = true;
    this._warpMesh.setAspects(this._garmentAspect, this._screenAspect());
    this._warpMesh.updateIdentity();
    // New garment: start hidden until a pose arrives, so it never flashes mid-screen.
    this._visibility = 0;
    this._current.clear();
    this._meshDirty = true;
  }

  clearGarment(): void {
    this._hasGarment = false;
    this._targets.clear();
    this._current.clear();
    this._smoothed = [];
    this._visibility = 0;
  }

  // ---- Tracking input ----------------------------------------------------------

  /**
   * Latest control points from the tracker (call on every tracking result with a pose).
   * @param nowMs  performance.now()
   */
  setControlPoints(controlPoints: readonly ControlPoint[], nowMs: number = performance.now()): void {
    this._targets = new Map(controlPoints.map((c) => [c.key, c]));
    if (controlPoints.length >= 2) this._lastTargetTime = nowMs;
    this._meshDirty = true;
  }

  /** Jump straight to the targets with no easing (stills, first frame after a long loss). */
  snapTo(controlPoints: readonly ControlPoint[], nowMs: number = performance.now()): void {
    this.setControlPoints(controlPoints, nowMs);
    this._current.clear();
    this._visibility = 1;
    this._lastDrawTime = nowMs;
  }

  setOcclusionMask(mask: OcclusionMask | null): void {
    this._occlusion.setMask(mask);
  }

  // ---- Drawing -----------------------------------------------------------------

  /** Full render pass. Call once per camera frame. */
  draw(videoSource: TexImageSource, nowMs: number = performance.now()): void {
    const { gl } = this._ctx;
    if (this._ctx.isContextLost) return;

    const dt = this._lastDrawTime > 0 ? Math.min(100, Math.max(0, nowMs - this._lastDrawTime)) : 16;
    this._lastDrawTime = nowMs;

    this._updateVisibility(nowMs, dt);
    const drawGarment = this._hasGarment && this._visibility > 0.01 && this._targets.size >= 2;
    const wantShading = drawGarment && this._options.shading > 0;

    // 1) Camera
    gl.disable(gl.BLEND);
    this._passthrough.draw(videoSource, wantShading);

    if (!drawGarment) return;

    // 2) Garment
    this._followTargets(dt);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
    gl.useProgram(this._warpProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._garmentTexture);
    gl.uniform1i(this._uGarment, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._passthrough.texture);
    gl.uniform1i(this._uVideo, 1);

    const cw = this._ctx.canvas.width;
    const ch = this._ctx.canvas.height;
    const videoW = (videoSource as { videoWidth?: number; width?: number }).videoWidth
      ?? (videoSource as { width?: number }).width
      ?? cw;
    gl.uniform2f(this._uResolution, cw, ch);
    gl.uniform1f(this._uMirror, this._passthrough.mirror ? 1 : 0);
    gl.uniform1f(this._uOpacity, this._options.opacity * this._visibility);
    gl.uniform1f(this._uEdgeFade, this._options.edgeFade);
    gl.uniform1f(this._uShading, wantShading ? this._options.shading : 0);
    // ~4 px and ~32 px blur at 1280 wide, scaled with resolution.
    gl.uniform1f(this._uLodFine, Math.max(0, Math.log2(videoW / 320)));
    gl.uniform1f(this._uLodCoarse, Math.max(1, Math.log2(videoW / 40)));

    this._warpMesh.draw();

    // 3) Occlusion
    this._occlusion.draw(this._passthrough.texture, this._passthrough.mirror);
  }

  dispose(): void {
    const { gl } = this._ctx;
    this._passthrough.dispose();
    this._occlusion.dispose();
    this._warpMesh.dispose();
    gl.deleteProgram(this._warpProgram);
    gl.deleteTexture(this._garmentTexture);
  }

  // ---- Internals ---------------------------------------------------------------

  private _screenAspect(): number {
    const c = this._ctx.canvas;
    return c.height > 0 ? c.width / c.height : 16 / 9;
  }

  private _updateVisibility(nowMs: number, dt: number): void {
    const tracked = nowMs - this._lastTargetTime <= this._options.lostGraceMs;
    const step = this._options.fadeMs > 0 ? dt / this._options.fadeMs : 1;
    this._visibility = clamp(this._visibility + (tracked ? step : -step), 0, 1);
  }

  /** Ease the live control points toward the targets, then rebuild the mesh if anything moved. */
  private _followTargets(dt: number): void {
    const tau = this._options.smoothingMs;
    const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
    let moved = this._meshDirty;
    // First frame (or after snapTo): trust the measured weights immediately.
    const fresh = this._current.size === 0;

    // Move existing / create new points.
    for (const [key, t] of this._targets) {
      const cur = this._current.get(key);
      if (!cur) {
        this._current.set(key, {
          u: t.dstU,
          v: t.dstV,
          w: fresh ? t.weight : 0,
          su: t.srcU,
          sv: t.srcV,
        });
        moved = true;
        continue;
      }
      cur.su = t.srcU;
      cur.sv = t.srcV;
      const du = (t.dstU - cur.u) * k;
      const dv = (t.dstV - cur.v) * k;
      // Weight eases up faster than position so a re-appearing point does not tug the mesh.
      const dw = (t.weight - cur.w) * Math.min(1, k * 2);
      cur.u += du;
      cur.v += dv;
      cur.w += dw;
      if (Math.abs(du) > 2e-6 || Math.abs(dv) > 2e-6 || Math.abs(dw) > 1e-4) moved = true;
    }

    // Points that vanished: fade their weight out, then drop them.
    for (const [key, cur] of this._current) {
      if (this._targets.has(key)) continue;
      cur.w += (0 - cur.w) * Math.min(1, k * 2);
      moved = true;
      if (cur.w < 0.02) this._current.delete(key);
    }

    if (!moved) return;
    this._meshDirty = false;

    // Rebuild. A vanished point keeps its last position while its weight fades,
    // so the mesh does not jump when a sleeve/hip pin drops out.
    const out: ControlPoint[] = [];
    for (const [key, cur] of this._current) {
      out.push({ key, srcU: cur.su, srcV: cur.sv, dstU: cur.u, dstV: cur.v, weight: cur.w });
    }
    this._smoothed = out;

    this._warpMesh.setAspects(this._garmentAspect, this._screenAspect());
    this._warpMesh.update(out, this._options.warpAlpha);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
