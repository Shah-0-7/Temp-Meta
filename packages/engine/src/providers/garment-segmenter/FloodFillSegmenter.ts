/**
 * @module providers/garment-segmenter/FloodFillSegmenter
 *
 * Default GarmentSegmenter: no model, no network. Handles the common case of
 * studio / flat-lay product photos (uniform background) plus manual selection:
 *   - text prompt  -> automatic: existing alpha, else border-colour flood fill
 *   - box prompt   -> automatic inside the box (everything in the box if unclear)
 *   - point prompt -> magic wand around the clicked pixel
 *
 * Masks are returned at the (possibly downscaled) working resolution, as
 * ImageData with the mask in the alpha channel (same contract as every segmenter).
 * Meta SAM 3.1 (via the server) replaces this for cluttered on-model photos.
 */

import type {
  GarmentSegmenter,
  ProviderCapability,
  SegmentationPrompt,
  SegmentationResult,
} from '../types.js';
import { autoSegment, magicWand, segmentBox, filterComponents, softenMask, type RgbaImage } from '../../garment/cutout.js';
import { readPixels } from '../../garment/prepareGarment.js';
import { rasterToMaskImageData } from '../../mask/rle.js';

export type PixelReader = (image: ImageBitmap) => RgbaImage;

export class FloodFillSegmenter implements GarmentSegmenter {
  readonly name = 'flood-fill';
  readonly capabilities: readonly ProviderCapability[] = ['garment-segmenter'];

  constructor(
    private readonly _read: PixelReader = (img) => readPixels(img, 1600),
    private readonly _tolerance = 48,
  ) {}

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {}

  supportsPromptType(type: SegmentationPrompt['type']): boolean {
    return type === 'text' || type === 'point' || type === 'box';
  }

  async segment(image: ImageBitmap, prompt: SegmentationPrompt): Promise<SegmentationResult> {
    if (!this.supportsPromptType(prompt.type)) {
      throw new Error(`FloodFillSegmenter does not support "${prompt.type}" prompts.`);
    }
    const px = this._read(image);
    const { width: w, height: h } = px;
    const sx = w / image.width;
    const sy = h / image.height;

    let mask: Uint8Array;
    let score: number;

    if (prompt.type === 'point') {
      const p = prompt.value as { x: number; y: number };
      mask = filterComponents(magicWand(px, p.x * sx, p.y * sy, 40), w, h, 0.05);
      score = 0.7;
    } else if (prompt.type === 'box') {
      const b = prompt.value as { x1: number; y1: number; x2: number; y2: number };
      const r = segmentBox(px, { x1: b.x1 * sx, y1: b.y1 * sy, x2: b.x2 * sx, y2: b.y2 * sy }, this._tolerance);
      mask = r.mask;
      score = r.confidence;
    } else {
      const r = autoSegment(px, this._tolerance);
      mask = r.mask;
      score = r.confidence;
    }

    // Soft edge so downstream compositing is clean.
    const alpha = softenMask(mask, w, h, { erode: 1, feather: 1 });
    return { masks: [rasterToMaskImageData(alpha, w, h)], scores: [score], selectedIndex: 0 };
  }
}
