/**
 * @module components/camera/RealtimeLayer
 *
 * Shows the live AI output over the preview while a Decart session is running,
 * with a clearly visible LIVE AI bar (timer, limit, Stop) so it is never mistaken
 * for the on-device preview. Also shows a start failure, if any.
 */

import { useEffect, useRef } from 'react';
import { useRealtimeStore } from '../../stores/realtimeStore';
import { useCameraStore } from '../../stores/cameraStore';
import { stopRealtime } from '../../hooks/useRealtimeTryOn';

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RealtimeLayer() {
  const { status, connection, remoteStream, error, elapsedSeconds, maxSeconds } = useRealtimeStore();
  const mirror = useCameraStore((s) => s.mirror);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = remoteStream;
    if (remoteStream) void v.play().catch(() => undefined);
  }, [remoteStream]);

  const dismiss = () => useRealtimeStore.getState().setError(null);

  return (
    <>
      {(status === 'starting' || status === 'live') && (
        <>
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Live AI try-on video"
            className="absolute inset-0 w-full h-full object-contain z-[5] bg-black"
            style={{ transform: mirror ? 'scaleX(-1)' : undefined, display: remoteStream ? 'block' : 'none' }}
          />
          <div
            role="status"
            aria-live="polite"
            className="absolute top-3 left-1/2 -translate-x-1/2 z-10 glass rounded-xl px-3 py-1.5 text-sm flex items-center gap-3"
          >
            <span className="flex items-center gap-1.5 font-semibold text-[var(--color-accent-error)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent-error)] animate-pulse" />
              LIVE AI
            </span>
            <span className="text-[var(--color-text-secondary)]">
              {status === 'starting' || connection === 'connecting'
                ? 'Connecting…'
                : connection === 'reconnecting'
                  ? 'Reconnecting…'
                  : `${mmss(elapsedSeconds)} / ${mmss(maxSeconds)}`}
            </span>
            <button
              onClick={() => void stopRealtime()}
              className="px-2.5 py-1 rounded-lg bg-[var(--color-accent-error)]/20 text-[var(--color-accent-error)] text-xs font-medium"
            >
              Stop
            </button>
          </div>
        </>
      )}

      {status === 'error' && error && (
        <div
          role="alert"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-10 glass rounded-xl px-4 py-2 text-sm max-w-[90%] flex items-center gap-3"
        >
          <span className="text-[var(--color-accent-error)]">{error}</span>
          <button onClick={dismiss} className="px-2 py-1 rounded-lg glass text-xs">
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
