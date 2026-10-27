/**
 * @module garment/prepareGarment
 *
 * Turns a product photo into what the renderer needs:
 *   - a tight, background-free cut-out (RGBA) so no white rectangle is drawn on you
 *   - garment anchors (shoulders, hem, sleeves) measured from its silhouette
 *
 * `prepareFromRgba` is pure (testable in Node). `prepareGarmentImage` is the
 * browser wrapper that reads pixels from an image/canvas and returns a canvas.
 *
 * The cut-out is made WITHOUT any model: transparency already in the file, else a
 * border-colour flood fill (studio shots), else a user-provided mask (manual
 * selection or a segmentation provider such as Meta SAM 3.1).
 */

import {
  autoSegment,
  segmentBox,
  buildCutout,
  filterComponents,
  softenMask,
  type RgbaImage,
  type PixelBox,
} from './cutout.js';
import { analyzeGarment, defaultAnchors, type GarmentAnchors } from './anchors.js';
import { resizeAlpha } from '../mask/rle.js';

export type CutoutMode = 'existing-alpha' | 'flood-fill' | 'mask' | 'none';

export interface PrepareOptions {
  /** Largest side of the processed image. Default 1600. */
  maxSize?: number;
  /** Externally supplied foreground mask, 0..255 per pixel at (maskWidth x maskHeight). */
  mask?: { data: ArrayLike<number>; width: number; height: number };
  /** Restrict automatic segmentation to this box (manual selection), in source pixels. */
  box?: PixelBox;
  /** Flood-fill colour tolerance. Default 48. */
  tolerance?: number;
}

export interface PreparedGarmentData {
  /** The image to upload as the garment texture (cut-out when mode !== 'none'). */
  image: RgbaImage;
  anchors: GarmentAnchors;
  /** 0..1 confidence that the cut-out is clean. */
  confidence: number;
  mode: CutoutMode;
}

/** Pure pipeline on RGBA pixels. Never throws on odd input; falls back to the whole image. */
export function prepareFromRgba(src: RgbaImage, options: PrepareOptions = {}): PreparedGarmentData {
  const { width: w, height: h } = src;
  const tolerance = options.tolerance ?? 48;

  let mask: Uint8Array | null = null;
  let background: { r: number; g: number; b: number } | null = null;
  let confidence = 0;
  let mode: CutoutMode = 'none';

  if (options.mask) {
    const m = options.mask;
    const a = resizeAlpha(m.data as ArrayLike<number>, m.width, m.height, w, h);
    mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = a[i] >= 128 ? 1 : 0;
    mask = filterComponents(mask, w, h);
    confidence = 0.9;
    mode = 'mask';
  } else {
    const auto = options.box
      ? segmentBox(src, options.box, tolerance)
      : autoSegment(src, tolerance);
    mask = auto.mask;
    background = auto.background;
    confidence = auto.confidence;
    mode = auto.background === null ? 'existing-alpha' : 'flood-fill';
  }

  // Too little confidence or nothing selected -> keep the full photo.
  let covered = 0;
  for (let i = 0; i < mask.length; i++) covered += mask[i];
  if (confidence < 0.45 || covered < w * h * 0.02) {
    return { image: src, anchors: defaultAnchors(), confidence: 0, mode: 'none' };
  }

  const alpha = softenMask(mask, w, h, { erode: 1, feather: 1 });
  const cut = buildCutout(src, alpha, { defringeBackground: background, padding: 0.03 });
  if (!cut) {
    return { image: src, anchors: defaultAnchors(), confidence: 0, mode: 'none' };
  }

  // Anchors from the cut-out's own alpha channel.
  const cw = cut.image.width;
  const ch = cut.image.height;
  const cutAlpha = new Uint8Array(cw * ch);
  for (let i = 0; i < cutAlpha.length; i++) cutAlpha[i] = cut.image.data[i * 4 + 3];
  const anchors = analyzeGarment(cutAlpha, cw, ch);

  return { image: cut.image, anchors, confidence, mode };
}

// ---------------------------------------------------------------------------
// Browser wrapper
// ---------------------------------------------------------------------------

export interface PreparedGarment {
  /** Draw this to the GPU (HTMLCanvasElement or OffscreenCanvas). */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  /** width / height of the cut-out. */
  aspect: number;
  anchors: GarmentAnchors;
  confidence: number;
  mode: CutoutMode;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function context2d(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available.');
  return ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

/** Read pixels from an image, downscaled so its longest side is <= maxSize. */
export function readPixels(
  source: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number },
  maxSize = 1600,
): RgbaImage {
  const sw = source.naturalWidth ?? source.videoWidth ?? source.width ?? 0;
  const sh = source.naturalHeight ?? source.videoHeight ?? source.height ?? 0;
  if (!sw || !sh) throw new Error('The image has no size (not loaded yet?).');
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = makeCanvas(w, h);
  const ctx = context2d(canvas);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { data: data.data, width: w, height: h };
}

export function rgbaToCanvas(img: RgbaImage): HTMLCanvasElement | OffscreenCanvas {
  const canvas = makeCanvas(img.width, img.height);
  const ctx = context2d(canvas);
  // Copy: ImageData needs a plain ArrayBuffer-backed array.
  const copy = new Uint8ClampedArray(img.data);
  ctx.putImageData(new ImageData(copy, img.width, img.height), 0, 0);
  return canvas;
}

/**
 * Prepare a loaded <img>/ImageBitmap/canvas for rendering.
 * Throws only if the image cannot be read (e.g. a cross-origin image without CORS,
 * which taints the canvas): use the server image proxy for remote garments.
 */
export function prepareGarmentImage(
  source: Parameters<typeof readPixels>[0],
  options: PrepareOptions = {},
): PreparedGarment {
  const pixels = readPixels(source, options.maxSize ?? 1600);
  const prepared = prepareFromRgba(pixels, options);
  const canvas = rgbaToCanvas(prepared.image);
  return {
    canvas,
    width: prepared.image.width,
    height: prepared.image.height,
    aspect: prepared.image.width / prepared.image.height,
    anchors: prepared.anchors,
    confidence: prepared.confidence,
    mode: prepared.mode,
  };
}
