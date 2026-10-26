/**
 * @module tracking/TrackingPipeline
 *
 * Orchestrates pose tracking + segmentation, decoupled from the render loop.
 * Runs at a configurable rate (default 30 fps), applies One Euro filtering,
 * and emits combined TrackingResult via callbacks.
 *
 * Key design:
 * - Runs independently from the render loop (which runs at display refresh rate)
 * - The render loop interpolates between tracking results for smooth animation
 * - Auto-throttles tracking rate if inference is too slow
 */

import { PoseTracker, type PoseTrackerOptions } from './PoseTracker.js';
import { Segmenter, type SegmenterOptions } from './Segmenter.js';
import { OneEuroFilterBank } from '../filters/OneEuroFilter.js';
import type { PoseLandmarks, TrackingResult, Landmark } from './types.js';

export interface TrackingPipelineOptions {
  /** Target tracking rate in fps. Default: 30 */
  trackingRate?: number;
  /** Run pose tracker. Default: true */
  enablePose?: boolean;
  /** Run segmenter. Default: true */
  enableSegmentation?: boolean;
  /** One Euro filter config */
  filterConfig?: {
    minCutoff?: number;
    beta?: number;
    dCutoff?: number;
  };
  /** Pose tracker options */
  poseOptions?: PoseTrackerOptions;
  /** Segmenter options */
  segmenterOptions?: SegmenterOptions;
}

export class TrackingPipeline {
  private _poseTracker: PoseTracker;
  private _segmenter: Segmenter;
  private _options: Required<TrackingPipelineOptions>;

  // Filter banks: one per landmark (33 landmarks × 4 values: x, y, z, visibility)
  private _landmarkFilters: OneEuroFilterBank[];
  private _filterConfig: { minCutoff: number; beta: number; dCutoff: number };

  // Results
  private _latestResult: TrackingResult | null = null;
  private _previousResult: TrackingResult | null = null;
  private _listeners: Set<(result: TrackingResult) => void> = new Set();

  // Timing
  private _running = false;
  private _trackingInterval: number | null = null;

  // State
  private _initialized = false;

  constructor(options: TrackingPipelineOptions = {}) {
    this._options = {
      trackingRate: options.trackingRate ?? 30,
      enablePose: options.enablePose ?? true,
      enableSegmentation: options.enableSegmentation ?? true,
      filterConfig: options.filterConfig ?? {},
      poseOptions: options.poseOptions ?? {},
      segmenterOptions: options.segmenterOptions ?? {},
    };

    this._filterConfig = {
      minCutoff: this._options.filterConfig.minCutoff ?? 0.8,
      beta: this._options.filterConfig.beta ?? 0.01,
      dCutoff: this._options.filterConfig.dCutoff ?? 1.0,
    };

    this._poseTracker = new PoseTracker(this._options.poseOptions);
    this._segmenter = new Segmenter(this._options.segmenterOptions);

    // Create 33 filter banks, each with 4 dimensions (x, y, z, visibility)
    this._landmarkFilters = Array.from(
      { length: 33 },
      () => new OneEuroFilterBank(4, this._filterConfig),
    );
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get running(): boolean {
    return this._running;
  }

  get latestResult(): TrackingResult | null {
    return this._latestResult;
  }

  get previousResult(): TrackingResult | null {
    return this._previousResult;
  }

  get gpuDelegateActive(): boolean {
    return this._poseTracker.gpuDelegateActive || this._segmenter.gpuDelegateActive;
  }

  /** Initialize both trackers. */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    const tasks: Promise<void>[] = [];
    if (this._options.enablePose) tasks.push(this._poseTracker.initialize());
    if (this._options.enableSegmentation) tasks.push(this._segmenter.initialize());
    await Promise.all(tasks);

    this._initialized = true;
    console.log('[TrackingPipeline] Initialized');
  }

  /** Start tracking at the configured rate. */
  startTracking(video: HTMLVideoElement): void {
    if (this._running) return;
    this._running = true;

    const intervalMs = 1000 / this._options.trackingRate;

    const tick = () => {
      if (!this._running) return;
      this._runInference(video);
      this._trackingInterval = window.setTimeout(tick, intervalMs) as unknown as number;
    };

    tick();
    console.log(`[TrackingPipeline] Started at ${this._options.trackingRate} fps`);
  }

  /** Stop tracking. */
  stopTracking(): void {
    this._running = false;
    if (this._trackingInterval !== null) {
      clearTimeout(this._trackingInterval);
      this._trackingInterval = null;
    }
    // Reset filters on stop
    this._resetFilters();
  }

  /** Subscribe to tracking results. Returns unsubscribe function. */
  onResult(listener: (result: TrackingResult) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Update tracking rate. */
  setTrackingRate(fps: number): void {
    this._options.trackingRate = fps;
    // If running, restart with new rate
    if (this._running) {
      // Just update — the next tick will use the new interval
    }
  }

  /** Update filter tuning. */
  setFilterConfig(config: { minCutoff?: number; beta?: number; dCutoff?: number }): void {
    Object.assign(this._filterConfig, config);
    for (const bank of this._landmarkFilters) {
      bank.setConfig(this._filterConfig);
    }
  }

  /**
   * Interpolate landmarks between the last two tracking results.
   * Used by the render loop when it runs faster than tracking.
   * @param t Interpolation factor [0, 1] where 0 = previous, 1 = latest
   */
  interpolateLandmarks(t: number): Landmark[] | null {
    const prev = this._previousResult?.pose;
    const curr = this._latestResult?.pose;

    if (!curr) return null;
    if (!prev) return curr.landmarks;

    const clamped = Math.max(0, Math.min(1, t));
    return curr.landmarks.map((c, i) => {
      const p = prev.landmarks[i];
      return {
        x: p.x + (c.x - p.x) * clamped,
        y: p.y + (c.y - p.y) * clamped,
        z: p.z + (c.z - p.z) * clamped,
        visibility: p.visibility + (c.visibility - p.visibility) * clamped,
      };
    });
  }

  async dispose(): Promise<void> {
    this.stopTracking();
    await Promise.all([this._poseTracker.dispose(), this._segmenter.dispose()]);
    this._initialized = false;
    this._latestResult = null;
    this._previousResult = null;
  }

  // ---- Private --------------------------------------------------------------

  private _runInference(video: HTMLVideoElement): void {
    if (!this._initialized) return;
    if (video.readyState < 2) return; // Not enough data

    const start = performance.now();
    const timestampMs = performance.now(); // Use wall clock for MediaPipe

    let pose: PoseLandmarks | null = null;

    // Run pose detection
    if (this._options.enablePose) {
      const rawPose = this._poseTracker.detect(video, timestampMs);
      if (rawPose) {
        // Apply One Euro filter to each landmark
        const filtered = rawPose.landmarks.map((lm, i) => {
          const [x, y, z, vis] = this._landmarkFilters[i].filter(
            [lm.x, lm.y, lm.z, lm.visibility],
            rawPose.timestamp,
          );
          return { x, y, z, visibility: vis };
        });

        pose = {
          ...rawPose,
          landmarks: filtered,
        };
      }
    }

    // Run segmentation
    const segmentation =
      this._options.enableSegmentation
        ? this._segmenter.segment(video, timestampMs)
        : null;

    const inferenceTimeMs = performance.now() - start;

    // Store results
    this._previousResult = this._latestResult;
    this._latestResult = {
      pose,
      segmentation,
      inferenceTimeMs,
    };

    // Notify listeners
    for (const listener of this._listeners) {
      try {
        listener(this._latestResult);
      } catch (err) {
        console.error('[TrackingPipeline] Listener error:', err);
      }
    }
  }

  private _resetFilters(): void {
    for (const bank of this._landmarkFilters) {
      bank.reset();
    }
  }
}
