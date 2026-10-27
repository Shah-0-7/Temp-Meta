/**
 * @module tracking/TrackingPipeline
 *
 * Runs pose tracking + segmentation on the camera stream, independent of the
 * render loop, and emits a TrackingResult per inference.
 *
 * Design notes
 *   - Driven by `requestVideoFrameCallback` when available, so inference runs on
 *     NEW camera frames only (never twice on the same frame, never between frames).
 *     Falls back to a timer on browsers without it.
 *   - The target rate is re-read every frame, so AutoAdapt / settings changes apply
 *     immediately. If inference is slower than the target, frames are simply skipped.
 *   - Landmarks go through a One Euro filter tuned for NORMALISED coordinates
 *     (the previous beta=0.01 made the garment lag ~0.2 s behind fast movement).
 *   - Segmentation (occlusion mask) is the expensive part and changes slowly, so it
 *     runs every Nth tick; the last mask is reused in between.
 *   - Every tick also reports `status`: debounced, human-readable fit guidance.
 */

import { PoseTracker, type PoseTrackerOptions } from './PoseTracker.js';
import { Segmenter, type SegmenterOptions } from './Segmenter.js';
import { OneEuroFilterBank } from '../filters/OneEuroFilter.js';
import { evaluatePose, PoseStatusTracker } from './PoseQuality.js';
import { buildOcclusionMask } from './occlusion.js';
import type {
  PoseLandmarks,
  TrackingResult,
  Landmark,
  SegmentationMask,
  OcclusionMask,
} from './types.js';

/** One Euro parameters for normalised [0,1] landmark coordinates. */
export const POSE_FILTER_DEFAULTS = { minCutoff: 1.0, beta: 12, dCutoff: 1.0 } as const;

export interface TrackingPipelineOptions {
  /** Target tracking rate in fps. Default: 30 */
  trackingRate?: number;
  /** Run pose tracker. Default: true */
  enablePose?: boolean;
  /** Run segmenter. Default: true */
  enableSegmentation?: boolean;
  /** Run segmentation every Nth pose tick. Default: 2 */
  segmentationEvery?: number;
  /** One Euro filter config */
  filterConfig?: { minCutoff?: number; beta?: number; dCutoff?: number };
  poseOptions?: PoseTrackerOptions;
  segmenterOptions?: SegmenterOptions;
  /** Forget filter history after this long without a pose. Default: 500 ms */
  lostResetMs?: number;
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class TrackingPipeline {
  private readonly _poseTracker: PoseTracker;
  private readonly _segmenter: Segmenter;
  private readonly _options: {
    trackingRate: number;
    enablePose: boolean;
    enableSegmentation: boolean;
    segmentationEvery: number;
    lostResetMs: number;
  };

  private readonly _filters: OneEuroFilterBank[];
  private readonly _filterConfig: { minCutoff: number; beta: number; dCutoff: number };
  private readonly _statusTracker = new PoseStatusTracker();

  private _latestResult: TrackingResult | null = null;
  private _previousResult: TrackingResult | null = null;
  private readonly _listeners = new Set<(result: TrackingResult) => void>();

  private _running = false;
  private _initialized = false;
  private _video: VideoWithRVFC | null = null;
  private _rvfcHandle: number | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  private _lastInferenceAt = 0;
  private _lastMediaTime = -1;
  private _lastTimestamp = 0;
  private _tick = 0;
  private _lostSince: number | null = null;
  private _lastSegmentation: SegmentationMask | null = null;
  private _occlusion: OcclusionMask | undefined;
  private _measuredFps = 0;

  constructor(options: TrackingPipelineOptions = {}) {
    this._options = {
      trackingRate: options.trackingRate ?? 30,
      enablePose: options.enablePose ?? true,
      enableSegmentation: options.enableSegmentation ?? true,
      segmentationEvery: Math.max(1, options.segmentationEvery ?? 2),
      lostResetMs: options.lostResetMs ?? 500,
    };
    this._filterConfig = { ...POSE_FILTER_DEFAULTS, ...(options.filterConfig ?? {}) };

    this._poseTracker = new PoseTracker(options.poseOptions);
    this._segmenter = new Segmenter(options.segmenterOptions);

    // 33 landmarks x (x, y, z, visibility)
    this._filters = Array.from({ length: 33 }, () => new OneEuroFilterBank(4, this._filterConfig));
  }

  // ---- State -------------------------------------------------------------------

  get initialized(): boolean { return this._initialized; }
  get running(): boolean { return this._running; }
  get latestResult(): TrackingResult | null { return this._latestResult; }
  get previousResult(): TrackingResult | null { return this._previousResult; }
  get trackingRate(): number { return this._options.trackingRate; }
  /** Measured inference rate (EMA), for the HUD. */
  get measuredFps(): number { return this._measuredFps; }
  get gpuDelegateActive(): boolean {
    return this._poseTracker.gpuDelegateActive || this._segmenter.gpuDelegateActive;
  }

  // ---- Lifecycle ---------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this._initialized) return;

    const tasks: Promise<void>[] = [];
    if (this._options.enablePose) tasks.push(this._poseTracker.initialize());
    if (this._options.enableSegmentation) tasks.push(this._segmenter.initialize());
    await Promise.all(tasks);

    this._initialized = true;
    console.log('[TrackingPipeline] Initialized');
  }

  startTracking(video: HTMLVideoElement): void {
    if (this._running) this.stopTracking();
    this._running = true;
    this._video = video as VideoWithRVFC;
    this._lastInferenceAt = 0;
    this._lastMediaTime = -1;
    this._schedule();
    console.log(`[TrackingPipeline] Started (target ${this._options.trackingRate} fps)`);
  }

  stopTracking(): void {
    this._running = false;
    if (this._rvfcHandle !== null && this._video?.cancelVideoFrameCallback) {
      this._video.cancelVideoFrameCallback(this._rvfcHandle);
    }
    this._rvfcHandle = null;
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
    this._video = null;
    this._resetFilters();
    this._statusTracker.reset();
    this._lostSince = null;
  }

  onResult(listener: (result: TrackingResult) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // ---- Runtime tuning ----------------------------------------------------------

  /** Takes effect on the next frame. */
  setTrackingRate(fps: number): void {
    this._options.trackingRate = Math.max(1, fps);
  }

  setSegmentationEnabled(enabled: boolean): void {
    this._options.enableSegmentation = enabled && this._segmenter.initialized;
    if (!enabled) {
      this._lastSegmentation = null;
      this._occlusion = undefined;
    }
  }

  setFilterConfig(config: { minCutoff?: number; beta?: number; dCutoff?: number }): void {
    Object.assign(this._filterConfig, config);
    for (const bank of this._filters) bank.setConfig(this._filterConfig);
  }

  /**
   * Interpolate landmarks between the last two results (t = 0 previous, 1 latest).
   */
  interpolateLandmarks(t: number): Landmark[] | null {
    const prev = this._previousResult?.pose;
    const curr = this._latestResult?.pose;
    if (!curr) return null;
    if (!prev) return curr.landmarks;
    const k = Math.max(0, Math.min(1, t));
    return curr.landmarks.map((c, i) => {
      const p = prev.landmarks[i];
      return {
        x: p.x + (c.x - p.x) * k,
        y: p.y + (c.y - p.y) * k,
        z: p.z + (c.z - p.z) * k,
        visibility: p.visibility + (c.visibility - p.visibility) * k,
      };
    });
  }

  async dispose(): Promise<void> {
    this.stopTracking();
    await Promise.all([this._poseTracker.dispose(), this._segmenter.dispose()]);
    this._initialized = false;
    this._latestResult = null;
    this._previousResult = null;
    this._listeners.clear();
  }

  // ---- Scheduling --------------------------------------------------------------

  private _schedule(): void {
    if (!this._running || !this._video) return;
    const video = this._video;

    if (typeof video.requestVideoFrameCallback === 'function') {
      this._rvfcHandle = video.requestVideoFrameCallback((_now, meta) => {
        this._rvfcHandle = null;
        if (!this._running) return;
        const interval = 1000 / this._options.trackingRate;
        const now = performance.now();
        // 2 ms slack so a 30 fps camera is not skipped by timer jitter at a 30 fps target.
        if (meta.mediaTime !== this._lastMediaTime && now - this._lastInferenceAt >= interval - 2) {
          this._lastMediaTime = meta.mediaTime;
          this._runInference(video);
        }
        this._schedule();
      });
    } else {
      const interval = 1000 / this._options.trackingRate;
      this._timer = setTimeout(() => {
        this._timer = null;
        if (!this._running) return;
        this._runInference(video);
        this._schedule();
      }, interval);
    }
  }

  // ---- Inference ---------------------------------------------------------------

  private _nextTimestamp(): number {
    const ts = Math.max(performance.now(), this._lastTimestamp + 1);
    this._lastTimestamp = ts;
    return ts;
  }

  private _runInference(video: HTMLVideoElement): void {
    if (!this._initialized) return;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    const start = performance.now();
    const timestampMs = this._nextTimestamp();
    const aspect = video.videoWidth / video.videoHeight;
    this._tick++;

    // ---- Pose ----
    let pose: PoseLandmarks | null = null;
    if (this._options.enablePose) {
      const raw = this._poseTracker.detect(video, timestampMs);
      if (raw) {
        this._lostSince = null;
        const landmarks = raw.landmarks.map((lm, i) => {
          const [x, y, z, vis] = this._filters[i].filter(
            [lm.x, lm.y, lm.z, lm.visibility],
            raw.timestamp,
          );
          return { x, y, z, visibility: vis };
        });
        pose = { ...raw, landmarks };
      } else {
        if (this._lostSince === null) this._lostSince = start;
        if (start - this._lostSince > this._options.lostResetMs) this._resetFilters();
      }
    }

    // ---- Status (debounced guidance) ----
    const status = this._statusTracker.update(evaluatePose(pose?.landmarks ?? null, { aspect }));

    // ---- Segmentation -> occlusion mask (every Nth tick, only while a person is present) ----
    if (this._options.enableSegmentation && pose && this._tick % this._options.segmentationEvery === 0) {
      const seg = this._segmenter.segment(video, this._nextTimestamp());
      if (seg) {
        this._lastSegmentation = seg;
        this._occlusion = buildOcclusionMask(seg, pose.landmarks, { aspect, out: this._occlusion });
      }
    } else if (!pose) {
      this._occlusion = undefined; // nobody there: nothing to keep in front of the garment
    }

    const inferenceTimeMs = performance.now() - start;
    if (this._lastInferenceAt) {
      const instant = 1000 / Math.max(1, start - this._lastInferenceAt);
      this._measuredFps = this._measuredFps === 0 ? instant : this._measuredFps * 0.9 + instant * 0.1;
    }
    this._lastInferenceAt = start;

    this._previousResult = this._latestResult;
    this._latestResult = {
      pose,
      segmentation: this._options.enableSegmentation ? this._lastSegmentation : null,
      inferenceTimeMs,
      occlusion: this._occlusion ?? null,
      status,
      frameWidth: video.videoWidth,
      frameHeight: video.videoHeight,
    };

    for (const listener of this._listeners) {
      try {
        listener(this._latestResult);
      } catch (err) {
        console.error('[TrackingPipeline] Listener error:', err);
      }
    }
  }

  private _resetFilters(): void {
    for (const bank of this._filters) bank.reset();
  }
}
