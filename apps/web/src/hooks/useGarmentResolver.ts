/**
 * @module hooks/useGarmentResolver
 *
 * Turns a product link, an uploaded file or a pasted image into garment candidates.
 *  - Only the latest request counts: starting another (or leaving) cancels the one in flight, and a
 *    slow answer can never overwrite a newer pick.
 *  - A link is looked up through the app server, then the engine's ImageUnderstanding provider
 *    ranks the images, so the best garment photo is selected for the person automatically.
 *  - Falls back gracefully when the server is unreachable.
 */

import { useCallback } from 'react';
import { detectGarmentType, type GarmentType, type ImageUnderstanding } from '@tryanywhere/engine';
import { useGarmentStore } from '../stores/garmentStore';
import { API_BASE } from '../lib/api';
import { getAppRegistry } from '../lib/appRegistry';
import { mergeRanked, type ServerCandidate } from '../lib/garmentRanking';

/** Largest garment photo accepted from the device. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** The server waits up to ~10 s for the shop; this leaves room for slow networks. */
const RESOLVE_TIMEOUT_MS = 25_000;

let inFlight: AbortController | null = null;
let latest = 0;

/** Cancels any lookup in progress. */
export function cancelResolve(): void {
  inFlight?.abort();
  inFlight = null;
  latest++;
}

/** Orders candidates with the registered ImageUnderstanding provider; the server's order if that fails. */
async function rank(raw: ServerCandidate[], pageTitle?: string | null) {
  try {
    const registry = await getAppRegistry();
    const understanding = (await registry.resolve('image-understanding')) as ImageUnderstanding;
    return mergeRanked(raw, await understanding.rankCandidates(raw), pageTitle);
  } catch (err) {
    console.warn('[useGarmentResolver] ranking failed, keeping the page order:', err);
    return mergeRanked(raw, [], pageTitle);
  }
}

export function useGarmentResolver() {
  const resolveUrl = useCallback(async (url: string) => {
    const store = useGarmentStore.getState();
    if (!url.trim()) return;

    if (!API_BASE) {
      store.setResolveError(
        'Looking up product links needs the TryAnywhere server, which is not available here. Upload a garment photo or try a sample instead.',
      );
      return;
    }

    cancelResolve();
    const ticket = latest;
    const controller = new AbortController();
    inFlight = controller;
    const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

    store.setResolving(true);
    store.setResolveError(null);

    try {
      const response = await fetch(`${API_BASE}/api/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error: ${response.status}`);
      }

      const data = await response.json();
      const raw: ServerCandidate[] = Array.isArray(data.candidates) ? data.candidates : [];
      const ranked = raw.length > 0 ? await rank(raw, data.pageTitle) : [];
      if (ticket !== latest) return; // a newer request took over while this one was running

      useGarmentStore.getState().setCandidates(ranked, data.pageTitle);
      if (ranked.length > 0) useGarmentStore.getState().selectCandidate(0);
      else {
        useGarmentStore.getState().setResolveError(
          'No garment photos were found on that page. Try another link, or upload a photo.',
        );
      }
    } catch (err) {
      if (ticket !== latest) return;
      const message = (err as Error).message;
      const aborted = (err as Error).name === 'AbortError';

      if (aborted) {
        useGarmentStore.getState().setResolveError('That page took too long to answer. Try again, or upload a photo.');
      } else if (message.includes('Failed to fetch') || message.includes('ECONNREFUSED')) {
        // Server not running — fall back gracefully
        useGarmentStore.getState().setResolveError(
          'Server is not running. Start the server with "pnpm dev:server", or upload an image directly.',
        );
      } else {
        useGarmentStore.getState().setResolveError(message);
      }
    } finally {
      clearTimeout(timer);
      if (inFlight === controller) inFlight = null;
    }
  }, []);

  /** An image from the device: a file chosen, dropped or pasted. */
  const resolveFile = useCallback((file: File | Blob, name?: string) => {
    const store = useGarmentStore.getState();
    if (!file.type.startsWith('image/')) {
      store.setResolveError('That file is not an image. Choose a JPG, PNG or WebP photo of the garment.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      store.setResolveError(`That image is ${(file.size / 1048576).toFixed(0)} MB. Use one under ${MAX_UPLOAD_BYTES / 1048576} MB.`);
      return;
    }
    cancelResolve();

    const label = name ?? (file instanceof File ? file.name : 'Pasted image');
    const objectUrl = URL.createObjectURL(file);
    const guessed = detectGarmentType(label.replace(/\.[a-z0-9]+$/i, ''));
    const type: GarmentType = guessed.matched ? guessed.type : 'top';
    store.setCandidates([
      {
        url: objectUrl,
        proxyUrl: objectUrl, // local blob, no proxy needed
        alt: label,
        score: 1.0,
        garmentType: type,
        attributes: {},
      },
    ]);
    store.selectCandidate(0);
    store.setInputMode('upload');
  }, []);

  return { resolveUrl, resolveFile };
}
