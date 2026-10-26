/**
 * @module hooks/useEngine
 *
 * React hook that manages the full WebGL render pipeline.
 * M1: PassthroughRenderer (camera-only)
 * M4: TierARenderer (camera + garment warp overlay)
 *
 * Upgrades to TierARenderer automatically when a garment is selected.
 * Falls back to PassthroughRenderer on WebGL2 unavailability.
 */

import { useRef, useEffect, useCallback } from 'react';
import {
  WebGLContext,
  TierARenderer,
  PerfMonitor,
  deriveControlPoints,
} from '@tryanywhere/engine';
import type { TrackingResult } from '@tryanywhere/engine';
import { getCameraManager } from './useCamera';
import { useCameraStore } from '../stores/cameraStore';
import { useAppStore } from '../stores/appStore';
import { useGarmentStore } from '../stores/garmentStore';

export function useEngine(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const ctxRef = useRef<WebGLContext | null>(null);
  const rendererRef = useRef<TierARenderer | null>(null);
  const perfRef = useRef<PerfMonitor>(new PerfMonitor());
  const cleanupRef = useRef<(() => void) | null>(null);
  const garmentImageRef = useRef<HTMLImageElement | null>(null);

  const cameraState = useCameraStore((s) => s.cameraState);
  const mirror = useCameraStore((s) => s.mirror);
  const setEngineReady = useAppStore((s) => s.setEngineReady);
  const setError = useAppStore((s) => s.setError);
  const selectedGarment = useGarmentStore((s) => s.selectedGarment);

  // Initialize WebGL when canvas is available
  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || ctxRef.current) return;

    try {
      const ctx = new WebGLContext({ canvas, preserveDrawingBuffer: true });
      ctxRef.current = ctx;

      const renderer = new TierARenderer(ctx);
      rendererRef.current = renderer;

      setEngineReady(true);
      console.log('[useEngine] TierA WebGL2 renderer initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WebGL2 initialization failed';
      setError(msg);
      console.error('[useEngine] Init error:', err);
    }
  }, [canvasRef, setEngineReady, setError]);

  // Wire camera frames to the renderer
  useEffect(() => {
    if (cameraState !== 'active') return;

    const mgr = getCameraManager();
    const renderer = rendererRef.current;
    const ctx = ctxRef.current;
    const perf = perfRef.current;
    if (!mgr || !renderer || !ctx) return;

    // Size canvas to match video
    const video = mgr.video;
    if (video) ctx.resize(video.videoWidth, video.videoHeight);

    const unsubFrame = mgr.onFrame((videoEl, _timestamp) => {
      const endFrame = perf.beginFrame();

      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        ctx.resize(videoEl.videoWidth, videoEl.videoHeight);
      }

      renderer.draw(videoEl);
      endFrame();
    });

    cleanupRef.current = unsubFrame;
    return () => {
      unsubFrame();
      cleanupRef.current = null;
    };
  }, [cameraState]);

  // Update mirror
  useEffect(() => {
    if (rendererRef.current) rendererRef.current.mirror = mirror;
  }, [mirror]);

  // Load garment image when selection changes
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (!selectedGarment) {
      renderer.clearGarment();
      garmentImageRef.current = null;
      return;
    }

    const displayUrl = selectedGarment.proxyUrl ?? selectedGarment.url;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      renderer.setGarment(img);
      garmentImageRef.current = img;
      console.log('[useEngine] Garment loaded:', displayUrl);
    };
    img.onerror = () => {
      console.warn('[useEngine] Failed to load garment image:', displayUrl);
    };
    img.src = displayUrl;
  }, [selectedGarment]);

  // Accept tracking results and derive control points
  const onTrackingResult = useCallback((result: TrackingResult) => {
    const renderer = rendererRef.current;
    if (!renderer || !selectedGarment || !result.pose) return;

    // Derive garment type from the store candidate
    const garmentType = (selectedGarment as any).garmentType ?? 'top';
    const cps = deriveControlPoints(result.pose.landmarks, garmentType, mirror);
    renderer.setControlPoints(cps);

    // Forward segmentation mask if available
    if (result.segmentation) {
      // Build a canvas from the segmentation mask (clothes class only)
      buildMaskCanvas(result.segmentation.data, result.segmentation.width, result.segmentation.height)
        .then((canvas) => renderer.setMaskTexture(canvas))
        .catch(() => {});
    }
  }, [selectedGarment, mirror]);

  // Cleanup
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      rendererRef.current?.dispose();
      ctxRef.current?.dispose();
      rendererRef.current = null;
      ctxRef.current = null;
    };
  }, []);

  return {
    initWebGL,
    perf: perfRef.current,
    glContext: ctxRef.current,
    renderer: rendererRef.current,
    onTrackingResult,
  };
}

/**
 * Build an OffscreenCanvas from the segmentation mask, encoding
 * the "clothes" class (4) as white and everything else as black.
 */
async function buildMaskCanvas(
  data: Uint8Array,
  width: number,
  height: number,
): Promise<OffscreenCanvas> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);
  const pixels = imgData.data;

  for (let i = 0; i < data.length; i++) {
    const isClothes = data[i] === 4; // SegmentationClass.Clothes
    const v = isClothes ? 255 : 0;
    pixels[i * 4] = v;
    pixels[i * 4 + 1] = v;
    pixels[i * 4 + 2] = v;
    pixels[i * 4 + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
