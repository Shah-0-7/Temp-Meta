/**
 * @module lib/decartAdapter
 *
 * The ONLY file that imports the Decart SDK. It adapts the SDK to the engine's
 * vendor-neutral `RealtimeSdk` port. The browser never sees the permanent key:
 * `apiKeyProvider` fetches a short-lived token from our server before each connect.
 *
 * Calls follow https://docs.platform.decart.ai/sdks/javascript-realtime:
 * `createDecartClient({ apiKeyProvider })`, `client.realtime.connect(stream, { model, resolution,
 * onRemoteStream })`, `set({ prompt, image, enhance })` (omitted fields are cleared, so the
 * prompt and image are always sent together), events `connectionChange`, `error`, `generationTick`.
 */

import { createDecartClient, models } from '@decartai/sdk';
import type { RealtimeSdk, RealtimeState } from '@tryanywhere/engine';

export interface DecartAdapterOptions {
  /** Our server's token endpoint, e.g. http://localhost:3001/api/token */
  tokenUrl: string;
  /** Model id the server told us to use, e.g. lucy-vton-latest */
  model: string;
}

const STATES: readonly RealtimeState[] = ['connecting', 'connected', 'generating', 'reconnecting', 'disconnected'];

async function fetchToken(tokenUrl: string): Promise<string> {
  const res = await fetch(tokenUrl, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(body?.error?.message ?? `Token request failed (${res.status}).`) as Error & { code?: string };
    e.code = res.status === 429 ? 'RATE_LIMITED' : res.status === 404 || res.status === 503 ? 'INVALID_API_KEY' : undefined;
    throw e;
  }
  if (typeof body.apiKey !== 'string') throw new Error('The server returned no session token.');
  return body.apiKey;
}

export function createDecartSdk(options: DecartAdapterOptions): RealtimeSdk {
  return {
    async connect(stream, o) {
      const client = createDecartClient({ apiKeyProvider: () => fetchToken(options.tokenUrl) });

      const rt = await client.realtime.connect(stream, {
        model: models.realtime(options.model),
        resolution: o.resolution,
        // We mirror in CSS so the live view matches the normal preview.
        mirror: false,
        onRemoteStream: o.onRemoteStream,
      });

      rt.on('connectionChange', (s: string) => {
        if ((STATES as readonly string[]).includes(s)) o.onState(s as RealtimeState);
      });
      rt.on('error', (e: { code?: string; message?: string }) =>
        o.onError({ code: e.code, message: e.message ?? 'The live try-on failed.' }),
      );
      rt.on('generationTick', (t: { seconds: number }) => o.onBilledSeconds(t.seconds));

      // The first state change may have fired before we subscribed.
      const now = rt.getConnectionState();
      if ((STATES as readonly string[]).includes(now)) o.onState(now as RealtimeState);

      return {
        setGarment: (image, prompt) => rt.set({ prompt, image, enhance: false }),
        disconnect: () => rt.disconnect(),
      };
    },
  };
}
