/**
 * @module performance/PerfMonitor
 *
 * Lightweight performance monitor that tracks:
 * - FPS (frames per second)
 * - Frame time (ms per frame)
 * - Tracking time (ms per tracking inference)
 * - p95 frame time (for auto-adapt decisions)
 *
 * Uses a ring buffer for efficient percentile calculations.
 */

export interface PerfMetrics {
  fps: number;
  frameTimeMs: number;
  trackingTimeMs: number;
  p95FrameTimeMs: number;
  gpuDelegateAvailable: boolean;
}

/** Ring buffer for storing timing samples. */
class RingBuffer {
  private _data: Float64Array;
  private _head = 0;
  private _count = 0;

  constructor(capacity: number) {
    this._data = new Float64Array(capacity);
  }

  push(value: number): void {
    this._data[this._head] = value;
    this._head = (this._head + 1) % this._data.length;
    if (this._count < this._data.length) this._count++;
  }

  get count(): number {
    return this._count;
  }

  /** Return the p-th percentile (0–1). */
  percentile(p: number): number {
    if (this._count === 0) return 0;

    // Copy used portion and sort
    const sorted = new Float64Array(this._count);
    for (let i = 0; i < this._count; i++) {
      const idx = (this._head - this._count + i + this._data.length) % this._data.length;
      sorted[i] = this._data[idx];
    }
    sorted.sort();

    const index = Math.min(Math.floor(p * this._count), this._count - 1);
    return sorted[index];
  }

  /** Return the mean. */
  mean(): number {
    if (this._count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this._count; i++) {
      const idx = (this._head - this._count + i + this._data.length) % this._data.length;
      sum += this._data[idx];
    }
    return sum / this._count;
  }

  clear(): void {
    this._head = 0;
    this._count = 0;
  }
}

export class PerfMonitor {
  private _frameTimeSamples: RingBuffer;
  private _trackingTimeSamples: RingBuffer;
  private _fpsSamples: RingBuffer;

  private _lastFrameTimestamp = 0;
  private _frameCount = 0;
  private _fpsLastUpdate = 0;
  private _currentFps = 0;

  private _latestFrameTime = 0;
  private _latestTrackingTime = 0;
  private _gpuDelegateAvailable = false;

  /** Listeners for metric updates. */
  private _listeners: Set<(metrics: PerfMetrics) => void> = new Set();
  private _updateIntervalMs = 250; // Update listeners 4x/sec

  constructor(sampleCount = 120) {
    this._frameTimeSamples = new RingBuffer(sampleCount);
    this._trackingTimeSamples = new RingBuffer(sampleCount);
    this._fpsSamples = new RingBuffer(60);
  }

  /** Record the start of a frame render. Returns a function to call when the frame finishes. */
  beginFrame(): () => void {
    const start = performance.now();
    return () => {
      const elapsed = performance.now() - start;
      this._latestFrameTime = elapsed;
      this._frameTimeSamples.push(elapsed);
      this._tickFps();
    };
  }

  /** Record a tracking inference duration. */
  recordTrackingTime(ms: number): void {
    this._latestTrackingTime = ms;
    this._trackingTimeSamples.push(ms);
  }

  /** Set GPU delegate availability. */
  setGpuDelegateAvailable(available: boolean): void {
    this._gpuDelegateAvailable = available;
  }

  /** Get current metrics snapshot. */
  getMetrics(): PerfMetrics {
    return {
      fps: Math.round(this._currentFps),
      frameTimeMs: Math.round(this._latestFrameTime * 100) / 100,
      trackingTimeMs: Math.round(this._latestTrackingTime * 100) / 100,
      p95FrameTimeMs: Math.round(this._frameTimeSamples.percentile(0.95) * 100) / 100,
      gpuDelegateAvailable: this._gpuDelegateAvailable,
    };
  }

  /** Subscribe to periodic metric updates. Returns unsubscribe function. */
  onUpdate(listener: (metrics: PerfMetrics) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Reset all samples. */
  reset(): void {
    this._frameTimeSamples.clear();
    this._trackingTimeSamples.clear();
    this._fpsSamples.clear();
    this._frameCount = 0;
    this._currentFps = 0;
    this._latestFrameTime = 0;
    this._latestTrackingTime = 0;
  }

  // ---- Private --------------------------------------------------------------

  private _tickFps(): void {
    const now = performance.now();
    this._frameCount++;

    if (this._lastFrameTimestamp > 0) {
      const delta = now - this._lastFrameTimestamp;
      if (delta > 0) {
        this._fpsSamples.push(1000 / delta);
      }
    }
    this._lastFrameTimestamp = now;

    // Periodically update listeners
    if (now - this._fpsLastUpdate >= this._updateIntervalMs) {
      this._currentFps = this._fpsSamples.mean();
      this._fpsLastUpdate = now;
      this._notifyListeners();
    }
  }

  private _notifyListeners(): void {
    const metrics = this.getMetrics();
    for (const listener of this._listeners) {
      try {
        listener(metrics);
      } catch (err) {
        console.error('[PerfMonitor] Listener error:', err);
      }
    }
  }
}
