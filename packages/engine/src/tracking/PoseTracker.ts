/**
 * @module tracking/PoseTracker
 *
 * Wraps MediaPipe PoseLandmarker (33 body landmarks) in VIDEO mode.
 * Tries the GPU delegate first and falls back to CPU automatically.
 */

import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { Landmark, PoseLandmarks } from './types.js';
import { cdnAssets, type PoseModelVariant } from './assets.js';

export interface PoseTrackerOptions {
  /** Number of poses to detect. Default: 1 */
  numPoses?: number;
  /** Minimum detection confidence. Default: 0.5 */
  minDetectionConfidence?: number;
  /** Minimum tracking confidence. Lower = holds on to the body longer. Default: 0.4 */
  minTrackingConfidence?: number;
  /** Minimum presence confidence. Default: 0.4 */
  minPresenceConfidence?: number;
  /** Use GPU delegate if available. Default: true */
  useGpu?: boolean;
  /** Body model: lite (fastest) / full (accurate, default) / heavy. */
  variant?: PoseModelVariant;
  /** Directory with the WASM runtime. Default: pinned CDN. */
  wasmBase?: string;
  /** URL of the pose_landmarker .task file. Default: CDN for `variant`. */
  modelUrl?: string;
}

export class PoseTracker {
  private _landmarker: PoseLandmarker | null = null;
  private _initialized = false;
  private _gpuDelegateActive = false;
  private _errorLogged = false;
  private readonly _options: Required<PoseTrackerOptions>;

  constructor(options: PoseTrackerOptions = {}) {
    const variant = options.variant ?? 'full';
    const cdn = cdnAssets(variant);
    this._options = {
      numPoses: options.numPoses ?? 1,
      minDetectionConfidence: options.minDetectionConfidence ?? 0.5,
      minTrackingConfidence: options.minTrackingConfidence ?? 0.4,
      minPresenceConfidence: options.minPresenceConfidence ?? 0.4,
      useGpu: options.useGpu ?? true,
      variant,
      wasmBase: options.wasmBase ?? cdn.wasmBase,
      modelUrl: options.modelUrl ?? cdn.poseModel,
    };
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get gpuDelegateActive(): boolean {
    return this._gpuDelegateActive;
  }

  get variant(): PoseModelVariant {
    return this._options.variant;
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;

    const vision = await FilesetResolver.forVisionTasks(this._options.wasmBase);

    const create = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: this._options.modelUrl, delegate },
        runningMode: 'VIDEO',
        numPoses: this._options.numPoses,
        minPoseDetectionConfidence: this._options.minDetectionConfidence,
        minTrackingConfidence: this._options.minTrackingConfidence,
        minPosePresenceConfidence: this._options.minPresenceConfidence,
      });

    if (this._options.useGpu) {
      try {
        this._landmarker = await create('GPU');
        this._gpuDelegateActive = true;
      } catch (err) {
        console.warn('[PoseTracker] GPU delegate unavailable, using CPU:', err);
      }
    }
    if (!this._landmarker) {
      this._landmarker = await create('CPU');
      this._gpuDelegateActive = false;
    }

    this._initialized = true;
    console.log(
      `[PoseTracker] Ready (${this._options.variant}, ${this._gpuDelegateActive ? 'GPU' : 'CPU'})`,
    );
  }

  /** Run pose detection on a video frame. `timestampMs` must be strictly increasing. */
  detect(video: HTMLVideoElement, timestampMs: number): PoseLandmarks | null {
    if (!this._landmarker || !this._initialized) return null;

    let result: PoseLandmarkerResult;
    try {
      result = this._landmarker.detectForVideo(video, timestampMs);
    } catch (err) {
      if (!this._errorLogged) {
        console.warn('[PoseTracker] detectForVideo failed:', err);
        this._errorLogged = true;
      }
      return null;
    }

    if (!result.landmarks || result.landmarks.length === 0) return null;

    const raw = result.landmarks[0];
    const rawWorld = result.worldLandmarks?.[0] ?? raw;

    const toLandmark = (lm: { x: number; y: number; z?: number; visibility?: number }): Landmark => ({
      x: lm.x,
      y: lm.y,
      z: lm.z ?? 0,
      visibility: lm.visibility ?? 0,
    });

    return {
      landmarks: raw.map(toLandmark),
      worldLandmarks: rawWorld.map(toLandmark),
      timestamp: timestampMs / 1000,
    };
  }

  async dispose(): Promise<void> {
    this._landmarker?.close();
    this._landmarker = null;
    this._initialized = false;
  }
}
