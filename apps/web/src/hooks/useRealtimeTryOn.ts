/**
 * @module hooks/useRealtimeTryOn
 *
 * Optional live AI try-on (Tier C, Decart). Start asks for consent first (the camera
 * video leaves the device and the session is billed), drops the camera to 720p while
 * live, ends on tab-hide / camera-stop / the session limit, and swaps garments
 * without reconnecting.
 */

import { useCallback, useEffect } from 'react';
import type { RealtimeSession, RealtimeTryOn, RealtimeTryOnError } from '@tryanywhere/engine';
import { getAppRegistry, getServerFeatures } from '../lib/appRegistry';
import { getCameraManager } from './useCamera';
import { engineHandle } from './useEngine';
import { useCameraStore } from '../stores/cameraStore';
import { useGarmentStore } from '../stores/garmentStore';
import { useConsentStore } from '../stores/consentStore';
import { useRealtimeStore } from '../stores/realtimeStore';

let session: RealtimeSession | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let restoreResolution: (() => Promise<void>) | null = null;
let starting = false;

/** Learn once whether the server offers live AI try-on, so the button can show or hide. */
export async function refreshRealtimeAvailability(): Promise<void> {
  const f = await getServerFeatures();
  useRealtimeStore.getState().setAvailable(f.realtimeTryOn, f.realtimeMaxSessionSeconds);
}

async function garmentBitmap(): Promise<ImageBitmap> {
  const g = engineHandle.garment;
  if (!g) throw new Error('Pick a garment first (press G), then start the live try-on.');
  return createImageBitmap(g.canvas);
}

export async function stopRealtime(reason?: string): Promise<void> {
  const s = session;
  session = null;
  if (ticker) clearInterval(ticker);
  ticker = null;
  s?.disconnect();
  const restore = restoreResolution;
  restoreResolution = null;
  const store = useRealtimeStore.getState();
  store.reset();
  if (reason) store.setError(reason);
  // Put the camera back to the quality the user had chosen.
  if (restore) await restore().catch(() => undefined);
}

export async function startRealtime(): Promise<void> {
  const store = useRealtimeStore.getState();
  if (starting || session || !store.available) return;
  if (useCameraStore.getState().cameraState !== 'active') {
    store.setError('Turn the camera on first.');
    return;
  }
  starting = true;
  store.setError(null);

  try {
    const bitmap = await garmentBitmap();

    const accepted = await useConsentStore.getState().ask({
      key: 'decart',
      provider: 'Decart',
      title: 'Start live AI try-on?',
      sends: [
        'Your live camera video is streamed to Decart, a third-party AI service, for as long as the session runs.',
        'The garment image is sent as well.',
      ],
      notes: [
        `The session stops automatically after ${Math.round(useRealtimeStore.getState().maxSeconds / 60)} minutes.`,
        'The normal live preview and Realistic render stay on your device.',
        'This feature is billed to the app owner by usage.',
      ],
    });
    if (!accepted) return;

    store.setStatus('starting');

    // Decart's output is 720p; sending more only wastes bandwidth and adds lag.
    const cam = useCameraStore.getState();
    if (cam.resolution !== '720p') {
      const previous = cam.resolution;
      await getCameraManager().setResolution('720p');
      useCameraStore.getState().setResolution('720p');
      restoreResolution = async () => {
        await getCameraManager().setResolution(previous);
        useCameraStore.getState().setResolution(previous);
      };
    }

    const stream = getCameraManager().stream;
    if (!stream) throw new Error('The camera stream is not available.');

    const provider = (await (await getAppRegistry()).resolve<RealtimeTryOn>('realtime-tryon')) as RealtimeTryOn;
    if (!provider.isFeatureEnabled()) throw new Error('Live AI try-on is not available.');

    const s = await provider.connect(
      stream,
      bitmap,
      (remote) => useRealtimeStore.getState().setRemoteStream(remote),
      { garmentType: engineHandle.garmentType },
    );
    session = s;

    s.onStateChange((c) => {
      useRealtimeStore.getState().setConnection(c);
      if (c === 'connected' || c === 'generating') useRealtimeStore.getState().setStatus('live');
    });
    s.onBilledSeconds((b) => useRealtimeStore.getState().setBilled(b));
    s.onError((e: RealtimeTryOnError) => {
      void stopRealtime(e.message);
    });

    const startedAt = Date.now();
    ticker = setInterval(
      () => useRealtimeStore.getState().setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    useRealtimeStore.getState().setConnection(s.state);
    useRealtimeStore.getState().setStatus('live');
  } catch (err) {
    console.error('[realtime]', err);
    await stopRealtime((err as Error).message || 'Could not start the live try-on.');
  } finally {
    starting = false;
  }
}

/** Mount once (App). Keeps the session honest: it ends whenever the camera or tab goes away. */
export function useRealtimeLifecycle(): void {
  useEffect(() => {
    void refreshRealtimeAvailability();

    // Hidden tab: end the session rather than bill for video nobody sees.
    const onVisibility = () => {
      if (document.hidden && session) void stopRealtime('Live try-on stopped because the tab was hidden.');
    };
    document.addEventListener('visibilitychange', onVisibility);

    const unsubCamera = useCameraStore.subscribe((s, prev) => {
      if (session && prev.cameraState === 'active' && s.cameraState !== 'active') {
        void stopRealtime('Live try-on stopped because the camera was turned off.');
      }
    });

    // Garment changed while live: swap it without reconnecting.
    const unsubGarment = useGarmentStore.subscribe((s, prev) => {
      if (!session || s.prep === prev.prep || !s.prep || s.prep.loadError) return;
      void (async () => {
        try {
          await session?.updateGarment(await garmentBitmap(), { garmentType: engineHandle.garmentType });
        } catch (err) {
          console.error('[realtime] garment swap failed', err);
          useRealtimeStore.getState().setError((err as Error).message);
        }
      })();
    });

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      unsubCamera();
      unsubGarment();
      void stopRealtime();
    };
  }, []);
}

export function useRealtimeTryOn() {
  const start = useCallback(() => startRealtime(), []);
  const stop = useCallback(() => stopRealtime(), []);
  return { start, stop };
}
