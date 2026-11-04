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
  LocalTryOnGenerator,
  RemoteTryOnGenerator,
  FallbackTryOnGenerator,
  type LocalTryOnGeneratorOptions,
  type ProviderRegistry,
} from '@tryanywhere/engine';
import { createDecartSdk } from './decartAdapter';
import { API_BASE } from './api';
import { useConsentStore } from '../stores/consentStore';
import { describeRemote, type RemoteKind } from './remoteConsent';

export type { RemoteKind };

export interface ServerFeatures {
  /** Live AI try-on (Decart) is enabled AND configured on the server. */
  realtimeTryOn: boolean;
  realtimeModel: string;
  realtimeMaxSessionSeconds: number;
  /** A free hosted model is configured for Realistic Photo (needs the person's consent to use). */
  remoteTryOn: boolean;
  remoteTryOnLabel: string;
  /** Who receives the photo, in the order they are tried: Meta's Model API and/or a free community model. */
  remoteTryOnKinds: RemoteKind[];
}


const NONE: ServerFeatures = {
  realtimeTryOn: false,
  realtimeModel: '',
  realtimeMaxSessionSeconds: 300,
  remoteTryOn: false,
  remoteTryOnLabel: '',
  remoteTryOnKinds: [],
};

let featuresPromise: Promise<ServerFeatures> | null = null;

/** Asks the server what is available. A missing server just means "nothing optional". */
export function getServerFeatures(): Promise<ServerFeatures> {
  featuresPromise ??= (async () => {
    if (!API_BASE) return NONE;
    try {
      const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return NONE;
      const f = (await res.json())?.features ?? {};
      return {
        realtimeTryOn: f.realtimeTryOn === true,
        realtimeModel: typeof f.realtimeModel === 'string' ? f.realtimeModel : '',
        realtimeMaxSessionSeconds:
          typeof f.realtimeMaxSessionSeconds === 'number' ? f.realtimeMaxSessionSeconds : NONE.realtimeMaxSessionSeconds,
        remoteTryOn: f.remoteTryOn === true,
        remoteTryOnLabel: typeof f.remoteTryOnLabel === 'string' ? f.remoteTryOnLabel : '',
        remoteTryOnKinds: Array.isArray(f.remoteTryOnKinds)
          ? f.remoteTryOnKinds.filter((k: unknown): k is RemoteKind => k === 'meta' || k === 'free-community')
          : [],
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
    const local: LocalTryOnGeneratorOptions = {
      analyze: async (frame) => {
        if (!analyzer) {
          const { assets } = await resolveVisionAssets({ variant: 'full', localBase: import.meta.env.BASE_URL });
          analyzer = new StillAnalyzer(assets);
        }
        const a = await analyzer.analyze(frame);
        return a ? { landmarks: a.landmarks, occlusion: a.occlusion } : null;
      },
    };

    const providers: Record<string, string> = {};
    if (features.realtimeTryOn) providers['realtime-tryon'] = 'decart';
    if (features.remoteTryOn) providers['tryon-generator'] = 'remote-tryon';
    const registry = createAppRegistry({ config: { providers }, local });

    if (features.remoteTryOn) {
      registry.registerFactory(
        'remote-tryon',
        () =>
          // The online model first; the on-device renderer if it is declined, busy or down.
          new FallbackTryOnGenerator(
            new RemoteTryOnGenerator({
              endpoint: `${API_BASE}/api/generate`,
              label: features.remoteTryOnLabel || 'AI model',
              requestConsent: () =>
                useConsentStore.getState().ask({
                  key: 'remote-tryon',
                  ...describeRemote(features.remoteTryOnLabel, features.remoteTryOnKinds),
                }),
            }),
            new LocalTryOnGenerator(local),
          ),
      );
    }

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
