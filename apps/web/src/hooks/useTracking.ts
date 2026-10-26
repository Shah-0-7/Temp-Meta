/**
 * @module hooks/useTracking
 *
 * React hook that manages the TrackingPipeline lifecycle.
 * Initializes MediaPipe models, starts/stops tracking when
 * camera is active, and provides latest results to the UI.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  TrackingPipeline,
  DebugOverlay,
  AutoAdapt,
  PerfMonitor,
} from '@tryanywhere/engine';
import type { TrackingResult } from '@tryanywhere/engine';
import { getCameraManager } from './useCamera';
import { useCameraStore } from '../stores/cameraStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';

export function useTracking(
  perfMonitor: PerfMonitor,
  onResult?: (result: TrackingResult) => void,
) {
  const pipelineRef = useRef<TrackingPipeline | null>(null);
  const debugOverlayRef = useRef<DebugOverlay | null>(null);
  const autoAdaptRef = useRef<AutoAdapt | null>(null);
  const [trackingReady, setTrackingReady] = useState(false);
  const [latestResult, setLatestResult] = useState<TrackingResult | null>(null);
  const [initProgress, setInitProgress] = useState<string>('');

  const cameraState = useCameraStore((s) => s.cameraState);
  const mirror = useCameraStore((s) => s.mirror);
  const trackingRate = useSettingsStore((s) => s.trackingRate);
  const autoAdaptEnabled = useSettingsStore((s) => s.autoAdapt);
  const showDebugOverlay = useSettingsStore((s) => s.showDebugOverlay);
  const setEngineReady = useAppStore((s) => s.setEngineReady);

  // Initialize tracking pipeline
  const initTracking = useCallback(async () => {
    if (pipelineRef.current) return;

    try {
      setInitProgress('Loading pose model…');
      const pipeline = new TrackingPipeline({
        trackingRate,
        enablePose: true,
        enableSegmentation: true,
        filterConfig: {
          minCutoff: 0.8,
          beta: 0.01,
          dCutoff: 1.0,
        },
      });

      pipelineRef.current = pipeline;

      // Create debug overlay
      debugOverlayRef.current = new DebugOverlay();

      // Create auto-adapt
      const autoAdapt = new AutoAdapt(perfMonitor);
      autoAdapt.setTrackingPipeline(pipeline);
      autoAdaptRef.current = autoAdapt;

      setInitProgress('Initializing MediaPipe…');
      await pipeline.initialize();

      // Subscribe to results
      pipeline.onResult((result) => {
        setLatestResult(result);
        perfMonitor.recordTrackingTime(result.inferenceTimeMs);
        perfMonitor.setGpuDelegateAvailable(pipeline.gpuDelegateActive);
        // Forward to engine for control point derivation
        onResult?.(result);
      });

      setTrackingReady(true);
      setEngineReady(true);
      setInitProgress('');
      console.log('[useTracking] Pipeline ready');
    } catch (err) {
      console.error('[useTracking] Failed to initialize:', err);
      setInitProgress('Tracking initialization failed');
    }
  }, [trackingRate, perfMonitor, setEngineReady]);

  // Start/stop tracking when camera changes
  useEffect(() => {
    if (cameraState !== 'active' || !trackingReady) return;

    const mgr = getCameraManager();
    const pipeline = pipelineRef.current;
    if (!mgr?.video || !pipeline) return;

    pipeline.startTracking(mgr.video);

    // Start auto-adapt if enabled
    if (autoAdaptEnabled && autoAdaptRef.current) {
      autoAdaptRef.current.enabled = true;
      autoAdaptRef.current.start();
    }

    return () => {
      pipeline.stopTracking();
      autoAdaptRef.current?.stop();
    };
  }, [cameraState, trackingReady, autoAdaptEnabled]);

  // Update tracking rate
  useEffect(() => {
    pipelineRef.current?.setTrackingRate(trackingRate);
  }, [trackingRate]);

  // Update auto-adapt
  useEffect(() => {
    if (autoAdaptRef.current) {
      autoAdaptRef.current.enabled = autoAdaptEnabled;
    }
  }, [autoAdaptEnabled]);

  // Draw debug overlay
  useEffect(() => {
    if (!showDebugOverlay || !latestResult) return;

    const overlay = debugOverlayRef.current;
    if (!overlay) return;

    const mgr = getCameraManager();
    if (!mgr?.video) return;

    overlay.resize(mgr.video.videoWidth, mgr.video.videoHeight);
    overlay.draw(
      latestResult.pose?.landmarks ?? null,
      latestResult.segmentation ?? null,
      mirror,
    );
  }, [showDebugOverlay, latestResult, mirror]);

  // Cleanup
  useEffect(() => {
    return () => {
      pipelineRef.current?.dispose();
      pipelineRef.current = null;
      autoAdaptRef.current?.stop();
    };
  }, []);

  return {
    initTracking,
    trackingReady,
    latestResult,
    initProgress,
    debugOverlay: debugOverlayRef.current,
    pipeline: pipelineRef.current,
    autoAdapt: autoAdaptRef.current,
  };
}
