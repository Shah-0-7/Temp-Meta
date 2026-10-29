/**
 * @module components/settings/PerfHUD
 *
 * Semi-transparent performance overlay showing live metrics.
 * Togglable via settings or keyboard shortcut (P).
 */

import type { PerfMonitor } from '@tryanywhere/engine';
import { usePerfHUD } from '../../hooks/usePerfHUD';

interface PerfHUDProps {
  monitor: PerfMonitor | null;
}

export function PerfHUD({ monitor }: PerfHUDProps) {
  const metrics = usePerfHUD(monitor);

  const fpsColor =
    metrics.fps >= 50
      ? 'var(--color-accent-success)'
      : metrics.fps >= 25
        ? 'var(--color-accent-warning)'
        : 'var(--color-accent-error)';

  const p95Color =
    metrics.p95FrameTimeMs < 8
      ? 'var(--color-accent-success)'
      : metrics.p95FrameTimeMs < 16
        ? 'var(--color-accent-warning)'
        : 'var(--color-accent-error)';

  return (
    <div className="absolute top-3 left-3 glass rounded-xl px-3 py-2 text-xs select-none pointer-events-none">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)] w-16">FPS</span>
          <span style={{ color: fpsColor }} className="font-semibold tabular-nums">
            {metrics.fps}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)] w-16">Frame</span>
          <span className="text-[var(--color-text-secondary)] tabular-nums">
            {metrics.frameTimeMs.toFixed(1)}ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)] w-16">p95</span>
          <span style={{ color: p95Color }} className="tabular-nums">
            {metrics.p95FrameTimeMs.toFixed(1)}ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)] w-16">Track</span>
          <span className="text-[var(--color-text-secondary)] tabular-nums">
            {metrics.trackingTimeMs.toFixed(1)}ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)] w-16">GPU</span>
          <span className={metrics.gpuDelegateAvailable ? 'text-[var(--color-accent-success)]' : 'text-[var(--color-text-muted)]'}>
            {metrics.gpuDelegateAvailable ? 'active' : 'n/a'}
          </span>
        </div>
      </div>
    </div>
  );
}
