/**
 * @module filters/OneEuroFilter
 *
 * Custom implementation of the 1€ (One Euro) filter.
 * ~50 LOC for the core algorithm, following the original paper:
 * "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
 * by Casiez, Roussel, Vogel (2012).
 *
 * The 1€ filter is a low-pass filter that adapts its cutoff frequency
 * based on the speed of the input signal: slow movements are smoothed
 * aggressively, fast movements pass through with minimal lag.
 *
 * Decision D5: Custom implementation gives full control over per-landmark
 * tuning and avoids a dependency for minimal code.
 */

/** Low-pass filter with exponential smoothing. */
class LowPassFilter {
  private _y: number | null = null;
  private _s: number | null = null;

  filter(value: number, alpha: number): number {
    if (this._y === null) {
      this._s = value;
    } else {
      this._s = alpha * value + (1 - alpha) * this._s!;
    }
    this._y = value;
    return this._s!;
  }

  hasLastValue(): boolean {
    return this._y !== null;
  }

  lastValue(): number {
    return this._y ?? 0;
  }

  reset(): void {
    this._y = null;
    this._s = null;
  }
}

/** Configuration for a OneEuroFilter instance. */
export interface OneEuroFilterConfig {
  /** Minimum cutoff frequency (Hz). Lower = more smoothing. Default: 0.8 */
  minCutoff?: number;
  /** Speed coefficient. Higher = less lag on fast movements. Default: 0.01 */
  beta?: number;
  /** Derivative cutoff frequency (Hz). Default: 1.0 */
  dCutoff?: number;
}

/** Smoothing constant from cutoff frequency. */
function alpha(cutoff: number, dt: number): number {
  const tau = 1.0 / (2 * Math.PI * cutoff);
  return 1.0 / (1.0 + tau / dt);
}

/**
 * 1€ filter for a single scalar value.
 *
 * Usage:
 * ```ts
 * const filter = new OneEuroFilter({ minCutoff: 0.8, beta: 0.01 });
 * const smoothed = filter.filter(rawValue, timestamp);
 * ```
 */
export class OneEuroFilter {
  private _minCutoff: number;
  private _beta: number;
  private _dCutoff: number;
  private _xFilter = new LowPassFilter();
  private _dxFilter = new LowPassFilter();
  private _lastTimestamp: number | null = null;

  constructor(config: OneEuroFilterConfig = {}) {
    this._minCutoff = config.minCutoff ?? 0.8;
    this._beta = config.beta ?? 0.01;
    this._dCutoff = config.dCutoff ?? 1.0;
  }

  /**
   * Filter a value at a given timestamp (seconds).
   * Returns the smoothed value.
   */
  filter(value: number, timestamp: number): number {
    let dt: number;
    if (this._lastTimestamp === null) {
      dt = 1.0 / 60; // Assume 60fps on first sample
    } else {
      dt = timestamp - this._lastTimestamp;
      if (dt <= 0) dt = 1.0 / 60;
    }
    this._lastTimestamp = timestamp;

    // Estimate derivative (speed)
    const dValue = this._xFilter.hasLastValue()
      ? (value - this._xFilter.lastValue()) / dt
      : 0;

    // Smooth the derivative
    const edAlpha = alpha(this._dCutoff, dt);
    const dSmoothed = this._dxFilter.filter(dValue, edAlpha);

    // Adaptive cutoff: faster movement → higher cutoff → less smoothing
    const cutoff = this._minCutoff + this._beta * Math.abs(dSmoothed);

    // Filter the value
    const a = alpha(cutoff, dt);
    return this._xFilter.filter(value, a);
  }

  /** Update tuning parameters at runtime. */
  setConfig(config: Partial<OneEuroFilterConfig>): void {
    if (config.minCutoff !== undefined) this._minCutoff = config.minCutoff;
    if (config.beta !== undefined) this._beta = config.beta;
    if (config.dCutoff !== undefined) this._dCutoff = config.dCutoff;
  }

  /** Reset filter state (e.g. on tracking loss). */
  reset(): void {
    this._xFilter.reset();
    this._dxFilter.reset();
    this._lastTimestamp = null;
  }
}

/**
 * Bank of filters for a multi-dimensional value (e.g. x, y, z per landmark).
 */
export class OneEuroFilterBank {
  private _filters: OneEuroFilter[];

  constructor(dimensions: number, config: OneEuroFilterConfig = {}) {
    this._filters = Array.from({ length: dimensions }, () => new OneEuroFilter(config));
  }

  /** Filter a multi-dimensional value. Returns smoothed values. */
  filter(values: number[], timestamp: number): number[] {
    return values.map((v, i) => this._filters[i].filter(v, timestamp));
  }

  /** Reset all filters. */
  reset(): void {
    for (const f of this._filters) f.reset();
  }

  /** Update config on all filters. */
  setConfig(config: Partial<OneEuroFilterConfig>): void {
    for (const f of this._filters) f.setConfig(config);
  }

  get length(): number {
    return this._filters.length;
  }
}
