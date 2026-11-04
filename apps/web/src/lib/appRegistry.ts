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

/** How long to wait for the server's answer. A sleeping free host can take most of a minute to wake. */
const HEALTH_TIMEOUT_MS = 20_000;

/**
 * Asks the server what is available. No server configured just means "nothing optional" and is
 * remembered. A server that is configured but did not answer (asleep, offline) is NOT remembered,
 * so the next call asks again instead of locking the session to the on-device renderer.
 */
export function getServerFeatures(): Promise<ServerFeatures> {
  if (!API_BASE) return Promise.resolve(NONE);
  if (featuresPromise) return featuresPromise;
  const attempt = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      } satisfies ServerFeatures;
    } catch {
      featuresPromise = null; // try again next time
      registryPromise = null; // and rebuild the registry with whatever the next answer says
      return NONE;
    }
  })();
  featuresPromise = attempt;
  return attempt;
}

/** Wakes the server early (a sleeping free host) so the first render does not wait for it. */
export function warmServer(): void {
  void getServerFeatures();
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
        return a ? { landmarks: a.landmarks, occlusion: a.occlusion, segmentation: a.segmentation } : null;
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
