/**
 * @module providers/tryon-generator/clothesEraser
 *
 * Removes the clothes a person is WEARING before the new garment is drawn on top, so a plaid
 * sleeve or a shirt hem never peeks out around a hoodie. Pure functions over typed arrays.
 *
 * It cannot invent what is under the clothes. It recolours instead:
 *   - torso area      -> the new garment's colour (an old hem becomes a plausible new hem)
 *   - arm area        -> skin for a short-sleeve garment, garment colour for a long-sleeve one
 *   - kept from the old clothes: only broad light and shadow, so the pattern (plaid, stripes,
 *     logos) is gone but the fold shading still reads.
 *
 * Only the body zone around the torso and arms is touched, so trousers, background and anything
 * the segmenter calls "accessories" (hats, glasses) are never recoloured.
 */

import type { Landmark, SegmentationMask } from '../../tracking/types.js';
import { PoseIndex, SegmentationClass } from '../../tracking/types.js';

export interface Rgb { r: number; g: number; b: number }

export interface EraseInput {
  /** RGBA pixels of the person, in camera orientation (not mirrored). */
  image: { data: Uint8ClampedArray; width: number; height: number };
  segmentation: SegmentationMask;
  /** Pose landmarks, normalised to the image. */
  landmarks: readonly Landmark[];
  /** Colour to paint where the old clothes were (see `dominantColor`). */
  garmentColor: Rgb;
  /** The new garment's sleeves reach past the elbow. */
  longSleeves: boolean;
  /** How far below the hip joints the garment's hem reaches, as a fraction of the torso. Default 0.15. */
  hemExtend?: number;
}

export interface EraseResult {
  image: { data: Uint8ClampedArray; width: number; height: number };
  /** Fraction of the image that was recoloured (0..1). */
  coverage: number;
}

export interface EraseOptions {
  /** How strongly the old clothes' broad shading is kept, 0..1. Default 0.6. */
  keepShading?: number;
  /** Below this fraction of the image, do nothing (the segmentation probably missed). Default 0.004. */
  minCoverage?: number;
}

type V = { x: number; y: number };

/** Median colour of the opaque pixels: robust to a logo or a stripe pulling the average around. */
export function dominantColor(
  data: ArrayLike<number>,
  width: number,
  height: number,
  options: { minAlpha?: number; maxSamples?: number } = {},
): Rgb | null {
  const minAlpha = options.minAlpha ?? 220;
  const total = width * height;
  const stride = Math.max(1, Math.floor(total / (options.maxSamples ?? 6000)));
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < total; i += stride) {
    if (data[i * 4 + 3] < minAlpha) continue;
    r.push(data[i * 4]);
    g.push(data[i * 4 + 1]);
    b.push(data[i * 4 + 2]);
  }
  if (r.length < 20) return null;
  const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
  return { r: med(r), g: med(g), b: med(b) };
}

/** Median colour of the person's visible skin (body first, face if no body skin shows). */
export function skinColor(
  image: EraseInput['image'],
  seg: SegmentationMask,
): Rgb | null {
  const pick = (cls: number): Rgb | null => {
    const r: number[] = [];
    const g: number[] = [];
    const b: number[] = [];
    const n = seg.width * seg.height;
    const stride = Math.max(1, Math.floor(n / 4000));
    for (let i = 0; i < n; i += stride) {
      if (seg.data[i] !== cls) continue;
      const sx = Math.min(image.width - 1, Math.floor(((i % seg.width) + 0.5) / seg.width * image.width));
      const sy = Math.min(image.height - 1, Math.floor((Math.floor(i / seg.width) + 0.5) / seg.height * image.height));
      const p = (sy * image.width + sx) * 4;
      r.push(image.data[p]);
      g.push(image.data[p + 1]);
      b.push(image.data[p + 2]);
    }
    if (r.length < 8) return null;
    const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
    return { r: med(r), g: med(g), b: med(b) };
  };
  return pick(SegmentationClass.BodySkin) ?? pick(SegmentationClass.FaceSkin);
}

// ---------------------------------------------------------------------------
// Geometry (isotropic space: x is multiplied by the aspect ratio)
// ---------------------------------------------------------------------------

function distToSegment(p: V, a: V, b: V): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 1e-12 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/** Point inside a convex quad given in either winding order. */
function inQuad(p: V, q: [V, V, V, V]): boolean {
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross > 0) pos++;
    else if (cross < 0) neg++;
  }
  return pos === 0 || neg === 0;
}

interface Zones {
  torso: [V, V, V, V];
  /** Upper arm and forearm capsules (a, b, radius). */
  arms: Array<{ a: V; b: V; r: number }>;
}

/** The body area the old clothes may be recoloured in. Null when the shoulders are not found. */
export function buildZones(lm: readonly Landmark[], aspect: number, hemExtend = 0.15): Zones | null {
  const I = PoseIndex;
  const iso = (l: Landmark): V => ({ x: l.x * aspect, y: l.y });
  const ok = (l: Landmark | undefined, min: number): l is Landmark => !!l && l.visibility >= min;

  const lsL = lm[I.LEFT_SHOULDER];
  const lsR = lm[I.RIGHT_SHOULDER];
  if (!ok(lsL, 0.3) || !ok(lsR, 0.3)) return null;
  const sL = iso(lsL);
  const sR = iso(lsR);
  const sw = Math.hypot(sR.x - sL.x, sR.y - sL.y);
  if (sw < 0.02) return null;

  const dir: V = { x: (sR.x - sL.x) / sw, y: (sR.y - sL.y) / sw };
  // Perpendicular to the shoulder line, pointing down the body.
  let down: V = { x: -dir.y, y: dir.x };
  if (down.y < 0) down = { x: -down.x, y: -down.y };

  const hL = lm[I.LEFT_HIP];
  const hR = lm[I.RIGHT_HIP];
  let hipL: V;
  let hipR: V;
  if (ok(hL, 0.4) && ok(hR, 0.4)) {
    hipL = iso(hL);
    hipR = iso(hR);
  } else {
    // Hips out of frame: a torso is about 1.6 shoulder widths long.
    hipL = { x: sL.x + down.x * sw * 1.6, y: sL.y + down.y * sw * 1.6 };
    hipR = { x: sR.x + down.x * sw * 1.6, y: sR.y + down.y * sw * 1.6 };
  }
  const hipMid: V = { x: (hipL.x + hipR.x) / 2, y: (hipL.y + hipR.y) / 2 };
  const shMid: V = { x: (sL.x + sR.x) / 2, y: (sL.y + sR.y) / 2 };
  const torsoLen = Math.max(sw, Math.hypot(hipMid.x - shMid.x, hipMid.y - shMid.y));

  const out = (p: V, s: number, t: number): V => ({ x: p.x + dir.x * s + down.x * t, y: p.y + dir.y * s + down.y * t });
  const torso: [V, V, V, V] = [
    out(sL, -sw * 0.2, -sw * 0.18), // a collar and a hood sit above the shoulder line
    out(sR, sw * 0.2, -sw * 0.18),
    // Stop a little past the new hem, so trousers are never recoloured.
    out(hipR, sw * 0.14, torsoLen * (hemExtend + 0.04)),
    out(hipL, -sw * 0.14, torsoLen * (hemExtend + 0.04)),
  ];

  const arms: Zones['arms'] = [];
  const addArm = (sh: Landmark, el: Landmark, wr: Landmark) => {
    if (ok(sh, 0.3) && ok(el, 0.3)) arms.push({ a: iso(sh), b: iso(el), r: sw * 0.3 });
    if (ok(el, 0.3) && ok(wr, 0.3)) arms.push({ a: iso(el), b: iso(wr), r: sw * 0.26 });
  };
  addArm(lm[I.LEFT_SHOULDER], lm[I.LEFT_ELBOW], lm[I.LEFT_WRIST]);
  addArm(lm[I.RIGHT_SHOULDER], lm[I.RIGHT_ELBOW], lm[I.RIGHT_WRIST]);
  return { torso, arms };
}

// ---------------------------------------------------------------------------
// The eraser
// ---------------------------------------------------------------------------

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Bilinear sample of a w*h float grid at normalised (u, v). */
function sample(grid: Float32Array, w: number, h: number, u: number, v: number): number {
  const x = Math.min(w - 1, Math.max(0, u * w - 0.5));
  const y = Math.min(h - 1, Math.max(0, v * h - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = grid[y0 * w + x0] * (1 - fx) + grid[y0 * w + x1] * fx;
  const bot = grid[y1 * w + x0] * (1 - fx) + grid[y1 * w + x1] * fx;
  return top * (1 - fy) + bot * fy;
}

/**
 * Recolours the old clothes. Returns null when there is nothing sensible to do (no shoulders, no
 * clothes found in the body zone), in which case the original photo should be used as is.
 */
export function eraseClothes(input: EraseInput, options: EraseOptions = {}): EraseResult | null {
  const { image, segmentation: seg, landmarks, garmentColor } = input;
  const keep = Math.min(1, Math.max(0, options.keepShading ?? 0.6));
  const minCoverage = options.minCoverage ?? 0.004;
  const W = image.width;
  const H = image.height;
  const sw = seg.width;
  const sh = seg.height;
  if (!W || !H || !sw || !sh) return null;

  const zones = buildZones(landmarks, W / H, input.hemExtend);
  if (!zones) return null;

  // 1) Mask and zone type at segmentation resolution. mask: 1 where old clothes are in the body
  //    zone. torso: 1 where that is the torso (garment colour), 0 on arms (skin or sleeve colour).
  const mask = new Float32Array(sw * sh);
  const torso = new Float32Array(sw * sh);
  const aspect = W / H;
  let any = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x;
      if (seg.data[i] !== SegmentationClass.Clothes) continue;
      const p: V = { x: ((x + 0.5) / sw) * aspect, y: (y + 0.5) / sh };
      const inTorso = inQuad(p, zones.torso);
      let inArm = false;
      if (!inTorso) {
        for (const arm of zones.arms) {
          if (distToSegment(p, arm.a, arm.b) <= arm.r) { inArm = true; break; }
        }
      }
      if (!inTorso && !inArm) continue;
      mask[i] = 1;
      torso[i] = inTorso ? 1 : 0;
      any++;
    }
  }
  if (any / (sw * sh) < minCoverage) return null;
  // The class map is blocky. Smooth the mask and the zone map so the recoloured edge is a clean curve.
  blur3(mask, sw, sh, 2);
  blur3(torso, sw, sh, 2);

  // 2) The colours to paint.
  const skin = skinColor(image, seg);
  const armColor: Rgb = input.longSleeves || !skin ? garmentColor : skin;

  // 3) Broad shading of the old clothes on a coarse grid (masked average, then blurred), so folds
  //    and shadows survive but the pattern does not.
  const cell = Math.max(4, Math.round(Math.max(W, H) / 120));
  const gw = Math.max(1, Math.ceil(W / cell));
  const gh = Math.max(1, Math.ceil(H / cell));
  const lumSum = new Float32Array(gw * gh);
  const lumCnt = new Float32Array(gw * gh);
  let totalLum = 0;
  let totalCnt = 0;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      // One sample per cell centre is enough for a shading estimate.
      const px = Math.min(W - 1, gx * cell + (cell >> 1));
      const py = Math.min(H - 1, gy * cell + (cell >> 1));
      const m = sample(mask, sw, sh, (px + 0.5) / W, (py + 0.5) / H);
      if (m < 0.5) continue;
      const q = (py * W + px) * 4;
      const l = 0.299 * image.data[q] + 0.587 * image.data[q + 1] + 0.114 * image.data[q + 2];
      lumSum[gy * gw + gx] = l;
      lumCnt[gy * gw + gx] = 1;
      totalLum += l;
      totalCnt++;
    }
  }
  const meanLum = totalCnt > 0 ? totalLum / totalCnt : 128;
  const ratio = blurRatio(lumSum, lumCnt, gw, gh, meanLum, 2);

  // 4) Paint, only inside the bounding box of the mask (one grid cell of margin for the bilinear taps).
  let minX = sw, maxX = -1, minY = sh, maxY = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (mask[y * sw + x] <= 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const x0 = Math.max(0, Math.floor(((minX - 1) / sw) * W));
  const x1 = Math.min(W - 1, Math.ceil(((maxX + 2) / sw) * W));
  const y0 = Math.max(0, Math.floor(((minY - 1) / sh) * H));
  const y1 = Math.min(H - 1, Math.ceil(((maxY + 2) / sh) * H));

  const out = new Uint8ClampedArray(image.data);
  let painted = 0;
  for (let y = y0; y <= y1; y++) {
    const v = (y + 0.5) / H;
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5) / W;
      const m = sample(mask, sw, sh, u, v);
      if (m < 0.12) continue;
      // Biased a little outward: the class map is coarse and the old fabric must not show at its rim.
      const a = smoothstep(0.12, 0.45, m);
      const t = Math.min(1, sample(torso, sw, sh, u, v) / Math.max(m, 1e-3));
      const rr = sample(ratio, gw, gh, u, v);
      const shade = 1 + (rr - 1) * keep;
      const i = (y * W + x) * 4;
      const cr = (garmentColor.r * t + armColor.r * (1 - t)) * shade;
      const cg = (garmentColor.g * t + armColor.g * (1 - t)) * shade;
      const cb = (garmentColor.b * t + armColor.b * (1 - t)) * shade;
      out[i] = image.data[i] * (1 - a) + cr * a;
      out[i + 1] = image.data[i + 1] * (1 - a) + cg * a;
      out[i + 2] = image.data[i + 2] * (1 - a) + cb * a;
      if (a > 0.5) painted++;
    }
  }

  return { image: { data: out, width: W, height: H }, coverage: painted / (W * H) };
}

/** Local luminance / mean luminance on the grid, filled and blurred over the masked cells only. */
function blurRatio(
  lum: Float32Array,
  cnt: Float32Array,
  gw: number,
  gh: number,
  mean: number,
  radius: number,
): Float32Array {
  const out = new Float32Array(gw * gh);
  const safeMean = Math.max(24, mean);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let s = 0;
      let c = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= gw) continue;
          s += lum[yy * gw + xx];
          c += cnt[yy * gw + xx];
        }
      }
      const l = c > 0 ? s / c : mean;
      out[y * gw + x] = Math.min(1.35, Math.max(0.65, l / safeMean));
    }
  }
  return out;
}

/** In-place binomial 3x3 blur, `passes` times (a cheap Gaussian). */
function blur3(grid: Float32Array, w: number, h: number, passes: number): void {
  const tmp = new Float32Array(grid.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = grid[y * w + Math.max(0, x - 1)];
        const c = grid[y * w + x];
        const r = grid[y * w + Math.min(w - 1, x + 1)];
        tmp[y * w + x] = l * 0.25 + c * 0.5 + r * 0.25;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = tmp[Math.max(0, y - 1) * w + x];
        const c = tmp[y * w + x];
        const d = tmp[Math.min(h - 1, y + 1) * w + x];
        grid[y * w + x] = u * 0.25 + c * 0.5 + d * 0.25;
      }
    }
  }
}
