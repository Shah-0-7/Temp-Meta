/**
 * @module hooks/useRealisticRender
 *
 * Snapshot -> render -> compare -> download, through the TryOnGenerator provider.
 * With no API key the registry resolves the LOCAL renderer (on-device, nothing
 * uploaded); once a Meta provider is configured it takes over through the same call.
 */

import { useCallback } from 'react';
import {
  createAppRegistry,
  StillAnalyzer,
  resolveVisionAssets,
  type ProviderRegistry,
  type TryOnGenerator,
  type TryOnRequest,
} from '@tryanywhere/engine';
import { getCameraManager } from './useCamera';
import { engineHandle } from './useEngine';
import { useCameraStore } from '../stores/cameraStore';
import { useGarmentStore } from '../stores/garmentStore';
import { useRenderStore } from '../stores/renderStore';

let registry: ProviderRegistry | null = null;
let analyzer: StillAnalyzer | null = null;

function getRegistry(): ProviderRegistry {
  if (registry) return registry;
  registry = createAppRegistry({
    local: {
      analyze: async (frame) => {
        if (!analyzer) {
          const { assets } = await resolveVisionAssets({ variant: 'full', localBase: import.meta.env.BASE_URL });
          analyzer = new StillAnalyzer(assets);
        }
        const a = await analyzer.analyze(frame);
        return a ? { landmarks: a.landmarks, occlusion: a.occlusion } : null;
      },
    },
  });
  return registry;
}

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
    useRenderStore.getState().begin(mirror);
    try {
      if (!useGarmentStore.getState().selectedGarment || !garment) {
        throw new Error('Pick a garment first (press G), then render.');
      }

      const person = await getPerson();
      useRenderStore.getState().setCaptured(URL.createObjectURL(person));

      const generator = (await getRegistry().resolve<TryOnGenerator>('tryon-generator')) as TryOnGenerator;
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
      useRenderStore.getState().setDone({
        afterBlob: result.image,
        provider: String(result.metadata?.provider ?? generator.name),
        note: typeof result.metadata?.note === 'string' ? result.metadata.note : null,
        elapsedMs: performance.now() - started,
      });
    } catch (err) {
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

  return { render, renderPhoto };
}
