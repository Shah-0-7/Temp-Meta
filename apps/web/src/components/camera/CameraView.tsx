/**
 * @module components/camera/CameraView
 *
 * The camera viewport: the WebGL canvas (ALWAYS mounted, so the renderer exists
 * before the camera starts), pose hints, controls, and the render panel.
 */

import { useRef, useEffect, useState } from 'react';
import { useCamera, getCameraManager } from '../../hooks/useCamera';
import { useEngine } from '../../hooks/useEngine';
import { useTracking } from '../../hooks/useTracking';
import { useRealisticRender } from '../../hooks/useRealisticRender';
import { PermissionGate } from './PermissionGate';
import { CameraControls } from './CameraControls';
import { PoseHint } from './PoseHint';
import { RenderPanel } from './RenderPanel';
import { RealtimeLayer } from './RealtimeLayer';
import { startRealtime, stopRealtime } from '../../hooks/useRealtimeTryOn';
import { useRealtimeStore } from '../../stores/realtimeStore';
import { PerfHUD } from '../settings/PerfHUD';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCameraStore } from '../../stores/cameraStore';

export function CameraView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { cameraState, startCamera, stopCamera, toggleMirror, mirror, actualWidth, actualHeight } = useCamera();
  const { perf, onTrackingResult } = useEngine(canvasRef);
  const { initTracking, trackingReady, debugOverlay, initProgress } = useTracking(perf, onTrackingResult);
  const { render, renderPhoto } = useRealisticRender();
  const showPerfHUD = useSettingsStore((s) => s.showPerfHUD);
  const showDebugOverlay = useSettingsStore((s) => s.showDebugOverlay);
  const fpsCap = useSettingsStore((s) => s.fpsCap);
  const [starting, setStarting] = useState(false);
  const liveAvailable = useRealtimeStore((s) => s.available);
  const liveStatus = useRealtimeStore((s) => s.status);
  const liveActive = liveStatus === 'starting' || liveStatus === 'live';

  const active = cameraState === 'active';

  // Apply the FPS cap to the real camera loop.
  useEffect(() => {
    getCameraManager().setFpsCap(fpsCap);
    useCameraStore.getState().setFpsCap(fpsCap);
  }, [fpsCap]);

  // Mount the debug overlay on top of the canvas, letterboxed exactly like it.
  useEffect(() => {
    const stage = stageRef.current;
    if (!showDebugOverlay || !debugOverlay || !stage) return;
    const c = debugOverlay.canvas;
    Object.assign(c.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      objectFit: 'contain', pointerEvents: 'none',
    });
    stage.appendChild(c);
    return () => {
      c.parentNode?.removeChild(c);
    };
  }, [showDebugOverlay, debugOverlay]);

  const handleRequestCamera = async () => {
    setStarting(true);
    try {
      await startCamera();
      // Tracking loads after the preview is already live, so the user sees themselves immediately.
      void initTracking();
    } catch {
      // The camera store carries the readable reason.
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="stage stage-frame flex-1 flex items-center justify-center">
      {/* Canvas stays mounted; hidden until the camera is live. */}
      <div ref={stageRef} className={`relative w-full h-full ${active ? '' : 'hidden'}`}>
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
          style={{
            aspectRatio: actualWidth && actualHeight ? `${actualWidth} / ${actualHeight}` : undefined,
          }}
          aria-label="Live camera preview with garment"
        />
      </div>

      <PermissionGate onRequestCamera={handleRequestCamera} onUploadPhoto={(f) => void renderPhoto(f)}>
        {starting && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2 text-sm flex items-center gap-2 z-10">
            <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
            <span className="text-[var(--color-text-secondary)]">Starting the camera…</span>
          </div>
        )}

        {!starting && initProgress && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2 text-sm flex items-center gap-2 z-10">
            <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
            <span className="text-[var(--color-text-secondary)]">{initProgress}</span>
          </div>
        )}

        {!initProgress && <PoseHint trackingReady={trackingReady} />}

        {showDebugOverlay && trackingReady && (
          <div className="absolute top-3 right-3 glass rounded-lg px-2 py-1 text-xs text-brand-400 z-10">DEBUG</div>
        )}

        <CameraControls
          onStop={stopCamera}
          onToggleMirror={toggleMirror}
          onSnapshot={() => void render()}
          mirror={mirror}
          liveAvailable={liveAvailable}
          liveActive={liveActive}
          onLive={() => void (liveActive ? stopRealtime() : startRealtime())}
        />

        <RealtimeLayer />

        {showPerfHUD && <PerfHUD monitor={perf} />}
      </PermissionGate>

      <RenderPanel />
    </div>
  );
}
