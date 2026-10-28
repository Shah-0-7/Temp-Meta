/**
 * @module lib/appRegistry
 *
 * The one provider registry for the web app. Defaults all work offline. Optional
 * providers register on top only when the server reports them as available, so the
 * UI never offers a feature that cannot work.
 */

import {
  createAppRegistry,
  StillAnalyzer,
  resolveVisionAssets,
  DecartRealtimeTryOn,
  type ProviderRegistry,
} from '@tryanywhere/engine';
import { createDecartSdk } from './decartAdapter';

export const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface ServerFeatures {
  /** Live AI try-on (Decart) is enabled AND configured on the server. */
  realtimeTryOn: boolean;
  realtimeModel: string;
  realtimeMaxSessionSeconds: number;
}

const NONE: ServerFeatures = { realtimeTryOn: false, realtimeModel: '', realtimeMaxSessionSeconds: 300 };

let featuresPromise: Promise<ServerFeatures> | null = null;

/** Asks the server what is available. A missing server just means "nothing optional". */
export function getServerFeatures(): Promise<ServerFeatures> {
  featuresPromise ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return NONE;
      const f = (await res.json())?.features ?? {};
      return {
        realtimeTryOn: f.realtimeTryOn === true,
        realtimeModel: typeof f.realtimeModel === 'string' ? f.realtimeModel : '',
        realtimeMaxSessionSeconds:
          typeof f.realtimeMaxSessionSeconds === 'number' ? f.realtimeMaxSessionSeconds : NONE.realtimeMaxSessionSeconds,
      };
    } catch {
      return NONE;
    }
  })();
  return featuresPromise;
}

let registryPromise: Promise<ProviderRegistry> | null = null;
let analyzer: StillAnalyzer | null = null;

export function getAppRegistry(): Promise<ProviderRegistry> {
  registryPromise ??= (async () => {
    const features = await getServerFeatures();
    const registry = createAppRegistry({
      config: { providers: features.realtimeTryOn ? { 'realtime-tryon': 'decart' } : {} },
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

    if (features.realtimeTryOn) {
      registry.registerFactory(
        'decart',
        () =>
          new DecartRealtimeTryOn({
            enabled: true,
            maxSessionMs: features.realtimeMaxSessionSeconds * 1000,
            sdk: createDecartSdk({ tokenUrl: `${API_BASE}/api/token`, model: features.realtimeModel || 'lucy-vton-latest' }),
          }),
      );
    }
    return registry;
  })();
  return registryPromise;
}
