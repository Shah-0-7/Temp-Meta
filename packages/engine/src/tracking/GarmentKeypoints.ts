/**
 * @module tracking/GarmentKeypoints
 *
 * Derives control points that pin a garment image to the body.
 * Each control point maps a position on the garment (srcU, srcV in [0,1] image space)
 * to a position on screen (dstU, dstV in [0,1] canvas space).
 *
 * Conventions (important, and the source of the old left/right bug):
 *   - "left"/"right" in control-point keys mean SCREEN left/right, matching the
 *     garment image's left/right (a product photo is not flipped).
 *   - When the preview is mirrored, the person's LEFT body side appears on screen-left,
 *     so screen-left <- landmark LEFT_*. When not mirrored it is swapped.
 *
 * Tops/outerwear are fitted from garment anchors measured on the silhouette
 * (garment/anchors.ts) so different cuts (boxy, slim, long sleeve) fit correctly:
 *   - torso pinned at shoulders, armpits and hem
 *   - hem extended below the hip joints, and as wide as the shirt, not as the pelvis
 *   - sleeves follow the arm (shoulder -> elbow -> wrist) at the garment's own length
 *   - missing hips (cropped by the frame) are extrapolated from the shoulders
 */

import type { Landmark } from './types.js';
import { PoseIndex } from './types.js';
import { DEFAULT_TOP_ANCHORS, type GarmentAnchors } from '../garment/anchors.js';

export interface ControlPoint {
  /** Stable identifier, used to smooth each point over time. */
  key: string;
  /** Source UV in garment image space [0, 1] */
  srcU: number;
  srcV: number;
  /** Destination UV in screen space [0, 1] */
  dstU: number;
  dstV: number;
  /** Confidence weight [0, 1] */
  weight: number;
}

export type GarmentType = 'top' | 'outerwear' | 'bottom' | 'dress' | 'hat' | 'shoes';

/** Canonical garment UV positions for non-top garments (front-facing flat-lay). */
export const GARMENT_UV: Record<GarmentType, Record<string, [number, number]>> = {
  top: {
    leftShoulder:  [0.23, 0.10],
    rightShoulder: [0.77, 0.10],
    leftArmpit:    [0.26, 0.30],
    rightArmpit:   [0.74, 0.30],
    leftHip:       [0.26, 0.95],
    rightHip:      [0.74, 0.95],
    neckCenter:    [0.50, 0.06],
  },
  outerwear: {
    leftShoulder:  [0.22, 0.08],
    rightShoulder: [0.78, 0.08],
    leftArmpit:    [0.25, 0.28],
    rightArmpit:   [0.75, 0.28],
    leftHip:       [0.25, 0.95],
    rightHip:      [0.75, 0.95],
    neckCenter:    [0.50, 0.05],
  },
  bottom: {
    leftHip:    [0.25, 0.05],
    rightHip:   [0.75, 0.05],
    leftKnee:   [0.30, 0.50],
    rightKnee:  [0.70, 0.50],
    leftAnkle:  [0.28, 0.95],
    rightAnkle: [0.72, 0.95],
  },
  dress: {
    leftShoulder:  [0.25, 0.05],
    rightShoulder: [0.75, 0.05],
    leftHip:       [0.20, 0.55],
    rightHip:      [0.80, 0.55],
    leftKnee:      [0.25, 0.85],
    rightKnee:     [0.75, 0.85],
    neckCenter:    [0.50, 0.03],
  },
  hat: {
    headCenter: [0.50, 0.50],
    leftBrim:   [0.10, 0.70],
    rightBrim:  [0.90, 0.70],
  },
  shoes: {
    leftHeel:  [0.25, 0.85],
    rightHeel: [0.75, 0.85],
    leftToe:   [0.20, 0.05],
    rightToe:  [0.80, 0.05],
  },
};

export interface DeriveOptions {
  /** Camera preview mirrored? Default true. */
  mirror?: boolean;
  /** videoWidth / videoHeight. Needed for correct rotation/scale. Default 16/9. */
  aspect?: number;
  /** Garment image width / height (of the cut-out). Default 0.8. */
  garmentAspect?: number;
  /** Anchors measured from the garment silhouette. Defaults used if omitted. */
  anchors?: GarmentAnchors | null;
  /** Hem distance below the hip joints, as a fraction of torso length. Default 0.12 (0.2 outerwear). */
  hemExtend?: number;
  /** How far the garment's shoulder seam sits outside the shoulder joint, fraction of shoulder width per side. Default 0.05. */
  shoulderExpand?: number;
}

// ---- tiny 2D vector helpers (isotropic space) -------------------------------

interface V { x: number; y: number }
const vsub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const vadd = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const vmul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
const vlen = (a: V): number => Math.hypot(a.x, a.y);
const vnorm = (a: V): V => {
  const l = vlen(a);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
};
const vlerp = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Point at arc length `dist` along a polyline; extends past the last segment if needed. */
export function pointAlongPath(path: readonly V[], dist: number): V {
  let remaining = Math.max(0, dist);
  for (let i = 0; i < path.length - 1; i++) {
    const seg = vsub(path[i + 1], path[i]);
    const len = vlen(seg);
    if (remaining <= len || i === path.length - 2) {
      return vadd(path[i], vmul(vnorm(seg), remaining));
    }
    remaining -= len;
  }
  return path[0];
}

/**
 * Derive control points mapping garment UV -> screen UV from pose landmarks.
 * `mirrorOrOptions` accepts the legacy boolean for backwards compatibility.
 */
export function deriveControlPoints(
  landmarks: readonly Landmark[],
  garmentType: GarmentType,
  mirrorOrOptions: boolean | DeriveOptions = true,
): ControlPoint[] {
  const opts: DeriveOptions =
    typeof mirrorOrOptions === 'boolean' ? { mirror: mirrorOrOptions } : mirrorOrOptions;
  const mirror = opts.mirror ?? true;
  const aspect = opts.aspect ?? 16 / 9;

  if (landmarks.length < 33) return [];

  switch (garmentType) {
    case 'top':
    case 'outerwear':
      return deriveTop(landmarks, garmentType, mirror, aspect, opts);
    default:
      return deriveSimple(landmarks, garmentType, mirror);
  }
}

// ---------------------------------------------------------------------------
// Tops and outerwear
// ---------------------------------------------------------------------------

function deriveTop(
  lm: readonly Landmark[],
  type: 'top' | 'outerwear',
  mirror: boolean,
  aspect: number,
  opts: DeriveOptions,
): ControlPoint[] {
  const I = PoseIndex;
  const A = opts.anchors ?? DEFAULT_TOP_ANCHORS;
  const gAspect = opts.garmentAspect ?? 0.8;
  const expand = opts.shoulderExpand ?? (type === 'outerwear' ? 0.08 : 0.05);
  const hemExtend = opts.hemExtend ?? (type === 'outerwear' ? 0.2 : 0.12);

  // Landmark for a SCREEN side.
  const pick = (leftIdx: number, rightIdx: number, side: 'L' | 'R'): Landmark => {
    const personLeftIsScreenLeft = mirror;
    const useLeft = (side === 'L') === personLeftIsScreenLeft;
    return lm[useLeft ? leftIdx : rightIdx];
  };
  const iso = (l: Landmark): V => ({ x: (mirror ? 1 - l.x : l.x) * aspect, y: l.y });

  const shL = pick(I.LEFT_SHOULDER, I.RIGHT_SHOULDER, 'L');
  const shR = pick(I.LEFT_SHOULDER, I.RIGHT_SHOULDER, 'R');
  if (shL.visibility < 0.3 || shR.visibility < 0.3) return [];

  const sL = iso(shL);
  const sR = iso(shR);
  const sVec = vsub(sR, sL);
  const sw = vlen(sVec);
  if (sw < 0.02) return [];
  const sDir = vnorm(sVec);

  const sLe = vsub(sL, vmul(sDir, sw * expand));
  const sRe = vadd(sR, vmul(sDir, sw * expand));
  const swE = sw * (1 + 2 * expand);
  const shoulderMid = vlerp(sLe, sRe, 0.5);

  // --- Hips (measured, or extrapolated when out of frame) -------------------
  const hpL = pick(I.LEFT_HIP, I.RIGHT_HIP, 'L');
  const hpR = pick(I.LEFT_HIP, I.RIGHT_HIP, 'R');
  const hipVis = Math.min(hpL.visibility, hpR.visibility);
  const hipsOk = hipVis >= 0.4;

  const downDir: V = { x: -sDir.y, y: sDir.x }; // perpendicular to the shoulder line, pointing down
  let hipMid: V;
  let lateral: V;
  if (hipsOk) {
    const hL = iso(hpL);
    const hR = iso(hpR);
    hipMid = vlerp(hL, hR, 0.5);
    lateral = vnorm(vadd(vmul(sDir, 0.5), vmul(vnorm(vsub(hR, hL)), 0.5)));
  } else {
    hipMid = vadd(shoulderMid, vmul(downDir, sw * 1.25));
    lateral = sDir;
  }
  const hemWeight = hipsOk ? hipVis : 0.5;

  const torsoVec = vsub(hipMid, shoulderMid);
  const torsoLen = Math.max(1e-4, vlen(torsoVec));
  const torsoDir = vmul(torsoVec, 1 / torsoLen);

  const hemCenter = vadd(hipMid, vmul(torsoDir, torsoLen * hemExtend));
  const gShoulderW = Math.max(1e-3, (A.shoulderR[0] - A.shoulderL[0]) * gAspect);
  const gHemW = (A.hemR[0] - A.hemL[0]) * gAspect;
  const hemHalf = (swE * 0.5) * Math.min(1.25, Math.max(0.7, gHemW / gShoulderW));
  const hemL = vsub(hemCenter, vmul(lateral, hemHalf));
  const hemR = vadd(hemCenter, vmul(lateral, hemHalf));

  const gTorso = Math.max(1e-3, A.hemL[1] - A.shoulderL[1]);
  const armpitFrac = Math.min(0.5, Math.max(0.1, (A.armpitL[1] - A.shoulderL[1]) / gTorso));
  const armpitL = vlerp(sLe, hemL, armpitFrac);
  const armpitR = vlerp(sRe, hemR, armpitFrac);

  const neckDst = vsub(shoulderMid, vmul(torsoDir, sw * 0.1));

  const out: ControlPoint[] = [];
  const push = (key: string, src: [number, number], dst: V, weight: number) => {
    out.push({
      key,
      srcU: src[0],
      srcV: src[1],
      dstU: dst.x / aspect,
      dstV: dst.y,
      weight: Math.max(0, Math.min(1, weight)),
    });
  };

  const shVis = Math.min(shL.visibility, shR.visibility);
  push('shoulderL', A.shoulderL, sLe, shL.visibility);
  push('shoulderR', A.shoulderR, sRe, shR.visibility);
  push('neck', A.neck, neckDst, shVis * 0.8);
  push('armpitL', A.armpitL, armpitL, Math.min(shL.visibility, hemWeight));
  push('armpitR', A.armpitR, armpitR, Math.min(shR.visibility, hemWeight));
  push('hemL', A.hemL, hemL, hemWeight);
  push('hemR', A.hemR, hemR, hemWeight);

  // --- Sleeves follow the arms ----------------------------------------------
  const gShoulderIso = (side: 'L' | 'R'): V => {
    const s = side === 'L' ? A.shoulderL : A.shoulderR;
    return { x: s[0] * gAspect, y: s[1] };
  };
  const scale = Math.sqrt((swE / gShoulderW) * (torsoLen * (1 + hemExtend)) / gTorso);

  for (const side of ['L', 'R'] as const) {
    const end = side === 'L' ? A.sleeveEndL : A.sleeveEndR;
    if (!end) continue;
    const elbowLm = pick(I.LEFT_ELBOW, I.RIGHT_ELBOW, side);
    const wristLm = pick(I.LEFT_WRIST, I.RIGHT_WRIST, side);
    const shLm = side === 'L' ? shL : shR;
    if (elbowLm.visibility < 0.4) continue;

    const gTip = gShoulderIso(side);
    const gEnd: V = { x: end[0] * gAspect, y: end[1] };
    const sleeveLen = vlen(vsub(gEnd, gTip)) * scale * 0.92;

    const origin = side === 'L' ? sLe : sRe;
    const path: V[] = [origin, iso(elbowLm)];
    if (wristLm.visibility >= 0.3) path.push(iso(wristLm));
    const dst = pointAlongPath(path, sleeveLen);
    push(side === 'L' ? 'sleeveL' : 'sleeveR', end, dst, Math.min(shLm.visibility, elbowLm.visibility) * 0.85);
  }

  return out.filter((p) => p.weight > 0.25);
}

// ---------------------------------------------------------------------------
// Other garment types (not yet exposed in the UI): simple landmark pins
// ---------------------------------------------------------------------------

function deriveSimple(
  lm: readonly Landmark[],
  type: GarmentType,
  mirror: boolean,
): ControlPoint[] {
  const I = PoseIndex;
  const uv = GARMENT_UV[type] ?? GARMENT_UV.top;
  const pts: ControlPoint[] = [];

  const pick = (leftIdx: number, rightIdx: number, side: 'L' | 'R'): Landmark =>
    lm[(side === 'L') === mirror ? leftIdx : rightIdx];

  const add = (key: string, srcKey: string, l: Landmark) => {
    const src = uv[srcKey];
    if (!src) return;
    pts.push({
      key,
      srcU: src[0],
      srcV: src[1],
      dstU: mirror ? 1 - l.x : l.x,
      dstV: l.y,
      weight: l.visibility,
    });
  };

  switch (type) {
    case 'bottom':
      add('hipL', 'leftHip', pick(I.LEFT_HIP, I.RIGHT_HIP, 'L'));
      add('hipR', 'rightHip', pick(I.LEFT_HIP, I.RIGHT_HIP, 'R'));
      add('kneeL', 'leftKnee', pick(I.LEFT_KNEE, I.RIGHT_KNEE, 'L'));
      add('kneeR', 'rightKnee', pick(I.LEFT_KNEE, I.RIGHT_KNEE, 'R'));
      add('ankleL', 'leftAnkle', pick(I.LEFT_ANKLE, I.RIGHT_ANKLE, 'L'));
      add('ankleR', 'rightAnkle', pick(I.LEFT_ANKLE, I.RIGHT_ANKLE, 'R'));
      break;
    case 'dress': {
      add('shoulderL', 'leftShoulder', pick(I.LEFT_SHOULDER, I.RIGHT_SHOULDER, 'L'));
      add('shoulderR', 'rightShoulder', pick(I.LEFT_SHOULDER, I.RIGHT_SHOULDER, 'R'));
      add('hipL', 'leftHip', pick(I.LEFT_HIP, I.RIGHT_HIP, 'L'));
      add('hipR', 'rightHip', pick(I.LEFT_HIP, I.RIGHT_HIP, 'R'));
      add('kneeL', 'leftKnee', pick(I.LEFT_KNEE, I.RIGHT_KNEE, 'L'));
      add('kneeR', 'rightKnee', pick(I.LEFT_KNEE, I.RIGHT_KNEE, 'R'));
      const l = lm[I.LEFT_SHOULDER];
      const r = lm[I.RIGHT_SHOULDER];
      add('neck', 'neckCenter', {
        x: (l.x + r.x) / 2,
        y: Math.min(l.y, r.y) - 0.04,
        z: 0,
        visibility: Math.min(l.visibility, r.visibility),
      });
      break;
    }
    case 'hat': {
      const nose = lm[I.NOSE];
      add('head', 'headCenter', { ...nose, y: nose.y - 0.12, z: 0 });
      const le = pick(I.LEFT_EAR, I.RIGHT_EAR, 'L');
      const re = pick(I.LEFT_EAR, I.RIGHT_EAR, 'R');
      add('brimL', 'leftBrim', { ...le, x: le.x + (mirror ? 0.04 : -0.04) });
      add('brimR', 'rightBrim', { ...re, x: re.x + (mirror ? -0.04 : 0.04) });
      break;
    }
    case 'shoes':
      add('heelL', 'leftHeel', pick(I.LEFT_HEEL, I.RIGHT_HEEL, 'L'));
      add('heelR', 'rightHeel', pick(I.LEFT_HEEL, I.RIGHT_HEEL, 'R'));
      add('toeL', 'leftToe', pick(I.LEFT_FOOT_INDEX, I.RIGHT_FOOT_INDEX, 'L'));
      add('toeR', 'rightToe', pick(I.LEFT_FOOT_INDEX, I.RIGHT_FOOT_INDEX, 'R'));
      break;
    default:
      break;
  }

  return pts.filter((p) => p.weight > 0.3);
}
