/**
 * @module hooks/useTracking
 *
 * Manages the TrackingPipeline: loads the pose + segmentation models (same-origin
 * files when present, CDN otherwise), runs them on the live camera, feeds the
 * renderer, and draws the optional debug overlay.
 *
 * Tracking failures never kill the camera preview: the user still sees themselves,
 * with a clear message about what is wrong.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  TrackingPipeline,
  DebugOverlay,
  AutoAdapt,
  PerfMonitor,
  resolveVisionAssets,
} from '@tryanywhere/engine';
import type { TrackingResult } from '@tryanywhere/engine';
import { getCameraManager } from './useCamera';
import { engineHandle } from './useEngine';
import { useCameraStore } from '../stores/cameraStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';

export function useTracking(
  perfMonitor: PerfMonitor,
  onResult: (result: TrackingResult) => void,
) {
  const pipelineRef = useRef<TrackingPipeline | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const debugOverlayRef = useRef<DebugOverlay | null>(null);
  const autoAdaptRef = useRef<AutoAdapt | null>(null);
  const [trackingReady, setTrackingReady] = useState(false);
  const [initProgress, setInitProgress] = useState('');

  // Latest values for callbacks that outlive a render.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const mirror = useCameraStore((s) => s.mirror);
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  const showDebug = useSettingsStore((s) => s.showDebugOverlay);
  const showDebugRef = useRef(showDebug);
  showDebugRef.current = showDebug;

  const cameraState = useCameraStore((s) => s.cameraState);
  const trackingRate = useSettingsStore((s) => s.trackingRate);
  const autoAdaptEnabled = useSettingsStore((s) => s.autoAdapt);
  const poseModel = useSettingsStore((s) => s.poseModel);

  if (!debugOverlayRef.current && typeof document !== 'undefined') {
    debugOverlayRef.current = new DebugOverlay();
  }

  const disposePipeline = useCallback(async () => {
    autoAdaptRef.current?.stop();
    autoAdaptRef.current = null;
    const p = pipelineRef.current;
    pipelineRef.current = null;
    initPromiseRef.current = null;
    setTrackingReady(false);
    await p?.dispose();
  }, []);

  /** Load models and build the pipeline. Safe to call repeatedly. */
  const initTracking = useCallback((): Promise<void> => {
    if (initPromiseRef.current) return initPromiseRef.current;

    const run = async () => {
      const app = useAppStore.getState();
      app.setTrackingError(null);
      try {
        setInitProgress('Looking for body-tracking models…');
        const settings = useSettingsStore.getState();
        const { assets, source } = await resolveVisionAssets({
          variant: settings.poseModel,
          localBase: import.meta.env.BASE_URL,
        });
        app.setTrackingSource(source);

        setInitProgress(
          source === 'local' ? 'Loading body tracking…' : 'Downloading body-tracking models (first run)…',
        );
        const pipeline = new TrackingPipeline({
          trackingRate: settings.trackingRate,
          enablePose: true,
          enableSegmentation: true,
          poseOptions: { variant: settings.poseModel, wasmBase: assets.wasmBase, modelUrl: assets.poseModel },
          segmenterOptions: { wasmBase: assets.wasmBase, modelUrl: assets.segmenterModel },
        });
        await pipeline.initialize();

        pipeline.onResult((result) => {
          perfMonitor.recordTrackingTime(result.inferenceTimeMs);
          perfMonitor.setGpuDelegateAvailable(pipeline.gpuDelegateActive);
          onResultRef.current(result);

          if (showDebugRef.current) {
            const overlay = debugOverlayRef.current;
            const video = getCameraManager().video;
            if (overlay && video) {
              overlay.resize(video.videoWidth, video.videoHeight);
              overlay.draw(
                result.pose?.landmarks ?? null,
                result.segmentation ?? null,
                mirrorRef.current,
                engineHandle.renderer?.controlPoints,
              );
            }
          }
        });

        const autoAdapt = new AutoAdapt(perfMonitor);
        autoAdapt.setTrackingPipeline(pipeline);
        autoAdapt.onChange((step, direction) => {
          useAppStore
            .getState()
            .showNotice(
              direction === 'down'
                ? `Running slowly, so quality was reduced (${step.label}). You can change this in Settings.`
                : `Performance recovered: ${step.label}.`,
            );
        });
        autoAdaptRef.current = autoAdapt;

        pipelineRef.current = pipeline;
        setTrackingReady(true);
        useAppStore.getState().setEngineReady(true);
        setInitProgress('');
      } catch (err) {
        console.error('[useTracking] Failed to initialize:', err);
        initPromiseRef.current = null;
        setInitProgress('');
        useAppStore
          .getState()
          .setTrackingError(
            'Body tracking could not start. The camera works, but garments will not follow you. ' +
              'Check your internet connection (models download on first use) or run "pnpm setup:assets" to bundle them locally.',
          );
      }
    };

    initPromiseRef.current = run();
    return initPromiseRef.current;
  }, [perfMonitor]);

  // Start/stop tracking with the camera.
  useEffect(() => {
    if (cameraState !== 'active' || !trackingReady) return;
    const video = getCameraManager().video;
    const pipeline = pipelineRef.current;
    if (!video || !pipeline) return;

    pipeline.startTracking(video);
    const adapt = autoAdaptRef.current;
    if (adapt && autoAdaptEnabled) {
      adapt.enabled = true;
      adapt.start();
    }
    return () => {
      pipeline.stopTracking();
      adapt?.stop();
      useAppStore.getState().setPoseStatus(null);
    };
  }, [cameraState, trackingReady, autoAdaptEnabled]);

  useEffect(() => {
    pipelineRef.current?.setTrackingRate(trackingRate);
  }, [trackingRate]);

  // Changing the body model rebuilds the pipeline (only once tracking was started before).
  const firstModelRun = useRef(true);
  useEffect(() => {
    if (firstModelRun.current) {
      firstModelRun.current = false;
      return;
    }
    if (!pipelineRef.current) return;
    void disposePipeline().then(() => initTracking());
  }, [poseModel, disposePipeline, initTracking]);

  // Clear the overlay when it is switched off.
  useEffect(() => {
    if (!showDebug) debugOverlayRef.current?.clear();
  }, [showDebug]);

  useEffect(() => {
    return () => {
      void disposePipeline();
    };
  }, [disposePipeline]);

  return {
    initTracking,
    trackingReady,
    initProgress,
    debugOverlay: debugOverlayRef.current,
  };
}
