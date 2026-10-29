/**
 * @module providers/tryon-generator/imagePrep
 *
 * Shrinks images before they leave the device: smaller uploads, faster renders, and
 * less data sent. Garments are cut out on transparency; vision models want them on a
 * plain background, so the garment is flattened on white.
 */

async function drawScaled(blob: Blob, maxSize: number, background?: string): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), type, quality),
  );
}

/** Person photo: longest side at most `maxSize`, JPEG. */
export async function preparePersonImage(blob: Blob, maxSize = 1280): Promise<Blob> {
  return encode(await drawScaled(blob, maxSize, '#ffffff'), 'image/jpeg', 0.92);
}

/** Garment: longest side at most `maxSize`, flattened on white, PNG. */
export async function prepareGarmentImage(blob: Blob, maxSize = 1024): Promise<Blob> {
  return encode(await drawScaled(blob, maxSize, '#ffffff'), 'image/png');
}
