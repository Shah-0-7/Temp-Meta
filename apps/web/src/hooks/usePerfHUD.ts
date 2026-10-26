/**
 * @module hooks/usePerfHUD
 *
 * React hook that subscribes to PerfMonitor updates
 * and provides metrics for the PerfHUD overlay.
 */

import { useState, useEffect, useRef } from 'react';
import type { PerfMetrics, PerfMonitor } from '@tryanywhere/engine';

const DEFAULT_METRICS: PerfMetrics = {
  fps: 0,
  frameTimeMs: 0,
  trackingTimeMs: 0,
  p95FrameTimeMs: 0,
  gpuDelegateAvailable: false,
};

export function usePerfHUD(monitor: PerfMonitor | null) {
  const [metrics, setMetrics] = useState<PerfMetrics>(DEFAULT_METRICS);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!monitor) return;

    unsubRef.current = monitor.onUpdate((m) => {
      setMetrics(m);
    });

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [monitor]);

  return metrics;
}
