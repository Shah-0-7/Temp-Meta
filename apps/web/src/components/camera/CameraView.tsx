/**
 * @module components/camera/CameraView
 *
 * The main camera viewport — renders the WebGL canvas
 * with the camera passthrough, debug overlay, and tracking.
 */

import { useRef, useEffect, useState } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { useEngine } from '../../hooks/useEngine';
import { useTracking } from '../../hooks/useTracking';
import { PermissionGate } from './PermissionGate';
import { CameraControls } from './CameraControls';
import { PerfHUD } from '../settings/PerfHUD';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppStore } from '../../stores/appStore';

interface CameraViewProps {
  onRealisticPhoto?: () => void;
}

export function CameraView({ onRealisticPhoto }: CameraViewProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasContainerRef = useRef<HTMLDivElement>(null);
  const {
    cameraState,
    startCamera,
    startDemo,
    startWithImage,
    stopCamera,
    toggleMirror,
    mirror,
    feedSource,
  } = useCamera();
  const { initWebGL, perf, onTrackingResult } = useEngine(canvasRef);
  const { initTracking, trackingReady, debugOverlay, initProgress } = useTracking(perf, onTrackingResult);
  const showPerfHUD = useSettingsStore((s) => s.showPerfHUD);
  const showDebugOverlay = useSettingsStore((s) => s.showDebugOverlay);
  const isGeneratingRealistic = useAppStore((s) => s.isGeneratingRealistic);
  const setError = useAppStore((s) => s.setError);
  const [cameraLoading, setCameraLoading] = useState(false);

  // Initialize WebGL when canvas mounts
  useEffect(() => {
    if (canvasRef.current) {
      initWebGL();
    }
  }, [initWebGL]);

  // Mount debug overlay canvas
  useEffect(() => {
    if (showDebugOverlay && debugOverlay && debugCanvasContainerRef.current) {
      const canvas = debugOverlay.canvas;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      debugCanvasContainerRef.current.appendChild(canvas);

      return () => {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      };
    }
  }, [showDebugOverlay, debugOverlay]);

  const handleRequestCamera = async () => {
    setCameraLoading(true);
    try {
      await startCamera();
      await initTracking();
    } catch (err) {
      console.warn('[CameraView] Camera start failed:', err);
    } finally {
      setCameraLoading(false);
    }
  };

  const handleStartDemo = async (preset = 'female') => {
    setCameraLoading(true);
    try {
      await startDemo(preset);
      await initTracking();
    } catch (err) {
      console.error('[CameraView] Demo feed failed:', err);
      setError('Failed to start demo model feed.');
    } finally {
      setCameraLoading(false);
    }
  };

  const handleUploadPhoto = async (file: File) => {
    setCameraLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          await startWithImage(dataUrl);
          await initTracking();
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('[CameraView] Photo upload failed:', err);
      setError('Failed to load photo.');
    } finally {
      setCameraLoading(false);
    }
  };

  return (
    <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-[var(--color-surface-1)] w-full h-full">
      {/* Canvas container — always mounted for reliable WebGL & rVFC binding */}
      <div ref={debugCanvasContainerRef} className="relative max-w-full max-h-full flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className={`max-w-full max-h-full object-contain rounded-lg transition-opacity duration-300 ${
            cameraState === 'active' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ imageRendering: 'auto' }}
        />
      </div>

      {/* Permission / Idle Gate Overlay */}
      {cameraState !== 'active' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--color-surface-1)]">
          <PermissionGate
            onRequestCamera={handleRequestCamera}
            onStartDemo={handleStartDemo}
            onUploadPhoto={handleUploadPhoto}
          />
        </div>
      )}

      {/* Loading indicator */}
      {cameraLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2 text-sm flex items-center gap-2 z-40 shadow-xl">
          <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
          <span className="text-[var(--color-text-secondary)]">
            {initProgress || 'Starting feed…'}
          </span>
        </div>
      )}

      {/* Tracking model status */}
      {cameraState === 'active' && !trackingReady && !cameraLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2 text-sm flex items-center gap-2 z-40 shadow-xl">
          <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
          <span className="text-[var(--color-text-secondary)]">
            {initProgress || 'Loading tracking models…'}
          </span>
        </div>
      )}

      {/* Feed source switcher pill (active when camera is running) */}
      {cameraState === 'active' && (
        <div className="absolute top-3 left-4 z-20 flex items-center gap-1.5 glass px-2.5 py-1 rounded-full text-xs border border-[var(--color-glass-border)] shadow-md">
          <span className="text-[var(--color-text-muted)] font-medium">Feed:</span>
          <button
            onClick={handleRequestCamera}
            className={`px-2 py-0.5 rounded-full transition-all ${
              feedSource === 'webcam'
                ? 'bg-brand-500/25 text-brand-300 font-semibold'
                : 'text-[var(--color-text-muted)] hover:text-white'
            }`}
          >
            Webcam
          </button>
          <button
            onClick={() => handleStartDemo('female')}
            className={`px-2 py-0.5 rounded-full transition-all ${
              feedSource === 'demo'
                ? 'bg-brand-500/25 text-brand-300 font-semibold'
                : 'text-[var(--color-text-muted)] hover:text-white'
            }`}
          >
            Demo Model
          </button>
        </div>
      )}

      {/* Debug overlay indicator */}
      {showDebugOverlay && trackingReady && (
        <div className="absolute top-3 right-3 glass rounded-lg px-2 py-1 text-xs text-brand-400 z-20">
          DEBUG
        </div>
      )}

      {/* Overlay controls */}
      {cameraState === 'active' && (
        <CameraControls
          onStop={stopCamera}
          onToggleMirror={toggleMirror}
          mirror={mirror}
          onRealisticPhoto={onRealisticPhoto}
          isGeneratingRealistic={isGeneratingRealistic}
        />
      )}

      {/* Performance HUD */}
      {showPerfHUD && <PerfHUD monitor={perf} />}
    </div>
  );
}
