/**
 * @module hooks/useGarmentResolver
 *
 * Hook that calls POST /api/resolve, tracks loading state,
 * and populates the garment store with candidates.
 * Falls back gracefully when the server is unreachable.
 */

import { useCallback } from 'react';
import { useGarmentStore } from '../stores/garmentStore';

const SERVER_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function useGarmentResolver() {
  const store = useGarmentStore();

  const resolveUrl = useCallback(async (url: string) => {
    if (!url.trim()) return;

    store.setResolving(true);
    store.setResolveError(null);

    try {
      const response = await fetch(`${SERVER_BASE}/api/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error: ${response.status}`);
      }

      const data = await response.json();
      store.setCandidates(data.candidates ?? [], data.pageTitle);

      // Auto-select the best candidate
      if (data.candidates?.length > 0) {
        store.selectCandidate(data.bestIndex ?? 0);
      }
    } catch (err) {
      const message = (err as Error).message;

      // Server not running — fall back gracefully
      if (message.includes('Failed to fetch') || message.includes('ECONNREFUSED')) {
        store.setResolveError(
          'Server is not running. Start the server with "pnpm dev:server", or upload an image directly.',
        );
      } else {
        store.setResolveError(message);
      }
    }
  }, [store]);

  const resolveFile = useCallback((file: File) => {
    // Create an object URL for the uploaded file
    const objectUrl = URL.createObjectURL(file);
    store.setCandidates([
      {
        url: objectUrl,
        proxyUrl: objectUrl, // local blob, no proxy needed
        alt: file.name,
        score: 1.0,
        garmentType: 'top',
        attributes: {},
      },
    ]);
    store.selectCandidate(0);
    store.setInputMode('upload');
  }, [store]);

  return { resolveUrl, resolveFile };
}
