/**
 * @module hooks/useEngine
 *
 * Owns the WebGL renderer and connects it to three inputs:
 *   - camera frames        -> draw()
 *   - the selected garment -> cut-out + anchors -> texture
 *   - tracking results     -> control points + occlusion mask
 *
 * All values the tracking callback needs (garment, mirror, ...) live in refs, so
 * the callback is STABLE. (The previous version re-created it on every garment or
 * mirror change while the tracker kept calling the first copy, which still saw
 * "no garment selected".)
 */

import { useRef, useEffect, useCallback } from 'react';
import {
  WebGLContext,
  TierARenderer,
  PerfMonitor,
  deriveControlPoints,
  prepareGarmentImage,
  type PreparedGarment,
  type TrackingResult,
} from '@tryanywhere/engine';
import { getCameraManager } from './useCamera';
import { useCameraStore } from '../stores/cameraStore';
import { useAppStore } from '../stores/appStore';
import { useGarmentStore } from '../stores/garmentStore';
import { useSettingsStore } from '../stores/settingsStore';

/** Shared with the snapshot / realistic-render flow. */
export interface EngineHandle {
  renderer: TierARenderer | null;
  ctx: WebGLContext | null;
  garment: PreparedGarment | null;
  garmentType: 'top' | 'outerwear';
  latest: TrackingResult | null;
}
export const engineHandle: EngineHandle = {
  renderer: null,
  ctx: null,
  garment: null,
  garmentType: 'top',
  latest: null,
};

// ---- Capturing the live preview ---------------------------------------------------------
// The canvas does not keep its pixels after a frame is presented, so a capture has to be taken
// inside the frame callback, right after the draw. Requests wait here for the next frame.

interface CaptureWaiter {
  resolve: (blob: Blob) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
const captureWaiters: CaptureWaiter[] = [];

/** The live preview exactly as drawn (camera picture plus garment), as a PNG. */
export function captureLiveFrame(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!engineHandle.ctx || useCameraStore.getState().cameraState !== 'active') {
      reject(new Error('The camera is not running.'));
      return;
    }
    const waiter: CaptureWaiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        const at = captureWaiters.indexOf(waiter);
        if (at >= 0) captureWaiters.splice(at, 1);
        reject(new Error('The preview did not update. Try again.'));
      }, 2000),
    };
    captureWaiters.push(waiter);
  });
}

function flushCaptures(canvas: HTMLCanvasElement): void {
  if (captureWaiters.length === 0) return;
  const waiters = captureWaiters.splice(0);
  // toBlob snapshots the bitmap when called, so doing it here (same task as the draw) is safe.
  canvas.toBlob((blob) => {
    for (const w of waiters) {
      clearTimeout(w.timer);
      if (blob) w.resolve(blob);
      else w.reject(new Error('Could not save the picture.'));
    }
  }, 'image/png');
}

export function useEngine(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const perfRef = useRef<PerfMonitor>(new PerfMonitor());

  const cameraState = useCameraStore((s) => s.cameraState);
  const mirror = useCameraStore((s) => s.mirror);
  const garmentUrl = useGarmentStore((s) => (s.selectedGarment ? (s.selectedGarment.proxyUrl ?? s.selectedGarment.url) : null));
  const garmentKind = useGarmentStore((s) => s.selectedGarment?.garmentType ?? null);
  const shading = useSettingsStore((s) => s.garmentShading);
  const setEngineReady = useAppStore((s) => s.setEngineReady);
  const setError = useAppStore((s) => s.setError);

  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;

  // ---- WebGL lifetime ------------------------------------------------------------

  const createRenderer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      engineHandle.ctx?.dispose();
      const ctx = new WebGLContext({ canvas, preserveDrawingBuffer: true });
      const renderer = new TierARenderer(ctx, { shading: useSettingsStore.getState().garmentShading });
      renderer.mirror = mirrorRef.current;
      if (engineHandle.garment) renderer.setGarment(engineHandle.garment.canvas);
      engineHandle.ctx = ctx;
      engineHandle.renderer = renderer;

      // Textures die with the context: rebuild everything on restore.
      ctx.onContextRestored(() => createRenderer());

      setEngineReady(true);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WebGL2 initialization failed';
      setError(msg);
      console.error('[useEngine] Init error:', err);
    }
  }, [canvasRef, setEngineReady, setError]);

  useEffect(() => {
    createRenderer();
    return () => {
      engineHandle.renderer?.dispose();
      engineHandle.ctx?.dispose();
      engineHandle.renderer = null;
      engineHandle.ctx = null;
    };
  }, [createRenderer]);

  // ---- Camera frames -> render ------------------------------------------------------

  useEffect(() => {
    if (cameraState !== 'active') return;
    const mgr = getCameraManager();
    const perf = perfRef.current;

    return mgr.onFrame((video) => {
      const { renderer, ctx } = engineHandle;
      if (!renderer || !ctx || video.videoWidth === 0) return;
      const endFrame = perf.beginFrame();
      // Exact video size, no CSS side effects: the canvas keeps the camera's aspect ratio.
      ctx.setDrawingBufferSize(video.videoWidth, video.videoHeight);
      renderer.draw(video);
      flushCaptures(ctx.canvas);
      endFrame();
    });
  }, [cameraState]);

  // ---- Settings -----------------------------------------------------------------------

  useEffect(() => {
    if (engineHandle.renderer) engineHandle.renderer.mirror = mirror;
  }, [mirror]);

  useEffect(() => {
    if (engineHandle.renderer) engineHandle.renderer.shading = shading;
  }, [shading]);

  // ---- Garment: load -> cut out -> texture -----------------------------------------------

  useEffect(() => {
    const renderer = engineHandle.renderer;
    const { setPrep } = useGarmentStore.getState();
    if (!renderer) return;

    if (!garmentUrl) {
      renderer.clearGarment();
      engineHandle.garment = null;
      setPrep(null);
      return;
    }

    let cancelled = false;
    const url = garmentUrl;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const prepared = prepareGarmentImage(img);
        engineHandle.garment = prepared;
        engineHandle.renderer?.setGarment(prepared.canvas);
        setPrep({ mode: prepared.mode, confidence: prepared.confidence, loadError: null });
        console.log(
          `[useEngine] Garment ready: cut-out=${prepared.mode}, confidence=${prepared.confidence.toFixed(2)}`,
        );
      } catch (err) {
        // Typically a cross-origin image without CORS headers (tainted canvas).
        console.warn('[useEngine] Could not prepare garment:', err);
        setPrep({
          mode: 'none',
          confidence: 0,
          loadError:
            'This image cannot be read by the browser (the store blocks it). Use the product URL option, which loads it through the app server, or upload the image.',
        });
      }
    };
    img.onerror = () => {
      if (cancelled) return;
      setPrep({ mode: 'none', confidence: 0, loadError: 'The garment image failed to load.' });
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
    // Keyed on the image, not the garment object: changing only its kind must not reload the picture.
  }, [garmentUrl, canvasRef]);

  // The kind (top / jacket) only changes how the mesh is built, so it needs no reload.
  useEffect(() => {
    engineHandle.garmentType = garmentKind === 'outerwear' ? 'outerwear' : 'top';
  }, [garmentKind]);

  // ---- Tracking results -> control points (stable callback) ------------------------------

  const onTrackingResult = useCallback((result: TrackingResult) => {
    engineHandle.latest = result;

    // Low-frequency UI state: only when the guidance changes.
    if (result.status) {
      const prev = useAppStore.getState().poseStatus;
      if (!prev || prev.code !== result.status.code) useAppStore.getState().setPoseStatus(result.status);
    }

    const renderer = engineHandle.renderer;
    const garment = engineHandle.garment;
    if (!renderer || !garment || !result.pose) return;

    const aspect =
      result.frameWidth && result.frameHeight ? result.frameWidth / result.frameHeight : 16 / 9;
    const cps = deriveControlPoints(result.pose.landmarks, engineHandle.garmentType, {
      mirror: mirrorRef.current,
      aspect,
      garmentAspect: garment.aspect,
      anchors: garment.anchors,
    });
    renderer.setControlPoints(cps);
    renderer.setOcclusionMask(result.occlusion ?? null);
  }, []);

  return {
    perf: perfRef.current,
    onTrackingResult,
  };
}
