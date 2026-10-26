/**
 * @module tracking/types
 *
 * Type definitions for the tracking pipeline.
 */

/** A single pose landmark with 3D position and visibility. */
export interface Landmark {
  x: number;   // Normalized [0, 1] — left to right
  y: number;   // Normalized [0, 1] — top to bottom
  z: number;   // Depth relative to hip center
  visibility: number; // Confidence [0, 1]
}

/** Full set of 33 MediaPipe pose landmarks. */
export interface PoseLandmarks {
  landmarks: Landmark[];
  worldLandmarks: Landmark[]; // Metric-scale 3D
  timestamp: number;
}

/** Segmentation mask classes from selfie_multiclass_256x256. */
export enum SegmentationClass {
  Background = 0,
  Hair = 1,
  BodySkin = 2,
  FaceSkin = 3,
  Clothes = 4,
  Accessories = 5,
}

/** Result of the segmenter — per-pixel class mask. */
export interface SegmentationMask {
  /** Category index per pixel (Uint8Array, flattened row-major). */
  data: Uint8Array;
  width: number;
  height: number;
  timestamp: number;
}

/** Combined tracking result emitted per inference. */
export interface TrackingResult {
  pose: PoseLandmarks | null;
  segmentation: SegmentationMask | null;
  inferenceTimeMs: number;
}

/** MediaPipe PoseLandmarker indices for key body points. */
export const PoseIndex = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

/** Skeleton connections for debug overlay rendering. */
export const SKELETON_CONNECTIONS: [number, number][] = [
  // Torso
  [PoseIndex.LEFT_SHOULDER, PoseIndex.RIGHT_SHOULDER],
  [PoseIndex.LEFT_SHOULDER, PoseIndex.LEFT_HIP],
  [PoseIndex.RIGHT_SHOULDER, PoseIndex.RIGHT_HIP],
  [PoseIndex.LEFT_HIP, PoseIndex.RIGHT_HIP],
  // Left arm
  [PoseIndex.LEFT_SHOULDER, PoseIndex.LEFT_ELBOW],
  [PoseIndex.LEFT_ELBOW, PoseIndex.LEFT_WRIST],
  // Right arm
  [PoseIndex.RIGHT_SHOULDER, PoseIndex.RIGHT_ELBOW],
  [PoseIndex.RIGHT_ELBOW, PoseIndex.RIGHT_WRIST],
  // Left leg
  [PoseIndex.LEFT_HIP, PoseIndex.LEFT_KNEE],
  [PoseIndex.LEFT_KNEE, PoseIndex.LEFT_ANKLE],
  // Right leg
  [PoseIndex.RIGHT_HIP, PoseIndex.RIGHT_KNEE],
  [PoseIndex.RIGHT_KNEE, PoseIndex.RIGHT_ANKLE],
  // Face
  [PoseIndex.LEFT_EAR, PoseIndex.LEFT_EYE],
  [PoseIndex.RIGHT_EAR, PoseIndex.RIGHT_EYE],
  [PoseIndex.NOSE, PoseIndex.LEFT_EYE_INNER],
  [PoseIndex.NOSE, PoseIndex.RIGHT_EYE_INNER],
  // Hands
  [PoseIndex.LEFT_WRIST, PoseIndex.LEFT_PINKY],
  [PoseIndex.LEFT_WRIST, PoseIndex.LEFT_INDEX],
  [PoseIndex.LEFT_WRIST, PoseIndex.LEFT_THUMB],
  [PoseIndex.RIGHT_WRIST, PoseIndex.RIGHT_PINKY],
  [PoseIndex.RIGHT_WRIST, PoseIndex.RIGHT_INDEX],
  [PoseIndex.RIGHT_WRIST, PoseIndex.RIGHT_THUMB],
  // Feet
  [PoseIndex.LEFT_ANKLE, PoseIndex.LEFT_HEEL],
  [PoseIndex.LEFT_HEEL, PoseIndex.LEFT_FOOT_INDEX],
  [PoseIndex.RIGHT_ANKLE, PoseIndex.RIGHT_HEEL],
  [PoseIndex.RIGHT_HEEL, PoseIndex.RIGHT_FOOT_INDEX],
];
