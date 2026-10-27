/**
 * @module tracking/occlusion
 *
 * Builds the mask of body parts that must stay in FRONT of a try-on garment:
 *   - face and hair  (a collar / hood must never cover the face)
 *   - hands          (a hand held in front of the torso must not vanish under the shirt)
 *
 * Input is the selfie_multiclass segmentation (256x256, classes in SegmentationClass)
 * plus the pose landmarks, which tell us WHERE the hands are. Bare arms are
 * deliberately NOT included: a sleeve is supposed to cover the upper arm.
 *
 * Pure function over typed arrays: unit-testable without a browser.
 */

import type { Landmark, OcclusionMask, SegmentationMask } from './types.js';
import { PoseIndex, SegmentationClass } from './types.js';

export interface OcclusionOptions {
  /** videoWidth / videoHeight, so distances are isotropic. Default 16/9. */
  aspect?: number;
  /** Hand radius as a fraction of forearm length. Default 0.32. */
  handRadius?: number;
  /** How far from the wrist toward the elbow the "hand" capsule reaches (0..1 of forearm). Default 0.35. */
  forearmReach?: number;
  /** Reuse this buffer when sizes match (avoids a 64 KB allocation per tick). */
  out?: OcclusionMask;
}

interface Capsule {
  ax: number; ay: number; // isotropic units (x already multiplied by aspect)
  bx: number; by: number;
  r: number;
}

function visible(l: Landmark | undefined, min: number): l is Landmark {
  return !!l && l.visibility >= min;
}

/** Capsule (segment + radius) that covers the hand and the start of the forearm. */
function handCapsule(
  lm: readonly Landmark[],
  side: 'left' | 'right',
  aspect: number,
  radiusFrac: number,
  reach: number,
): Capsule | null {
  const I = PoseIndex;
  const wrist = lm[side === 'left' ? I.LEFT_WRIST : I.RIGHT_WRIST];
  const elbow = lm[side === 'left' ? I.LEFT_ELBOW : I.RIGHT_ELBOW];
  if (!visible(wrist, 0.4)) return null;

  const tipIdx =
    side === 'left'
      ? [I.LEFT_INDEX, I.LEFT_PINKY, I.LEFT_THUMB]
      : [I.RIGHT_INDEX, I.RIGHT_PINKY, I.RIGHT_THUMB];
  let tx = 0, ty = 0, tc = 0;
  for (const i of tipIdx) {
    if (visible(lm[i], 0.3)) {
      tx += lm[i].x; ty += lm[i].y; tc++;
    }
  }
  const tip = tc > 0 ? { x: tx / tc, y: ty / tc } : { x: wrist.x, y: wrist.y };

  // Forearm length in isotropic units; fall back to a typical value if the elbow is unseen.
  let forearm = 0.16;
  let bx = wrist.x;
  let by = wrist.y;
  if (visible(elbow, 0.3)) {
    forearm = Math.max(0.06, Math.hypot((elbow.x - wrist.x) * aspect, elbow.y - wrist.y));
    bx = wrist.x + (elbow.x - wrist.x) * reach;
    by = wrist.y + (elbow.y - wrist.y) * reach;
  }

  return {
    ax: tip.x * aspect,
    ay: tip.y,
    bx: bx * aspect,
    by,
    r: Math.max(0.03, forearm * radiusFrac),
  };
}

function distSqToSegment(px: number, py: number, c: Capsule): number {
  const abx = c.bx - c.ax;
  const aby = c.by - c.ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 1e-12 ? ((px - c.ax) * abx + (py - c.ay) * aby) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (c.ax + abx * t);
  const dy = py - (c.ay + aby * t);
  return dx * dx + dy * dy;
}

export function buildOcclusionMask(
  seg: SegmentationMask,
  landmarks: readonly Landmark[] | null,
  options: OcclusionOptions = {},
): OcclusionMask {
  const { width: w, height: h } = seg;
  const aspect = options.aspect ?? 16 / 9;
  const radiusFrac = options.handRadius ?? 0.32;
  const reach = options.forearmReach ?? 0.35;

  const out: OcclusionMask =
    options.out && options.out.width === w && options.out.height === h
      ? options.out
      : { data: new Uint8Array(w * h), width: w, height: h };
  const data = out.data;
  data.fill(0);

  // 1) Face + hair: always in front of the garment.
  const src = seg.data;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const c = src[i];
    if (c === SegmentationClass.FaceSkin || c === SegmentationClass.Hair) data[i] = 255;
  }

  // 2) Hands: body-skin pixels inside a capsule around each hand.
  if (landmarks && landmarks.length >= 23) {
    const capsules = [
      handCapsule(landmarks, 'left', aspect, radiusFrac, reach),
      handCapsule(landmarks, 'right', aspect, radiusFrac, reach),
    ];
    for (const cap of capsules) {
      if (!cap) continue;
      // Pixel-space bounding box of the capsule.
      const minX = Math.min(cap.ax, cap.bx) - cap.r;
      const maxX = Math.max(cap.ax, cap.bx) + cap.r;
      const minY = Math.min(cap.ay, cap.by) - cap.r;
      const maxY = Math.max(cap.ay, cap.by) + cap.r;
      const x0 = Math.max(0, Math.floor((minX / aspect) * w));
      const x1 = Math.min(w - 1, Math.ceil((maxX / aspect) * w));
      const y0 = Math.max(0, Math.floor(minY * h));
      const y1 = Math.min(h - 1, Math.ceil(maxY * h));
      const r2 = cap.r * cap.r;

      for (let y = y0; y <= y1; y++) {
        const ny = (y + 0.5) / h;
        for (let x = x0; x <= x1; x++) {
          const idx = y * w + x;
          if (src[idx] !== SegmentationClass.BodySkin) continue;
          const nx = ((x + 0.5) / w) * aspect;
          if (distSqToSegment(nx, ny, cap) <= r2) data[idx] = 255;
        }
      }
    }
  }

  return out;
}
