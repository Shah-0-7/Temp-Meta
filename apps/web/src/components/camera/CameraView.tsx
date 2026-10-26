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

export function CameraView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasContainerRef = useRef<HTMLDivElement>(null);
  const { cameraState, startCamera, stopCamera, toggleMirror, mirror } = useCamera();
  const { initWebGL, perf, onTrackingResult } = useEngine(canvasRef);
  const { initTracking, trackingReady, debugOverlay, initProgress } = useTracking(perf, onTrackingResult);
  const showPerfHUD = useSettingsStore((s) => s.showPerfHUD);
  const showDebugOverlay = useSettingsStore((s) => s.showDebugOverlay);
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
      // Initialize tracking after camera starts
      await initTracking();
    } catch {
      // Error state handled by store
    } finally {
      setCameraLoading(false);
    }
  };

  return (
    <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-[var(--color-surface-1)]">
      <PermissionGate onRequestCamera={handleRequestCamera}>
        {/* Canvas container — holds WebGL + debug overlay */}
        <div ref={debugCanvasContainerRef} className="relative max-w-full max-h-full">
          {/* WebGL Canvas */}
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain rounded-lg"
            style={{ imageRendering: 'auto' }}
          />
        </div>

        {/* Loading indicator for tracking init */}
        {cameraLoading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2 text-sm flex items-center gap-2 z-10">
            <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
            <span className="text-[var(--color-text-secondary)]">
              {initProgress || 'Starting camera…'}
            </span>
          </div>
        )}

        {/* Tracking status */}
        {cameraState === 'active' && !trackingReady && !cameraLoading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2 text-sm flex items-center gap-2 z-10">
            <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
            <span className="text-[var(--color-text-secondary)]">
              {initProgress || 'Loading tracking models…'}
            </span>
          </div>
        )}

        {/* Debug overlay indicator */}
        {showDebugOverlay && trackingReady && (
          <div className="absolute top-3 right-3 glass rounded-lg px-2 py-1 text-xs text-brand-400 z-10">
            DEBUG
          </div>
        )}

        {/* Overlay controls */}
        <CameraControls
          onStop={stopCamera}
          onToggleMirror={toggleMirror}
          mirror={mirror}
        />

        {/* Performance HUD */}
        {showPerfHUD && <PerfHUD monitor={perf} />}
      </PermissionGate>
    </div>
  );
}
