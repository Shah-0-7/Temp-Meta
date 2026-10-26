/**
 * @module hooks/useRealisticPhoto
 *
 * React hook that coordinates the Tier B Realistic Photo flow:
 * 1. Precondition checks (camera active, garment selected)
 * 2. Privacy consent handling
 * 3. Frame capture from WebGL canvas
 * 4. In-flight progress simulation and API call to POST /api/generate
 * 5. Result management and error handling
 */

import { useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useGarmentStore } from '../stores/garmentStore';
import { useCameraStore } from '../stores/cameraStore';

export function useRealisticPhoto(canvasRef?: React.RefObject<HTMLCanvasElement | null>) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  const cameraState = useCameraStore((s) => s.cameraState);
  const selectedGarment = useGarmentStore((s) => s.selectedGarment);
  const setGarmentPanelOpen = useGarmentStore((s) => s.setGarmentPanelOpen);

  const {
    sessionConsentAccepted,
    setConsentDialogOpen,
    setRealisticDialogOpen,
    setGenerationState,
    setRealisticResult,
    setError,
  } = useAppStore();

  const cancelGeneration = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerationState(false, 0, '');
  }, [setGenerationState]);

  const executeGeneration = useCallback(async () => {
    // Locate the canvas
    const canvas = canvasRef?.current || document.querySelector('canvas');
    if (!canvas) {
      setError('Camera canvas not found.');
      return;
    }

    if (!selectedGarment) {
      setError('Please choose a garment first before generating a realistic photo.');
      setGarmentPanelOpen(true);
      return;
    }

    // Capture the WebGL canvas lossless frame
    let frameDataUrl: string;
    try {
      frameDataUrl = canvas.toDataURL('image/png');
    } catch (err) {
      console.error('[useRealisticPhoto] Canvas capture failed:', err);
      setError('Failed to capture camera frame. Ensure WebGL drawing buffer is preserved.');
      return;
    }

    // Open the result dialog and show loading progress
    setRealisticDialogOpen(true);
    setGenerationState(true, 15, 'Capturing frame and preparing garment reference…');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Simulate progress while the network generation is running
    let progress = 15;
    progressTimerRef.current = window.setInterval(() => {
      progress = Math.min(progress + Math.random() * 15, 88);
      let stepMsg = 'Synthesizing fabric drape & creases…';
      if (progress > 40 && progress < 70) {
        stepMsg = 'Preserving lighting, skin tones, and background…';
      } else if (progress >= 70) {
        stepMsg = 'Rendering high-resolution photorealistic details…';
      }
      setGenerationState(true, progress, stepMsg);
    }, 400);

    try {
      const garmentUrl = selectedGarment.proxyUrl ?? selectedGarment.url;
      const garmentType = (selectedGarment as any).garmentType ?? 'top';

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          personFrame: frameDataUrl,
          garmentUrl,
          garmentType,
        }),
      });

      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      if (!response.ok) {
        let errMessage = `Generation failed (HTTP ${response.status})`;
        try {
          const errData = await response.json();
          if (errData.error) errMessage = errData.error;
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      const data = await response.json();
      setGenerationState(false, 100, 'Complete!');
      setRealisticResult({
        image: data.image,
        previewImage: frameDataUrl,
        metadata: data.metadata,
      });
    } catch (err) {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setGenerationState(false, 0, '');

      if ((err as Error).name === 'AbortError') {
        console.log('[useRealisticPhoto] Generation cancelled by user.');
        return;
      }

      const message = (err as Error).message;
      console.error('[useRealisticPhoto] Generation error:', message);
      setError(message);
    } finally {
      abortControllerRef.current = null;
    }
  }, [
    canvasRef,
    selectedGarment,
    setGarmentPanelOpen,
    setRealisticDialogOpen,
    setGenerationState,
    setRealisticResult,
    setError,
  ]);

  /**
   * Main entry point when user clicks "Realistic Photo" / Tier B.
   */
  const triggerRealisticPhoto = useCallback(() => {
    if (cameraState !== 'active') {
      setError('Please start your camera first.');
      return;
    }

    if (!selectedGarment) {
      setError('Please select a garment first (press G or click Choose Garment).');
      setGarmentPanelOpen(true);
      return;
    }

    // Check if consent has already been given for this session
    if (!sessionConsentAccepted) {
      setConsentDialogOpen(true);
      return;
    }

    executeGeneration();
  }, [
    cameraState,
    selectedGarment,
    sessionConsentAccepted,
    setError,
    setGarmentPanelOpen,
    setConsentDialogOpen,
    executeGeneration,
  ]);

  const onConfirmConsent = useCallback(() => {
    setConsentDialogOpen(false);
    executeGeneration();
  }, [setConsentDialogOpen, executeGeneration]);

  const onCancelConsent = useCallback(() => {
    setConsentDialogOpen(false);
  }, [setConsentDialogOpen]);

  return {
    triggerRealisticPhoto,
    cancelGeneration,
    onConfirmConsent,
    onCancelConsent,
    regenerate: executeGeneration,
  };
}
