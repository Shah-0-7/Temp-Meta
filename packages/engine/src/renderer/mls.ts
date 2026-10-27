/**
 * @module renderer/mls
 *
 * Moving Least Squares deformation with SIMILARITY transforms
 * (Schaefer, McPhail, Warren: "Image Deformation Using Moving Least Squares", 2006).
 *
 * Why this and not a Gaussian blend of control-point offsets (the previous warp):
 *   - It interpolates control points EXACTLY: a shoulder pin lands on the shoulder.
 *   - Between pins the garment moves rigidly (rotation + uniform scale), so
 *     prints and stripes are not sheared when you lean or rotate your shoulders.
 *   - Far from every pin it still extrapolates sensibly (the sleeve tips follow the
 *     overall body motion) instead of stalling at an averaged offset.
 *
 * All coordinates passed in MUST be in an isotropic space (same unit on both
 * axes), otherwise "rotation" turns into shear. Callers multiply x by the
 * image aspect ratio first.
 *
 * Pure math, no GL.
 */

export interface MlsPoint {
  /** Source position (garment space). */
  px: number;
  py: number;
  /** Destination position (screen space). */
  qx: number;
  qy: number;
  /** Importance 0..1 (e.g. landmark visibility). */
  w: number;
}

const EPS = 1e-10;

/**
 * Deform a single vertex.
 * @param alpha Weight falloff exponent: w = weight / |p - v|^(2 alpha). 1.0 is smooth/global, 2.0 is local.
 */
export function mlsSimilarity(
  points: readonly MlsPoint[],
  vx: number,
  vy: number,
  alpha = 1.2,
): [number, number] {
  const n = points.length;
  if (n === 0) return [vx, vy];

  // Weights; snap exactly onto a control point if the vertex sits on one.
  let sumW = 0;
  let pStarX = 0, pStarY = 0, qStarX = 0, qStarY = 0;
  const ws = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const dx = vx - p.px;
    const dy = vy - p.py;
    const d2 = dx * dx + dy * dy;
    if (d2 < EPS) return [p.qx, p.qy];
    const w = Math.max(p.w, 1e-3) / Math.pow(d2, alpha);
    ws[i] = w;
    sumW += w;
    pStarX += w * p.px;
    pStarY += w * p.py;
    qStarX += w * p.qx;
    qStarY += w * p.qy;
  }
  pStarX /= sumW; pStarY /= sumW;
  qStarX /= sumW; qStarY /= sumW;

  // Least-squares complex scale a = sum(w q^ conj(p^)) / sum(w |p^|^2)
  let re = 0, im = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const w = ws[i];
    const phx = p.px - pStarX;
    const phy = p.py - pStarY;
    const qhx = p.qx - qStarX;
    const qhy = p.qy - qStarY;
    re += w * (qhx * phx + qhy * phy);
    im += w * (qhy * phx - qhx * phy);
    den += w * (phx * phx + phy * phy);
  }

  const dx = vx - pStarX;
  const dy = vy - pStarY;

  if (den < EPS) {
    // Control points (almost) coincide: pure translation.
    return [qStarX + dx, qStarY + dy];
  }

  const ar = re / den;
  const ai = im / den;
  return [qStarX + ar * dx - ai * dy, qStarY + ar * dy + ai * dx];
}

/** Rigid-ish global fit (single similarity for all points). Used as a sanity reference in tests. */
export function fitSimilarity(
  points: readonly MlsPoint[],
): { scale: number; rotation: number; tx: number; ty: number } | null {
  if (points.length < 2) return null;
  let sw = 0, pcx = 0, pcy = 0, qcx = 0, qcy = 0;
  for (const p of points) {
    const w = Math.max(p.w, 1e-3);
    sw += w; pcx += w * p.px; pcy += w * p.py; qcx += w * p.qx; qcy += w * p.qy;
  }
  pcx /= sw; pcy /= sw; qcx /= sw; qcy /= sw;
  let re = 0, im = 0, den = 0;
  for (const p of points) {
    const w = Math.max(p.w, 1e-3);
    const phx = p.px - pcx, phy = p.py - pcy, qhx = p.qx - qcx, qhy = p.qy - qcy;
    re += w * (qhx * phx + qhy * phy);
    im += w * (qhy * phx - qhx * phy);
    den += w * (phx * phx + phy * phy);
  }
  if (den < EPS) return null;
  const ar = re / den, ai = im / den;
  return {
    scale: Math.hypot(ar, ai),
    rotation: Math.atan2(ai, ar),
    tx: qcx - (ar * pcx - ai * pcy),
    ty: qcy - (ar * pcy + ai * pcx),
  };
}
