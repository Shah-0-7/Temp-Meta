/**
 * @module hooks/useRealisticRender
 *
 * Snapshot -> render -> compare -> download, through the TryOnGenerator provider.
 * With no API key the registry resolves the LOCAL renderer (on-device, nothing
 * uploaded); once a Meta provider is configured it takes over through the same call.
 */

import { useCallback } from 'react';
import type { TryOnGenerator, TryOnRequest } from '@tryanywhere/engine';
import { getAppRegistry } from '../lib/appRegistry';
import { getCameraManager } from './useCamera';
import { engineHandle, captureLiveFrame } from './useEngine';
import { useAppStore } from '../stores/appStore';
import { useCameraStore } from '../stores/cameraStore';
import { useGarmentStore } from '../stores/garmentStore';
import { useRenderStore } from '../stores/renderStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import { startRender, isCurrentRender } from '../lib/renderRun';

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image.'))), 'image/png'),
  );
}

/** Lossless copy of the current camera frame, un-mirrored, at camera resolution. */
async function captureCameraFrame(): Promise<Blob> {
  const video = getCameraManager().video;
  if (!video || video.videoWidth === 0) throw new Error('The camera is not running.');
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d')!.drawImage(video, 0, 0);
  return canvasToBlob(c);
}

function friendlyError(err: unknown): string {
  const e = err as Error;
  switch (e?.name) {
    case 'NoPersonDetectedError':
    case 'PoseModelUnavailableError':
    case 'ContentPolicyError':
    case 'RateLimitError':
      return e.message;
    default:
      return e?.message || 'The render failed. Try again.';
  }
}

export function useRealisticRender() {
  /** Core flow. `live` = the person frame comes from the running camera (live landmarks are available). */
  const run = useCallback(async (getPerson: () => Promise<Blob>, mirror: boolean, live: boolean) => {
    const garment = engineHandle.garment;
    const ticket = startRender();
    useRenderStore.getState().begin(mirror);
    try {
      if (!useGarmentStore.getState().selectedGarment || !garment) {
        throw new Error('Pick a garment first (press G), then render.');
      }

      const person = await getPerson();
      if (!isCurrentRender(ticket)) return;
      useRenderStore.getState().setCaptured(URL.createObjectURL(person), person);

      const generator = (await (await getAppRegistry()).resolve<TryOnGenerator>('tryon-generator')) as TryOnGenerator;
      if (!isCurrentRender(ticket)) return;
      const latest = live ? engineHandle.latest : null;
      const request: TryOnRequest = {
        personFrame: person,
        garmentImages: [await canvasToBlob(garment.canvas)],
        garmentType: engineHandle.garmentType,
        // Empty landmarks = "no live data": the generator then relies on its own still analysis.
        tracking: {
          landmarks: latest?.pose?.landmarks ?? [],
          occlusion: latest?.occlusion ?? null,
          mirror,
          anchors: garment.anchors,
        },
      };

      const started = performance.now();
      const result = await generator.generate(request);
      // A newer render started, or the panel was closed, while this one ran: drop this result.
      if (!isCurrentRender(ticket)) return;
      const provider = String(result.metadata?.provider ?? generator.name);
      const note = typeof result.metadata?.note === 'string' ? result.metadata.note : null;
      useRenderStore.getState().setDone({
        afterBlob: result.image,
        provider,
        note,
        elapsedMs: performance.now() - started,
      });

      // Keep it for this session so outfits can be compared. Memory only.
      const picked = useGarmentStore.getState().selectedGarment;
      const thumb = picked?.proxyUrl ?? picked?.url ?? null;
      useSnapshotStore.getState().add({
        beforeBlob: person,
        afterBlob: result.image,
        mirrorBefore: mirror,
        provider,
        note,
        garmentLabel: picked?.alt?.trim() || 'Garment',
        // A blob: URL belongs to the garment store and may be revoked, so it is never borrowed here.
        garmentThumb: thumb && !thumb.startsWith('blob:') ? thumb : null,
      });
    } catch (err) {
      if (!isCurrentRender(ticket)) return;
      console.error('[useRealisticRender]', err);
      useRenderStore.getState().setError(friendlyError(err));
    }
  }, []);

  /** Snapshot the live camera and render it. */
  const render = useCallback(
    () => run(captureCameraFrame, useCameraStore.getState().mirror, true),
    [run],
  );

  /** Render an uploaded photo of the person (no camera needed). */
  const renderPhoto = useCallback(
    (file: File) => run(async () => file, false, false),
    [run],
  );

  /**
   * Quick photo: save what the mirror shows right now (live preview with the garment) to the
   * gallery. No AI, no upload, nothing leaves the device.
   */
  const quickPhoto = useCallback(async () => {
    const picked = useGarmentStore.getState().selectedGarment;
    if (!picked || !engineHandle.garment) {
      useAppStore.getState().showNotice('Pick a garment first (press G), then take a photo.');
      return;
    }
    if (!engineHandle.latest?.pose) {
      // Without a tracked body the mirror shows no garment, so a photo would be just the camera.
      useAppStore.getState().showNotice('I cannot see your shoulders yet, so the garment is not on you. Step into view, then try again.');
      return;
    }
    try {
      const [after, before] = await Promise.all([captureLiveFrame(), captureCameraFrame()]);
      const thumb = picked.proxyUrl ?? picked.url;
      useSnapshotStore.getState().add({
        beforeBlob: before,
        afterBlob: after,
        mirrorBefore: useCameraStore.getState().mirror,
        provider: 'Live preview',
        note: null,
        garmentLabel: picked.alt?.trim() || 'Garment',
        garmentThumb: thumb && !thumb.startsWith('blob:') ? thumb : null,
      });
      useAppStore.getState().showNotice('Saved to your gallery. Press V to see it or download it.');
    } catch (err) {
      useAppStore.getState().showNotice((err as Error).message || 'Could not take the photo.');
    }
  }, []);

  return { render, renderPhoto, quickPhoto };
}
