/**
 * @module tracking/PoseTracker
 *
 * Wraps MediaPipe PoseLandmarker for pose estimation.
 * Runs in VIDEO mode with GPU delegate (WebGL fallback).
 */

import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { Landmark, PoseLandmarks } from './types.js';

export interface PoseTrackerOptions {
  /** Number of poses to detect. Default: 1 */
  numPoses?: number;
  /** Minimum detection confidence. Default: 0.5 */
  minDetectionConfidence?: number;
  /** Minimum tracking confidence. Default: 0.5 */
  minTrackingConfidence?: number;
  /** Minimum presence confidence. Default: 0.5 */
  minPresenceConfidence?: number;
  /** Use GPU delegate if available. Default: true */
  useGpu?: boolean;
  /** Path to models directory. Default: '/models' */
  modelsPath?: string;
}

export class PoseTracker {
  private _landmarker: PoseLandmarker | null = null;
  private _initialized = false;
  private _options: Required<PoseTrackerOptions>;
  private _gpuDelegateActive = false;

  constructor(options: PoseTrackerOptions = {}) {
    this._options = {
      numPoses: options.numPoses ?? 1,
      minDetectionConfidence: options.minDetectionConfidence ?? 0.5,
      minTrackingConfidence: options.minTrackingConfidence ?? 0.5,
      minPresenceConfidence: options.minPresenceConfidence ?? 0.5,
      useGpu: options.useGpu ?? true,
      modelsPath: options.modelsPath ?? '/models',
    };
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get gpuDelegateActive(): boolean {
    return this._gpuDelegateActive;
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;

    let delegate: 'GPU' | 'CPU' = 'CPU';
    if (this._options.useGpu) {
      try {
        // Try GPU delegate first
        delegate = 'GPU';
      } catch {
        console.warn('[PoseTracker] GPU delegate not available, falling back to CPU');
        delegate = 'CPU';
      }
    }

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
      );

      this._landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate,
        },
        runningMode: 'VIDEO',
        numPoses: this._options.numPoses,
        minPoseDetectionConfidence: this._options.minDetectionConfidence,
        minTrackingConfidence: this._options.minTrackingConfidence,
        minPosePresenceConfidence: this._options.minPresenceConfidence,
      });

      this._gpuDelegateActive = delegate === 'GPU';
      this._initialized = true;
      console.log(`[PoseTracker] Initialized (delegate: ${delegate})`);
    } catch (err) {
      // If GPU failed, retry with CPU
      if (delegate === 'GPU') {
        console.warn('[PoseTracker] GPU init failed, retrying with CPU:', err);
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
        );

        this._landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: this._options.numPoses,
          minPoseDetectionConfidence: this._options.minDetectionConfidence,
          minTrackingConfidence: this._options.minTrackingConfidence,
          minPosePresenceConfidence: this._options.minPresenceConfidence,
        });

        this._gpuDelegateActive = false;
        this._initialized = true;
        console.log('[PoseTracker] Initialized (delegate: CPU, GPU fallback)');
      } else {
        throw err;
      }
    }
  }

  /** Run pose detection on a video frame. */
  detect(video: HTMLVideoElement, timestampMs: number): PoseLandmarks | null {
    if (!this._landmarker || !this._initialized) return null;

    const result: PoseLandmarkerResult = this._landmarker.detectForVideo(video, timestampMs);

    if (!result.landmarks || result.landmarks.length === 0) {
      return null;
    }

    // Take the first person's landmarks
    const raw = result.landmarks[0];
    const rawWorld = result.worldLandmarks?.[0] ?? raw;

    const landmarks: Landmark[] = raw.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z ?? 0,
      visibility: lm.visibility ?? 0,
    }));

    const worldLandmarks: Landmark[] = rawWorld.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z ?? 0,
      visibility: lm.visibility ?? 0,
    }));

    return {
      landmarks,
      worldLandmarks,
      timestamp: timestampMs / 1000,
    };
  }

  async dispose(): Promise<void> {
    this._landmarker?.close();
    this._landmarker = null;
    this._initialized = false;
  }
}
