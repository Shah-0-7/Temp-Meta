/**
 * @module providers/garment-normalizer/CutoutOnlyNormalizer
 *
 * Default GarmentNormalizer that simply returns the garment cutout
 * with a transparent background. Does NOT synthesize a flat-lay.
 *
 * Real flat-lay synthesis will be provided by Meta Muse Image.
 */

import type {
  GarmentNormalizer,
  ProviderCapability,
} from '../types.js';

export class CutoutOnlyNormalizer implements GarmentNormalizer {
  readonly name = 'cutout-only';
  readonly capabilities: readonly ProviderCapability[] = ['garment-normalizer'];

  async initialize(): Promise<void> {
    // No setup needed
  }

  async dispose(): Promise<void> {
    // Nothing to clean up
  }

  isAvailable(): boolean {
    // Cutout-only is always available but doesn't do real normalization
    return false;
  }

  async normalize(image: ImageBitmap, mask: ImageData): Promise<ImageBitmap> {
    // Apply the mask as alpha to produce a cutout
    // This preserves the garment as-is without flat-lay synthesis
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for cutout');

    // Draw the original image
    ctx.drawImage(image, 0, 0);

    // Get the image data and apply mask alpha
    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    // Scale mask to image dimensions if needed
    const scaleX = image.width / mask.width;
    const scaleY = image.height / mask.height;

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const imgIdx = (y * image.width + x) * 4;
        const maskX = Math.min(Math.floor(x / scaleX), mask.width - 1);
        const maskY = Math.min(Math.floor(y / scaleY), mask.height - 1);
        const maskIdx = (maskY * mask.width + maskX) * 4;
        // Use mask alpha channel
        imageData.data[imgIdx + 3] = mask.data[maskIdx + 3];
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return createImageBitmap(canvas);
  }
}
