/**
 * @module performance/AutoAdapt
 *
 * Automatically adjusts quality settings when performance drops.
 *
 * Cascade (step down when p95 > budget for 2s):
 *   1. Tracking rate: 30 → 20 → 15 fps
 *   2. Segmentation: enabled → disabled
 *   3. Output resolution: 1080p → 720p → 480p
 *
 * Steps back up after 5s of headroom.
 * Shows a HUD toast on every change.
 */

import type { PerfMonitor } from './PerfMonitor.js';
import type { TrackingPipeline } from '../tracking/TrackingPipeline.js';

export interface AutoAdaptOptions {
  /** Frame time budget in ms. Default: 16 (60fps) */
  budgetMs?: number;
  /** Duration of sustained overload before stepping down (ms). Default: 2000 */
  stepDownThresholdMs?: number;
  /** Duration of sustained headroom before stepping up (ms). Default: 5000 */
  stepUpThresholdMs?: number;
  /** Enable/disable. Default: true */
  enabled?: boolean;
}

export type AdaptLevel = 0 | 1 | 2 | 3 | 4 | 5;

interface AdaptStep {
  level: AdaptLevel;
  label: string;
  trackingRate: number;
  enableSegmentation: boolean;
}

const ADAPT_STEPS: AdaptStep[] = [
  { level: 0, label: '30fps / Full',         trackingRate: 30, enableSegmentation: true },
  { level: 1, label: '20fps / Full',         trackingRate: 20, enableSegmentation: true },
  { level: 2, label: '15fps / Full',         trackingRate: 15, enableSegmentation: true },
  { level: 3, label: '15fps / No Seg',       trackingRate: 15, enableSegmentation: false },
];

export type AdaptChangeListener = (step: AdaptStep, direction: 'down' | 'up') => void;

export class AutoAdapt {
  private _options: Required<AutoAdaptOptions>;
  private _currentLevel: AdaptLevel = 0;
  private _overBudgetSince: number | null = null;
  private _underBudgetSince: number | null = null;
  private _listeners: Set<AdaptChangeListener> = new Set();
  private _intervalId: number | null = null;
  private _perfMonitor: PerfMonitor;
  private _trackingPipeline: TrackingPipeline | null = null;

  constructor(perfMonitor: PerfMonitor, options: AutoAdaptOptions = {}) {
    this._perfMonitor = perfMonitor;
    this._options = {
      budgetMs: options.budgetMs ?? 16,
      stepDownThresholdMs: options.stepDownThresholdMs ?? 2000,
      stepUpThresholdMs: options.stepUpThresholdMs ?? 5000,
      enabled: options.enabled ?? true,
    };
  }

  /** Connect to the tracking pipeline for rate control. */
  setTrackingPipeline(pipeline: TrackingPipeline): void {
    this._trackingPipeline = pipeline;
  }

  get currentLevel(): AdaptLevel {
    return this._currentLevel;
  }

  get currentStep(): AdaptStep {
    return ADAPT_STEPS[this._currentLevel];
  }

  get enabled(): boolean {
    return this._options.enabled;
  }

  set enabled(value: boolean) {
    this._options.enabled = value;
    if (!value) {
      this.stop();
      this._reset();
    }
  }

  /** Start monitoring. Polls p95 at 500ms intervals. */
  start(): void {
    if (this._intervalId !== null) return;
    this._intervalId = window.setInterval(() => this._tick(), 500);
  }

  /** Stop monitoring. */
  stop(): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /** Subscribe to adapt changes. Returns unsubscribe. */
  onChange(listener: AdaptChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Force a specific level. */
  setLevel(level: AdaptLevel): void {
    if (level >= 0 && level < ADAPT_STEPS.length) {
      this._applyLevel(level, level > this._currentLevel ? 'down' : 'up');
    }
  }

  // ---- Private --------------------------------------------------------------

  private _tick(): void {
    if (!this._options.enabled) return;

    const metrics = this._perfMonitor.getMetrics();
    const now = performance.now();
    const overBudget = metrics.p95FrameTimeMs > this._options.budgetMs;

    if (overBudget) {
      this._underBudgetSince = null;
      if (this._overBudgetSince === null) {
        this._overBudgetSince = now;
      } else if (now - this._overBudgetSince >= this._options.stepDownThresholdMs) {
        this._stepDown();
        this._overBudgetSince = null; // Reset after stepping
      }
    } else {
      this._overBudgetSince = null;
      if (this._underBudgetSince === null) {
        this._underBudgetSince = now;
      } else if (
        now - this._underBudgetSince >= this._options.stepUpThresholdMs &&
        this._currentLevel > 0
      ) {
        this._stepUp();
        this._underBudgetSince = null;
      }
    }
  }

  private _stepDown(): void {
    const next = this._currentLevel + 1;
    if (next >= ADAPT_STEPS.length) return; // Already at lowest
    this._applyLevel(next as AdaptLevel, 'down');
  }

  private _stepUp(): void {
    const next = this._currentLevel - 1;
    if (next < 0) return; // Already at highest
    this._applyLevel(next as AdaptLevel, 'up');
  }

  private _applyLevel(level: AdaptLevel, direction: 'down' | 'up'): void {
    this._currentLevel = level;
    const step = ADAPT_STEPS[level];

    // Apply to tracking pipeline
    if (this._trackingPipeline) {
      this._trackingPipeline.setTrackingRate(step.trackingRate);
      this._trackingPipeline.setSegmentationEnabled(step.enableSegmentation);
    }

    console.log(
      `[AutoAdapt] ${direction === 'down' ? '⬇️ Stepped down' : '⬆️ Stepped up'} to level ${level}: ${step.label}`,
    );

    for (const listener of this._listeners) {
      try {
        listener(step, direction);
      } catch (err) {
        console.error('[AutoAdapt] Listener error:', err);
      }
    }
  }

  private _reset(): void {
    this._currentLevel = 0;
    this._overBudgetSince = null;
    this._underBudgetSince = null;
  }
}
