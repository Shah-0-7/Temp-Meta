/**
 * @module tracking/GarmentKeypoints
 *
 * Derives garment-space control points from pose landmarks.
 * Maps MediaPipe pose landmarks to a normalized garment UV space
 * so the warp shader knows where to pin the garment.
 *
 * For a "top" garment the key control points are:
 *   - Left shoulder, Right shoulder (garment neckline/shoulders)
 *   - Left hip, Right hip (bottom hem)
 *   - Left elbow, Right elbow (sleeve ends)
 *
 * The output is a flat array of [srcX, srcY, dstX, dstY] quads
 * suitable for passing to the TPS warp shader as uniforms.
 */

import type { Landmark } from './types.js';
import { PoseIndex } from './types.js';

export interface ControlPoint {
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

/** Canonical garment UV positions for a front-facing flat-lay. */
export const GARMENT_UV: Record<GarmentType, Record<string, [number, number]>> = {
  top: {
    leftShoulder:  [0.25, 0.08],
    rightShoulder: [0.75, 0.08],
    leftArmpit:    [0.18, 0.25],
    rightArmpit:   [0.82, 0.25],
    leftElbow:     [0.10, 0.55],
    rightElbow:    [0.90, 0.55],
    leftHip:       [0.25, 0.90],
    rightHip:      [0.75, 0.90],
    neckCenter:    [0.50, 0.05],
    waistCenter:   [0.50, 0.88],
  },
  outerwear: {
    leftShoulder:  [0.22, 0.07],
    rightShoulder: [0.78, 0.07],
    leftArmpit:    [0.16, 0.22],
    rightArmpit:   [0.84, 0.22],
    leftElbow:     [0.08, 0.52],
    rightElbow:    [0.92, 0.52],
    leftHip:       [0.22, 0.88],
    rightHip:      [0.78, 0.88],
    neckCenter:    [0.50, 0.04],
    waistCenter:   [0.50, 0.88],
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

/**
 * Derive control points mapping garment UV → screen UV
 * based on the current pose landmarks.
 *
 * @param landmarks  33 MediaPipe pose landmarks (normalized [0,1])
 * @param garmentType  Type of garment being overlaid
 * @param mirror  Whether the camera is mirrored
 */
export function deriveControlPoints(
  landmarks: Landmark[],
  garmentType: GarmentType,
  mirror: boolean,
): ControlPoint[] {
  const uvMap = GARMENT_UV[garmentType] ?? GARMENT_UV.top;
  const points: ControlPoint[] = [];
  const lm = landmarks;

  const toUV = (l: Landmark): [number, number] => [
    mirror ? 1 - l.x : l.x,
    l.y,
  ];

  const add = (
    keyName: string,
    landmark: Landmark,
  ) => {
    const srcUV = uvMap[keyName];
    if (!srcUV) return;
    const [dstU, dstV] = toUV(landmark);
    points.push({
      srcU: srcUV[0],
      srcV: srcUV[1],
      dstU,
      dstV,
      weight: landmark.visibility,
    });
  };

  // Map landmarks to control points by garment type
  switch (garmentType) {
    case 'top':
    case 'outerwear': {
      add('leftShoulder',  lm[PoseIndex.LEFT_SHOULDER]);
      add('rightShoulder', lm[PoseIndex.RIGHT_SHOULDER]);
      add('leftElbow',     lm[PoseIndex.LEFT_ELBOW]);
      add('rightElbow',    lm[PoseIndex.RIGHT_ELBOW]);
      add('leftHip',       lm[PoseIndex.LEFT_HIP]);
      add('rightHip',      lm[PoseIndex.RIGHT_HIP]);

      // Armpit: midpoint between shoulder and hip, closer to shoulder
      const lArmpit: Landmark = {
        x: lerp(lm[PoseIndex.LEFT_SHOULDER].x,  lm[PoseIndex.LEFT_HIP].x,  0.3),
        y: lerp(lm[PoseIndex.LEFT_SHOULDER].y,  lm[PoseIndex.LEFT_HIP].y,  0.3),
        z: 0,
        visibility: Math.min(lm[PoseIndex.LEFT_SHOULDER].visibility, lm[PoseIndex.LEFT_HIP].visibility),
      };
      const rArmpit: Landmark = {
        x: lerp(lm[PoseIndex.RIGHT_SHOULDER].x, lm[PoseIndex.RIGHT_HIP].x, 0.3),
        y: lerp(lm[PoseIndex.RIGHT_SHOULDER].y, lm[PoseIndex.RIGHT_HIP].y, 0.3),
        z: 0,
        visibility: Math.min(lm[PoseIndex.RIGHT_SHOULDER].visibility, lm[PoseIndex.RIGHT_HIP].visibility),
      };
      add('leftArmpit',  lArmpit);
      add('rightArmpit', rArmpit);

      // Neck center: midpoint of ears or between shoulders
      const neckCenter: Landmark = {
        x: (lm[PoseIndex.LEFT_SHOULDER].x + lm[PoseIndex.RIGHT_SHOULDER].x) / 2,
        y: lm[PoseIndex.LEFT_SHOULDER].y - 0.05,
        z: 0,
        visibility: Math.min(lm[PoseIndex.LEFT_SHOULDER].visibility, lm[PoseIndex.RIGHT_SHOULDER].visibility),
      };
      add('neckCenter', neckCenter);

      // Waist center
      const waistCenter: Landmark = {
        x: (lm[PoseIndex.LEFT_HIP].x + lm[PoseIndex.RIGHT_HIP].x) / 2,
        y: (lm[PoseIndex.LEFT_HIP].y + lm[PoseIndex.RIGHT_HIP].y) / 2,
        z: 0,
        visibility: Math.min(lm[PoseIndex.LEFT_HIP].visibility, lm[PoseIndex.RIGHT_HIP].visibility),
      };
      add('waistCenter', waistCenter);
      break;
    }

    case 'bottom': {
      add('leftHip',    lm[PoseIndex.LEFT_HIP]);
      add('rightHip',   lm[PoseIndex.RIGHT_HIP]);
      add('leftKnee',   lm[PoseIndex.LEFT_KNEE]);
      add('rightKnee',  lm[PoseIndex.RIGHT_KNEE]);
      add('leftAnkle',  lm[PoseIndex.LEFT_ANKLE]);
      add('rightAnkle', lm[PoseIndex.RIGHT_ANKLE]);
      break;
    }

    case 'dress': {
      add('leftShoulder',  lm[PoseIndex.LEFT_SHOULDER]);
      add('rightShoulder', lm[PoseIndex.RIGHT_SHOULDER]);
      add('leftHip',       lm[PoseIndex.LEFT_HIP]);
      add('rightHip',      lm[PoseIndex.RIGHT_HIP]);
      add('leftKnee',      lm[PoseIndex.LEFT_KNEE]);
      add('rightKnee',     lm[PoseIndex.RIGHT_KNEE]);
      const neckCenter2: Landmark = {
        x: (lm[PoseIndex.LEFT_SHOULDER].x + lm[PoseIndex.RIGHT_SHOULDER].x) / 2,
        y: lm[PoseIndex.LEFT_SHOULDER].y - 0.04,
        z: 0,
        visibility: Math.min(lm[PoseIndex.LEFT_SHOULDER].visibility, lm[PoseIndex.RIGHT_SHOULDER].visibility),
      };
      add('neckCenter', neckCenter2);
      break;
    }

    case 'hat': {
      const headCenter: Landmark = {
        x: lm[PoseIndex.NOSE].x,
        y: lm[PoseIndex.NOSE].y - 0.12,
        z: 0,
        visibility: lm[PoseIndex.NOSE].visibility,
      };
      add('headCenter', headCenter);
      add('leftBrim',  { ...lm[PoseIndex.LEFT_EAR],  x: lm[PoseIndex.LEFT_EAR].x  - 0.04 });
      add('rightBrim', { ...lm[PoseIndex.RIGHT_EAR], x: lm[PoseIndex.RIGHT_EAR].x + 0.04 });
      break;
    }

    case 'shoes': {
      add('leftHeel',  lm[PoseIndex.LEFT_HEEL]);
      add('rightHeel', lm[PoseIndex.RIGHT_HEEL]);
      add('leftToe',   lm[PoseIndex.LEFT_FOOT_INDEX]);
      add('rightToe',  lm[PoseIndex.RIGHT_FOOT_INDEX]);
      break;
    }
  }

  // Only return high-confidence control points
  return points.filter((p) => p.weight > 0.3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
