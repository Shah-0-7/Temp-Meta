/**
 * @module __tests__/providers/realtime.test
 *
 * Contract tests for RealtimeTryOn against DecartRealtimeTryOn with a fake SDK
 * (no network, no key). The NullRealtimeTryOn default is covered here too.
 */

import { describe, it, expect } from 'vitest';
import {
  DecartRealtimeTryOn,
  buildRealtimePrompt,
  type RealtimeSdk,
  type RealtimeSdkConnectOptions,
} from '../../src/providers/realtime-tryon/DecartRealtimeTryOn';
import { NullRealtimeTryOn } from '../../src/providers/realtime-tryon/NullRealtimeTryOn';
import { NotConfiguredError, RealtimeTryOnError } from '../../src/providers/types';
import type { RealtimeState } from '../../src/providers/types';

const stream = { id: 'camera' } as unknown as MediaStream;
const remote = { id: 'remote' } as unknown as MediaStream;
const garment = { width: 100, height: 100 } as unknown as ImageBitmap;
const toBlob = async () => new Blob(['garment'], { type: 'image/png' });

function fakeSdk(opts: { connectError?: { code?: string; message: string }; setError?: { code?: string; message: string } } = {}) {
  const calls: { garment: { blob: Blob; prompt: string }[]; disconnects: number; connectOptions?: RealtimeSdkConnectOptions } = {
    garment: [],
    disconnects: 0,
  };
  const sdk: RealtimeSdk = {
    async connect(_stream, o) {
      if (opts.connectError) throw opts.connectError;
      calls.connectOptions = o;
      o.onRemoteStream(remote);
      o.onState('connected');
      return {
        async setGarment(blob, prompt) {
          if (opts.setError) throw opts.setError;
          calls.garment.push({ blob, prompt });
        },
        disconnect() {
          calls.disconnects++;
        },
      };
    },
  };
  return { sdk, calls };
}

const make = (sdk: RealtimeSdk, extra: Partial<ConstructorParameters<typeof DecartRealtimeTryOn>[0]> = {}) =>
  new DecartRealtimeTryOn({ sdk, enabled: true, toBlob, ...extra });

describe('RealtimeTryOn contract: Null default', () => {
  it('is disabled and refuses to connect', async () => {
    const p = new NullRealtimeTryOn();
    expect(p.isFeatureEnabled()).toBe(false);
    await expect(p.connect(stream, garment, () => {})).rejects.toBeInstanceOf(NotConfiguredError);
  });
});

describe('RealtimeTryOn contract: DecartRealtimeTryOn (fake SDK)', () => {
  it('declares name, capability and that it sends data off device', () => {
    const p = make(fakeSdk().sdk);
    expect(p.name).toBe('decart');
    expect(p.capabilities).toContain('realtime-tryon');
    expect(p.sendsDataOffDevice).toBe(true);
  });

  it('refuses to connect when the feature flag is off', async () => {
    const { sdk, calls } = fakeSdk();
    const p = make(sdk, { enabled: false });
    expect(p.isFeatureEnabled()).toBe(false);
    await expect(p.connect(stream, garment, () => {})).rejects.toBeInstanceOf(NotConfiguredError);
    expect(calls.connectOptions).toBeUndefined();
  });

  it('connects, forwards the remote stream and sends garment with prompt together', async () => {
    const { sdk, calls } = fakeSdk();
    let got: MediaStream | null = null;
    const session = await make(sdk).connect(stream, garment, (s) => (got = s), { garmentType: 'top' });
    expect(got).toBe(remote);
    expect(calls.connectOptions?.resolution).toBe('720p');
    expect(calls.garment).toHaveLength(1);
    expect(calls.garment[0].prompt).toContain('Substitute the current top');
    expect(session.state).toBe('connected');
    session.disconnect();
  });

  it('reports state changes and billed seconds', async () => {
    const { sdk, calls } = fakeSdk();
    const session = await make(sdk).connect(stream, garment, () => {});
    const states: RealtimeState[] = [];
    const secs: number[] = [];
    session.onStateChange((s) => states.push(s));
    session.onBilledSeconds((s) => secs.push(s));
    calls.connectOptions!.onState('generating');
    calls.connectOptions!.onBilledSeconds(7);
    expect(states).toEqual(['generating']);
    expect(secs).toEqual([7]);
    expect(session.billedSeconds).toBe(7);
    session.disconnect();
    expect(states).toEqual(['generating', 'disconnected']);
  });

  it('swaps garments without reconnecting', async () => {
    const { sdk, calls } = fakeSdk();
    const session = await make(sdk).connect(stream, garment, () => {});
    await session.updateGarment(garment, { garmentType: 'hat', description: 'a red beanie' });
    expect(calls.garment).toHaveLength(2);
    expect(calls.garment[1].prompt).toContain('Add a red beanie');
    session.disconnect();
    await expect(session.updateGarment(garment)).rejects.toBeInstanceOf(RealtimeTryOnError);
  });

  it('disconnects the vendor client once and is idempotent', async () => {
    const { sdk, calls } = fakeSdk();
    const session = await make(sdk).connect(stream, garment, () => {});
    session.disconnect();
    session.disconnect();
    expect(calls.disconnects).toBe(1);
    expect(session.state).toBe('disconnected');
  });

  it('normalises connect failures', async () => {
    const p = make(fakeSdk({ connectError: { code: 'TOKEN_EXPIRED', message: 'x' } }).sdk);
    const err = await p.connect(stream, garment, () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(RealtimeTryOnError);
    expect(err.code).toBe('expired');
  });

  it('cleans up when the first garment cannot be sent', async () => {
    const { sdk, calls } = fakeSdk({ setError: { code: 'INVALID_INPUT', message: 'bad image' } });
    const err = await make(sdk).connect(stream, garment, () => {}).catch((e) => e);
    expect(err.code).toBe('invalid-input');
    expect(calls.disconnects).toBe(1);
  });

  it('surfaces mid-session vendor errors as neutral errors', async () => {
    const { sdk, calls } = fakeSdk();
    const session = await make(sdk).connect(stream, garment, () => {});
    const seen: RealtimeTryOnError[] = [];
    session.onError((e) => seen.push(e));
    calls.connectOptions!.onError({ code: 'WEB_RTC_ERROR', message: 'ice failed' });
    expect(seen[0].code).toBe('network');
    session.disconnect();
  });

  it('stops itself at the session limit', async () => {
    const { sdk, calls } = fakeSdk();
    const session = await make(sdk, { maxSessionMs: 15 }).connect(stream, garment, () => {});
    const seen: RealtimeTryOnError[] = [];
    session.onError((e) => seen.push(e));
    await new Promise((r) => setTimeout(r, 60));
    expect(seen.map((e) => e.code)).toEqual(['session-limit']);
    expect(session.state).toBe('disconnected');
    expect(calls.disconnects).toBe(1);
  });

  it('dispose() ends every open session', async () => {
    const { sdk, calls } = fakeSdk();
    const p = make(sdk);
    await p.connect(stream, garment, () => {});
    await p.dispose();
    expect(calls.disconnects).toBe(1);
  });
});

describe('buildRealtimePrompt', () => {
  it('uses Substitute for worn garments and Add for accessories', () => {
    expect(buildRealtimePrompt('outerwear')).toContain('Substitute the current jacket');
    expect(buildRealtimePrompt('glasses')).toMatch(/^Add /);
  });

  it('includes a description and the preservation clause', () => {
    const p = buildRealtimePrompt('top', ' a navy crew-neck t-shirt ');
    expect(p).toContain('a navy crew-neck t-shirt');
    expect(p).toContain("face, hair, hands and background unchanged");
  });

  it('stays in the 20-30 word range the vendor recommends (plus a short description)', () => {
    const words = buildRealtimePrompt('top').split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(20);
    expect(words).toBeLessThanOrEqual(40);
  });
});
