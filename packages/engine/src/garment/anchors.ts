/**
 * @module garment/anchors
 *
 * Finds the landmarks of a garment (shoulder tips, armpits, hem corners, neck,
 * sleeve ends) from its cut-out silhouette, so the warp can pin THIS garment
 * to the body instead of assuming every top has the same proportions.
 *
 * Works on a flat-lay / mannequin front view with a clean alpha mask. When the
 * silhouette is not understood it falls back to sane defaults (confidence 0).
 */

import { maskBounds } from './cutout.js';

type UV = [number, number];

export interface GarmentAnchors {
  shoulderL: UV;
  shoulderR: UV;
  armpitL: UV;
  armpitR: UV;
  hemL: UV;
  hemR: UV;
  neck: UV;
  /** Outer tip of the sleeve; null for sleeveless garments / unknown. */
  sleeveEndL: UV | null;
  sleeveEndR: UV | null;
  /** 0 = defaults were used, up to ~0.8 when measured from the silhouette. */
  confidence: number;
}

/** Proportions of a typical short-sleeve tee photographed flat with a tight crop. */
export const DEFAULT_TOP_ANCHORS: GarmentAnchors = {
  shoulderL: [0.23, 0.1],
  shoulderR: [0.77, 0.1],
  armpitL: [0.26, 0.3],
  armpitR: [0.74, 0.3],
  hemL: [0.26, 0.95],
  hemR: [0.74, 0.95],
  neck: [0.5, 0.06],
  sleeveEndL: [0.06, 0.3],
  sleeveEndR: [0.94, 0.3],
  confidence: 0,
};

export function defaultAnchors(): GarmentAnchors {
  return JSON.parse(JSON.stringify(DEFAULT_TOP_ANCHORS)) as GarmentAnchors;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * @param alpha  0..255 per pixel (garment opacity), row-major, length w*h.
 */
export function analyzeGarment(alpha: ArrayLike<number>, w: number, h: number): GarmentAnchors {
  const fallback = defaultAnchors();
  const box = maskBounds(alpha, w, h, 128);
  if (!box) return fallback;

  const bw = box.x2 - box.x1;
  const bh = box.y2 - box.y1;
  if (bw < 16 || bh < 16) return fallback;

  const on = (x: number, y: number) => alpha[y * w + x] >= 128;
  const cx = Math.round((box.x1 + box.x2) / 2);

  // --- Torso edges from the lower body rows (below sleeves) -----------------
  const lefts: number[] = [];
  const rights: number[] = [];
  for (let y = Math.round(box.y1 + bh * 0.55); y <= Math.round(box.y1 + bh * 0.85); y += 2) {
    // Find the run containing (or nearest to) the centre column.
    let x = cx;
    if (!on(x, y)) {
      let found = -1;
      for (let d = 1; d < bw / 2; d++) {
        if (x - d >= box.x1 && on(x - d, y)) { found = x - d; break; }
        if (x + d < box.x2 && on(x + d, y)) { found = x + d; break; }
      }
      if (found < 0) continue;
      x = found;
    }
    let l = x;
    while (l - 1 >= box.x1 && on(l - 1, y)) l--;
    let r = x;
    while (r + 1 < box.x2 && on(r + 1, y)) r++;
    lefts.push(l);
    rights.push(r + 1);
  }
  if (lefts.length < 4) return fallback;

  const torsoL = median(lefts);
  const torsoR = median(rights);
  const torsoW = torsoR - torsoL;
  // Too narrow to be a torso. A torso as wide as the whole silhouette is fine: that is a
  // sleeveless top, or sleeves hanging against the body (no sleeve pins are produced).
  if (torsoW < bw * 0.25) return fallback;

  const topY = (x: number): number => {
    for (let y = box.y1; y < box.y2; y++) if (on(Math.min(w - 1, Math.max(0, x)), y)) return y;
    return box.y2;
  };

  // --- Shoulder line + neck -------------------------------------------------
  let shoulderYL = box.y2;
  let shoulderYR = box.y2;
  const band = Math.round(bw * 0.06);
  for (let d = -band; d <= band; d++) {
    shoulderYL = Math.min(shoulderYL, topY(torsoL + d));
    shoulderYR = Math.min(shoulderYR, topY(torsoR + d));
  }
  const shoulderY = (shoulderYL + shoulderYR) / 2 + bh * 0.015;

  let neckY = box.y2;
  const nb = Math.round(bw * 0.08);
  for (let d = -nb; d <= nb; d++) neckY = Math.min(neckY, topY(cx + d));

  const hemY = box.y2 - bh * 0.02;
  const armpitY = shoulderY + (hemY - shoulderY) * 0.2;
  const tipInset = bw * 0.025;

  // --- Sleeve ends: centroid of the outermost sliver of the silhouette ------
  const sleeveEnd = (side: 'l' | 'r'): UV | null => {
    const torsoEdge = side === 'l' ? torsoL : torsoR;
    const protrusion = side === 'l' ? torsoEdge - box.x1 : box.x2 - torsoEdge;
    if (protrusion < bw * 0.06) return null; // sleeveless
    const x0 = side === 'l' ? box.x1 : box.x2 - Math.max(2, bw * 0.04);
    const x1 = side === 'l' ? box.x1 + Math.max(2, bw * 0.04) : box.x2;
    let sx = 0, sy = 0, sc = 0;
    for (let y = box.y1; y < box.y2; y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        if (on(x, y)) { sx += x; sy += y; sc++; }
      }
    }
    if (sc === 0) return null;
    return [sx / sc / w, sy / sc / h];
  };

  return {
    shoulderL: [(torsoL - tipInset) / w, shoulderY / h],
    shoulderR: [(torsoR + tipInset) / w, shoulderY / h],
    armpitL: [torsoL / w, armpitY / h],
    armpitR: [torsoR / w, armpitY / h],
    hemL: [torsoL / w, hemY / h],
    hemR: [torsoR / w, hemY / h],
    neck: [cx / w, neckY / h],
    sleeveEndL: sleeveEnd('l'),
    sleeveEndR: sleeveEnd('r'),
    confidence: 0.8,
  };
}
