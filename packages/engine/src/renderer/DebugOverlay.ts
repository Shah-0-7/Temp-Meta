/**
 * @module renderer/DebugOverlay
 *
 * Draws debug visualization on a 2D canvas overlaid on the WebGL output:
 * - Pose skeleton lines and landmark dots
 * - Segmentation mask heatmap (clothes=blue, skin=green, hair=purple)
 *
 * Uses a separate 2D canvas so it doesn't interfere with the WebGL pipeline.
 */

import type { Landmark, SegmentationMask } from '../tracking/types.js';
import { SKELETON_CONNECTIONS, SegmentationClass } from '../tracking/types.js';

/** Color map for segmentation classes (RGBA). */
const CLASS_COLORS: Record<number, [number, number, number, number]> = {
  [SegmentationClass.Background]:  [0, 0, 0, 0],         // Transparent
  [SegmentationClass.Hair]:        [128, 0, 255, 100],    // Purple
  [SegmentationClass.BodySkin]:    [0, 200, 100, 80],     // Green
  [SegmentationClass.FaceSkin]:    [255, 200, 100, 80],   // Warm yellow
  [SegmentationClass.Clothes]:     [0, 120, 255, 100],    // Blue
  [SegmentationClass.Accessories]: [255, 100, 200, 80],   // Pink
};

export class DebugOverlay {
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _maskImageData: ImageData | null = null;
  private _maskCanvas: HTMLCanvasElement | null = null;
  private _maskCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    this._canvas = document.createElement('canvas');
    const ctx = this._canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create 2D context for debug overlay');
    this._ctx = ctx;
  }

  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }

  /** Resize the overlay canvas to match the viewport. */
  resize(width: number, height: number): void {
    if (this._canvas.width !== width || this._canvas.height !== height) {
      this._canvas.width = width;
      this._canvas.height = height;
    }
  }

  /** Clear the overlay. */
  clear(): void {
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  /**
   * Draw pose skeleton and landmarks.
   * @param landmarks Normalized [0, 1] landmarks
   * @param mirror Whether to flip X for mirrored view
   */
  drawPose(landmarks: Landmark[], mirror: boolean): void {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;

    const toX = (lm: Landmark) => (mirror ? 1 - lm.x : lm.x) * w;
    const toY = (lm: Landmark) => lm.y * h;

    // Draw skeleton connections
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.6)';
    ctx.lineWidth = 2;
    for (const [i, j] of SKELETON_CONNECTIONS) {
      const a = landmarks[i];
      const b = landmarks[j];
      if (a.visibility < 0.3 || b.visibility < 0.3) continue;

      ctx.beginPath();
      ctx.moveTo(toX(a), toY(a));
      ctx.lineTo(toX(b), toY(b));
      ctx.stroke();
    }

    // Draw landmark dots
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (lm.visibility < 0.3) continue;

      const x = toX(lm);
      const y = toY(lm);
      const radius = lm.visibility > 0.7 ? 4 : 2;

      // Color by body region
      const isArm = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].includes(i);
      const isTorso = [11, 12, 23, 24].includes(i);
      const isLeg = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(i);

      if (isTorso) ctx.fillStyle = 'rgba(255, 200, 0, 0.9)';
      else if (isArm) ctx.fillStyle = 'rgba(0, 200, 255, 0.9)';
      else if (isLeg) ctx.fillStyle = 'rgba(0, 255, 100, 0.9)';
      else ctx.fillStyle = 'rgba(255, 100, 100, 0.9)'; // Face/head

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Draw segmentation mask as a colored heatmap overlay.
   * @param mask Segmentation mask from the tracking pipeline
   * @param mirror Whether to flip X for mirrored view
   */
  drawSegmentationMask(mask: SegmentationMask, mirror: boolean): void {
    const w = this._canvas.width;
    const h = this._canvas.height;

    // Paint at mask resolution (256x256), then scale: ~65k pixels instead of ~920k.
    if (!this._maskCanvas || this._maskCanvas.width !== mask.width || this._maskCanvas.height !== mask.height) {
      this._maskCanvas = document.createElement('canvas');
      this._maskCanvas.width = mask.width;
      this._maskCanvas.height = mask.height;
      this._maskCtx = this._maskCanvas.getContext('2d')!;
      this._maskImageData = this._maskCtx.createImageData(mask.width, mask.height);
    }
    const pixels = this._maskImageData!.data;
    const n = mask.width * mask.height;
    for (let i = 0; i < n; i++) {
      const color = CLASS_COLORS[mask.data[i]] ?? CLASS_COLORS[0];
      const o = i * 4;
      pixels[o] = color[0];
      pixels[o + 1] = color[1];
      pixels[o + 2] = color[2];
      pixels[o + 3] = color[3];
    }
    this._maskCtx!.putImageData(this._maskImageData!, 0, 0);

    const ctx = this._ctx;
    ctx.save();
    if (mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this._maskCanvas, 0, 0, w, h);
    ctx.restore();
  }

  /** Garment pins (already in screen space, so no mirroring). */
  drawControlPoints(points: ReadonlyArray<{ key: string; dstU: number; dstV: number; weight: number }>): void {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;
    ctx.font = '12px sans-serif';
    for (const p of points) {
      const x = p.dstU * w;
      const y = p.dstV * h;
      ctx.fillStyle = `rgba(255, 80, 120, ${0.35 + 0.65 * Math.min(1, p.weight)})`;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(p.key, x + 9, y + 4);
    }
  }

  /**
   * Full debug draw: clear, draw segmentation, then pose on top.
   */
  draw(
    landmarks: Landmark[] | null,
    segmentation: SegmentationMask | null,
    mirror: boolean,
    controlPoints?: ReadonlyArray<{ key: string; dstU: number; dstV: number; weight: number }>,
  ): void {
    this.clear();

    if (segmentation) {
      this.drawSegmentationMask(segmentation, mirror);
    }

    if (landmarks) {
      this.drawPose(landmarks, mirror);
    }

    if (controlPoints) {
      this.drawControlPoints(controlPoints);
    }
  }
}
