/**
 * @module garment/cutout
 *
 * Pure pixel-level helpers that turn a product photo into a garment cut-out
 * (RGBA with a clean alpha edge, cropped to the garment).
 *
 * Why this exists: the Tier A renderer draws the garment texture as-is, so a
 * product photo with a white studio background would paint a white rectangle
 * over the user. These helpers remove that background WITHOUT any ML model, so
 * the default (no API key) path works on typical flat-lay / studio shots.
 * Meta SAM 3.1 (via the remote provider) handles the hard cases.
 *
 * Everything here operates on plain typed arrays so it is unit-testable in Node.
 */

export interface RgbaImage {
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Pixel box. x1/y1 inclusive, x2/y2 exclusive. */
export interface PixelBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BackgroundEstimate {
  r: number;
  g: number;
  b: number;
  /** Fraction of border pixels within `tolerance` of the estimate (0..1). */
  coverage: number;
}

// ---------------------------------------------------------------------------
// Colour distance
// ---------------------------------------------------------------------------

/**
 * Cheap perceptual RGB distance ("redmean"). A uniform +-15 difference on every
 * channel is about 45 in this metric.
 */
export function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db,
  );
}

// ---------------------------------------------------------------------------
// Existing transparency
// ---------------------------------------------------------------------------

/**
 * If the image already carries meaningful transparency (e.g. a PNG cut-out from
 * the retailer), return its foreground mask (1 = opaque enough). Otherwise null.
 */
export function existingAlphaMask(img: RgbaImage, minTransparentFraction = 0.02): Uint8Array | null {
  const n = img.width * img.height;
  let transparent = 0;
  for (let i = 0; i < n; i++) if (img.data[i * 4 + 3] < 250) transparent++;
  if (transparent / n < minTransparentFraction) return null;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = img.data[i * 4 + 3] >= 128 ? 1 : 0;
  return mask;
}

// ---------------------------------------------------------------------------
// Background estimation + flood fill
// ---------------------------------------------------------------------------

/**
 * Estimate the dominant background colour from a ring of border pixels.
 * Uses a 4-bit-per-channel histogram so a few garment pixels touching the
 * border do not skew the estimate.
 */
export function estimateBackground(
  img: RgbaImage,
  tolerance = 48,
  ringWidth = 2,
): BackgroundEstimate {
  const { data, width: w, height: h } = img;
  const ring = Math.max(1, Math.min(ringWidth, Math.floor(Math.min(w, h) / 2)));

  const isBorder = (x: number, y: number) =>
    x < ring || y < ring || x >= w - ring || y >= h - ring;

  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  let total = 0;

  const visit = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    // Fully transparent pixels count as background and carry no colour.
    if (data[i + 3] < 10) return;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key);
    if (bin) {
      bin.count++;
      bin.r += r; bin.g += g; bin.b += b;
    } else {
      bins.set(key, { count: 1, r, g, b });
    }
  };

  for (let y = 0; y < h; y++) {
    if (y < ring || y >= h - ring) {
      for (let x = 0; x < w; x++) { visit(x, y); total++; }
    } else {
      for (let x = 0; x < ring; x++) { visit(x, y); total++; }
      for (let x = w - ring; x < w; x++) { visit(x, y); total++; }
    }
  }
  void isBorder;

  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bin of bins.values()) if (!best || bin.count > best.count) best = bin;

  if (!best) {
    // Entire border is transparent.
    return { r: 255, g: 255, b: 255, coverage: 1 };
  }

  const r = best.r / best.count;
  const g = best.g / best.count;
  const b = best.b / best.count;

  // Second pass: how much of the border does this colour actually explain?
  let matching = 0;
  for (let y = 0; y < h; y++) {
    const full = y < ring || y >= h - ring;
    const check = (x: number) => {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 10 || colorDistance(data[i], data[i + 1], data[i + 2], r, g, b) <= tolerance) {
        matching++;
      }
    };
    if (full) for (let x = 0; x < w; x++) check(x);
    else {
      for (let x = 0; x < ring; x++) check(x);
      for (let x = w - ring; x < w; x++) check(x);
    }
  }

  return { r, g, b, coverage: total ? matching / total : 0 };
}

/**
 * Flood-fill the background from the image border and return the FOREGROUND
 * mask (1 = garment). Interior regions that look like the background (a white
 * graphic on a white tee) stay foreground because they are not reachable from
 * the border.
 */
export function floodFillForeground(
  img: RgbaImage,
  bg: { r: number; g: number; b: number },
  tolerance = 48,
): Uint8Array {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const isBg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  const matches = (idx: number): boolean => {
    const i = idx * 4;
    if (data[i + 3] < 10) return true;
    return colorDistance(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b) <= tolerance;
  };

  const push = (idx: number) => {
    if (isBg[idx] || !matches(idx)) return;
    isBg[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + (w - 1)); }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) push(idx - 1);
    if (x < w - 1) push(idx + 1);
    if (y > 0) push(idx - w);
    if (y < h - 1) push(idx + w);
  }

  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = isBg[i] ? 0 : 1;
  return fg;
}

// ---------------------------------------------------------------------------
// Magic wand (click selection)
// ---------------------------------------------------------------------------

/**
 * Select the connected region around (seedX, seedY) whose colour stays within
 * `tolerance` of the (3x3-averaged) seed colour. Optionally constrained to a box.
 */
export function magicWand(
  img: RgbaImage,
  seedX: number,
  seedY: number,
  tolerance = 40,
  region?: PixelBox,
): Uint8Array {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const out = new Uint8Array(n);

  const sx = Math.max(0, Math.min(w - 1, Math.round(seedX)));
  const sy = Math.max(0, Math.min(h - 1, Math.round(seedY)));
  const box = region ?? { x1: 0, y1: 0, x2: w, y2: h };
  if (sx < box.x1 || sx >= box.x2 || sy < box.y1 || sy >= box.y2) return out;

  // Average a 3x3 patch so a single noisy pixel does not define the selection.
  let sr = 0, sg = 0, sb = 0, sc = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = (y * w + x) * 4;
      sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; sc++;
    }
  }
  sr /= sc; sg /= sc; sb /= sc;

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (x: number, y: number) => {
    if (x < box.x1 || y < box.y1 || x >= box.x2 || y >= box.y2) return;
    const idx = y * w + x;
    if (out[idx]) return;
    const i = idx * 4;
    if (data[i + 3] < 10) return;
    if (colorDistance(data[i], data[i + 1], data[i + 2], sr, sg, sb) > tolerance) return;
    out[idx] = 1;
    queue[tail++] = idx;
  };

  push(sx, sy);
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mask clean-up
// ---------------------------------------------------------------------------

/**
 * Keep only connected components whose area is at least `minRelativeArea` of the
 * largest component. Removes specks, tags and shadow islands but keeps
 * multi-part garments.
 */
export function filterComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minRelativeArea = 0.08,
): Uint8Array {
  const n = width * height;
  const label = new Int32Array(n); // 0 = unvisited / background
  const areas: number[] = [0];
  const stack = new Int32Array(n);
  let next = 1;

  for (let start = 0; start < n; start++) {
    if (!mask[start] || label[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    label[start] = next;
    let area = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      area++;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x > 0 && mask[idx - 1] && !label[idx - 1]) { label[idx - 1] = next; stack[sp++] = idx - 1; }
      if (x < width - 1 && mask[idx + 1] && !label[idx + 1]) { label[idx + 1] = next; stack[sp++] = idx + 1; }
      if (y > 0 && mask[idx - width] && !label[idx - width]) { label[idx - width] = next; stack[sp++] = idx - width; }
      if (y < height - 1 && mask[idx + width] && !label[idx + width]) { label[idx + width] = next; stack[sp++] = idx + width; }
    }
    areas.push(area);
    next++;
  }

  const largest = Math.max(0, ...areas);
  const out = new Uint8Array(n);
  if (largest === 0) return out;
  const keep = areas.map((a) => a >= largest * minRelativeArea);
  for (let i = 0; i < n; i++) if (label[i] && keep[label[i]]) out[i] = 1;
  return out;
}

/** Binary erosion with a 4-neighbourhood, repeated `radius` times. */
export function erodeMask(mask: Uint8Array, width: number, height: number, radius = 1): Uint8Array {
  let src = mask;
  for (let r = 0; r < radius; r++) {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!src[idx]) continue;
        // Pixels on the image edge keep their value so a garment that touches
        // the frame is not eaten away there.
        const l = x > 0 ? src[idx - 1] : 1;
        const rr = x < width - 1 ? src[idx + 1] : 1;
        const u = y > 0 ? src[idx - width] : 1;
        const d = y < height - 1 ? src[idx + width] : 1;
        dst[idx] = l && rr && u && d ? 1 : 0;
      }
    }
    src = dst;
  }
  return src === mask ? new Uint8Array(mask) : src;
}

/** Separable box blur of a 0..255 raster using running sums. */
export function boxBlur(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(src);
  const tmp = new Float32Array(src.length);
  const out = new Uint8Array(src.length);
  const win = radius * 2 + 1;

  // Horizontal
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.max(0, Math.min(width - 1, x))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / win;
      const add = Math.min(width - 1, x + radius + 1);
      const sub = Math.max(0, x - radius);
      sum += src[row + add] - src[row + sub];
    }
  }
  // Vertical
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.max(0, Math.min(height - 1, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = Math.round(sum / win);
      const add = Math.min(height - 1, y + radius + 1);
      const sub = Math.max(0, y - radius);
      sum += tmp[add * width + x] - tmp[sub * width + x];
    }
  }
  return out;
}

export interface SoftenOptions {
  /** Pixels to erode the binary mask before feathering (removes the bg halo). Default 1. */
  erode?: number;
  /** Feather (box-blur) radius in pixels. Default 1. */
  feather?: number;
}

/** Turn a binary mask into a soft 0..255 alpha with a clean, halo-free edge. */
export function softenMask(
  mask: Uint8Array,
  width: number,
  height: number,
  options: SoftenOptions = {},
): Uint8Array {
  const { erode = 1, feather = 1 } = options;
  const eroded = erode > 0 ? erodeMask(mask, width, height, erode) : mask;
  const alpha = new Uint8Array(mask.length);
  for (let i = 0; i < alpha.length; i++) alpha[i] = eroded[i] ? 255 : 0;
  return feather > 0 ? boxBlur(alpha, width, height, feather) : alpha;
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** Tight bounding box of the non-zero pixels (x2/y2 exclusive), or null if empty. */
export function maskBounds(
  mask: ArrayLike<number>,
  width: number,
  height: number,
  threshold = 1,
): PixelBox | null {
  let x1 = width, y1 = height, x2 = -1, y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] >= threshold) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  return x2 < 0 ? null : { x1, y1, x2: x2 + 1, y2: y2 + 1 };
}

/** Fraction of pixels that are foreground (0..1). */
export function maskCoverage(mask: ArrayLike<number>, threshold = 1): number {
  if (mask.length === 0) return 0;
  let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] >= threshold) c++;
  return c / mask.length;
}

/** Clamp a box into the image and make sure it has non-zero area. */
export function clampBox(box: PixelBox, width: number, height: number): PixelBox {
  const x1 = Math.max(0, Math.min(width - 1, Math.floor(Math.min(box.x1, box.x2))));
  const y1 = Math.max(0, Math.min(height - 1, Math.floor(Math.min(box.y1, box.y2))));
  const x2 = Math.max(x1 + 1, Math.min(width, Math.ceil(Math.max(box.x1, box.x2))));
  const y2 = Math.max(y1 + 1, Math.min(height, Math.ceil(Math.max(box.y1, box.y2))));
  return { x1, y1, x2, y2 };
}

// ---------------------------------------------------------------------------
// High-level segmentation helpers (used by FloodFillSegmenter)
// ---------------------------------------------------------------------------

export interface AutoSegmentResult {
  /** 1 = garment. */
  mask: Uint8Array;
  /** Estimated background colour (null if the image already had transparency). */
  background: { r: number; g: number; b: number } | null;
  /** 0..1 heuristic confidence. */
  confidence: number;
}

/**
 * Automatic garment/background separation for studio-style product photos.
 * Strategy: existing alpha → else border-colour flood fill → keep real components.
 */
export function autoSegment(img: RgbaImage, tolerance = 48): AutoSegmentResult {
  const { width: w, height: h } = img;

  const existing = existingAlphaMask(img);
  if (existing) {
    const cleaned = filterComponents(existing, w, h);
    return { mask: cleaned, background: null, confidence: 0.95 };
  }

  const bg = estimateBackground(img, tolerance);
  const filled = floodFillForeground(img, bg, tolerance);
  const mask = filterComponents(filled, w, h);
  const coverage = maskCoverage(mask);

  // Confidence: a uniform border + a plausible garment size => trustworthy.
  let confidence = bg.coverage;
  if (coverage < 0.03) confidence *= 0.3; // almost nothing left: probably all bg
  else if (coverage > 0.95) confidence *= 0.3; // nothing removed: bg not uniform
  else if (coverage > 0.85) confidence *= 0.6;
  return { mask, background: { r: bg.r, g: bg.g, b: bg.b }, confidence: Math.max(0, Math.min(1, confidence)) };
}

/**
 * Segment inside a user-drawn box. Falls back to "everything in the box" when
 * the box border is not a uniform background.
 */
export function segmentBox(img: RgbaImage, box: PixelBox, tolerance = 48): AutoSegmentResult {
  const { width: w, height: h } = img;
  const b = clampBox(box, w, h);
  const cw = b.x2 - b.x1;
  const ch = b.y2 - b.y1;

  const crop = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcStart = ((b.y1 + y) * w + b.x1) * 4;
    crop.set(img.data.subarray(srcStart, srcStart + cw * 4), y * cw * 4);
  }
  const cropImg: RgbaImage = { data: crop, width: cw, height: ch };
  const inner = autoSegment(cropImg, tolerance);
  const innerCoverage = maskCoverage(inner.mask);

  const out = new Uint8Array(w * h);
  const usable = inner.confidence >= 0.5 && innerCoverage >= 0.03 && innerCoverage <= 0.97;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const v = usable ? inner.mask[y * cw + x] : 1;
      if (v) out[(b.y1 + y) * w + (b.x1 + x)] = 1;
    }
  }
  return {
    mask: out,
    background: usable ? inner.background : null,
    confidence: usable ? inner.confidence : 0.4,
  };
}

// ---------------------------------------------------------------------------
// Cut-out building
// ---------------------------------------------------------------------------

export interface CutoutOptions {
  /** Padding around the garment as a fraction of its longest side. Default 0.03. */
  padding?: number;
  /**
   * Known background colour. When given, edge pixels are "un-mixed" from it so
   * no coloured halo remains (defringe).
   */
  defringeBackground?: { r: number; g: number; b: number } | null;
  /** Alpha threshold below which a pixel does not count for the crop bounds. Default 16. */
  boundsThreshold?: number;
}

export interface Cutout {
  image: RgbaImage;
  /** Where the crop sits in the source image. */
  bounds: PixelBox;
}

/**
 * Apply a 0..255 alpha mask to an image, defringe the edge, and crop tightly
 * around the garment so the garment fills the texture (the warp assumes that).
 * Returns null when the mask is empty.
 */
export function buildCutout(
  img: RgbaImage,
  alpha: ArrayLike<number>,
  options: CutoutOptions = {},
): Cutout | null {
  const { width: w, height: h } = img;
  if (alpha.length !== w * h) {
    throw new Error(`Alpha length ${alpha.length} does not match image ${w}x${h}.`);
  }
  const { padding = 0.03, defringeBackground = null, boundsThreshold = 16 } = options;

  const tight = maskBounds(alpha, w, h, boundsThreshold);
  if (!tight) return null;

  const longest = Math.max(tight.x2 - tight.x1, tight.y2 - tight.y1);
  const pad = Math.max(2, Math.round(longest * padding));
  const x1 = Math.max(0, tight.x1 - pad);
  const y1 = Math.max(0, tight.y1 - pad);
  const x2 = Math.min(w, tight.x2 + pad);
  const y2 = Math.min(h, tight.y2 + pad);
  const cw = x2 - x1;
  const ch = y2 - y1;

  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y1 + y) * w + (x1 + x)) * 4;
      const di = (y * cw + x) * 4;
      const a = (alpha[(y1 + y) * w + (x1 + x)] / 255) * (img.data[si + 3] / 255);

      let r = img.data[si];
      let g = img.data[si + 1];
      let b = img.data[si + 2];

      // Defringe: source = a*fg + (1-a)*bg  =>  fg = (source - (1-a)*bg) / a
      if (defringeBackground && a > 0.05 && a < 0.98) {
        const inv = 1 - a;
        r = (r - inv * defringeBackground.r) / a;
        g = (g - inv * defringeBackground.g) / a;
        b = (b - inv * defringeBackground.b) / a;
      }

      out[di] = r;       // Uint8ClampedArray clamps to 0..255
      out[di + 1] = g;
      out[di + 2] = b;
      out[di + 3] = Math.round(a * 255);
    }
  }

  return {
    image: { data: out, width: cw, height: ch },
    bounds: { x1, y1, x2, y2 },
  };
}
