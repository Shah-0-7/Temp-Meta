/**
 * @module mask/rle
 *
 * Compact, dependency-free mask helpers shared by the server (which returns
 * segmentation masks) and the browser (which decodes them).
 *
 * Wire format: a binary mask is sent as alternating run lengths that always
 * START with a run of zeros (which may be 0 long):
 *
 *   [zeros, ones, zeros, ones, ...]
 *
 * A typical garment mask at 1500x1500 compresses from ~2.2 MB raw to a few KB.
 */

/** Encode a mask (any non-zero value counts as foreground) into alternating runs. */
export function encodeMaskRuns(mask: ArrayLike<number>): number[] {
  const runs: number[] = [];
  let current = 0; // value of the run being counted (0 first, by definition)
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] !== 0 ? 1 : 0;
    if (v === current) {
      count++;
    } else {
      runs.push(count);
      current = v;
      count = 1;
    }
  }
  runs.push(count);
  return runs;
}

/**
 * Decode alternating runs back into a 0/1 raster.
 * @throws if the runs do not add up to `length` or contain invalid values.
 */
export function decodeMaskRuns(runs: readonly number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let pos = 0;
  let value = 0;
  for (const run of runs) {
    if (!Number.isInteger(run) || run < 0) {
      throw new Error(`Invalid mask run length: ${run}`);
    }
    if (pos + run > length) {
      throw new Error(`Mask runs exceed expected length (${pos + run} > ${length}).`);
    }
    if (value === 1) out.fill(1, pos, pos + run);
    pos += run;
    value ^= 1;
  }
  if (pos !== length) {
    throw new Error(`Mask runs cover ${pos} pixels, expected ${length}.`);
  }
  return out;
}

/** Threshold an alpha-style mask (0..255) into a 0/1 raster. */
export function binarize(alpha: ArrayLike<number>, threshold = 128): Uint8Array {
  const out = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) out[i] = alpha[i] >= threshold ? 1 : 0;
  return out;
}

/**
 * Wrap a mask raster in an ImageData the way every GarmentSegmenter does:
 * white RGB, with the mask value carried in the ALPHA channel.
 * Accepts 0/1 rasters (scaled to 0/255) or 0..255 alpha rasters.
 */
export function rasterToMaskImageData(
  raster: ArrayLike<number>,
  width: number,
  height: number,
): ImageData {
  if (raster.length !== width * height) {
    throw new Error(`Raster length ${raster.length} does not match ${width}x${height}.`);
  }
  let max = 0;
  for (let i = 0; i < raster.length; i++) if (raster[i] > max) max = raster[i];
  const scale = max <= 1 ? 255 : 1;

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < raster.length; i++) {
    const o = i * 4;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
    data[o + 3] = raster[i] * scale;
  }
  return new ImageData(data, width, height);
}

/** Read the alpha channel of a mask ImageData back out as a 0..255 raster. */
export function maskImageDataToAlpha(mask: ImageData): Uint8Array {
  const out = new Uint8Array(mask.width * mask.height);
  for (let i = 0; i < out.length; i++) out[i] = mask.data[i * 4 + 3];
  return out;
}

/** Bilinear resize of a single-channel (0..255) raster. */
export function resizeAlpha(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8Array {
  if (src.length !== sw * sh) {
    throw new Error(`Source length ${src.length} does not match ${sw}x${sh}.`);
  }
  const out = new Uint8Array(dw * dh);
  if (sw === dw && sh === dh) {
    for (let i = 0; i < out.length; i++) out[i] = src[i];
    return out;
  }
  const xRatio = sw / dw;
  const yRatio = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, Math.min(sh - 1, (y + 0.5) * yRatio - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, Math.min(sw - 1, (x + 0.5) * xRatio - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const top = src[y0 * sw + x0] * (1 - wx) + src[y0 * sw + x1] * wx;
      const bottom = src[y1 * sw + x0] * (1 - wx) + src[y1 * sw + x1] * wx;
      out[y * dw + x] = Math.round(top * (1 - wy) + bottom * wy);
    }
  }
  return out;
}
