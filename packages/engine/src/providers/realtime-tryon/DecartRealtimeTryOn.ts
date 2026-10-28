/**
 * @module providers/realtime-tryon/DecartRealtimeTryOn
 *
 * Optional Tier C: AI-generated live try-on through Decart's realtime API
 * (model `lucy-vton-latest`). Off by default behind a feature flag; each session
 * streams the user's camera to a third party and is billed per second, so the
 * UI must obtain consent first (`sendsDataOffDevice`) and this provider enforces
 * a maximum session length.
 *
 * Source: https://docs.platform.decart.ai/models/realtime/virtual-try-on and
 * https://docs.platform.decart.ai/sdks/javascript-realtime
 *
 * The engine never imports the vendor SDK. The app injects a thin adapter that
 * satisfies `RealtimeSdk` (see apps/web/src/lib/decartAdapter.ts), which keeps
 * vendor types out of the engine and makes this class testable with a fake.
 */

import type {
  GarmentType,
  ProviderCapability,
  RealtimeConnectOptions,
  RealtimeSession,
  RealtimeState,
  RealtimeTryOn,
} from '../types.js';
import { NotConfiguredError, RealtimeTryOnError } from '../types.js';

// ---------------------------------------------------------------------------
// Vendor-neutral SDK port
// ---------------------------------------------------------------------------

export interface RealtimeSdkConnectOptions {
  onRemoteStream: (stream: MediaStream) => void;
  resolution: '720p' | '1080p';
  /** Called with vendor-neutral lifecycle changes. */
  onState: (state: RealtimeState) => void;
  /** Called with seconds of generated video billed. */
  onBilledSeconds: (seconds: number) => void;
  /** Called with a vendor error `{ code, message }`. */
  onError: (error: { code?: string; message: string }) => void;
}

export interface RealtimeSdkClient {
  /** Replace the outfit. Must carry prompt AND image together (the vendor clears omitted fields). */
  setGarment(image: Blob, prompt: string): Promise<void>;
  disconnect(): void;
}

export interface RealtimeSdk {
  connect(stream: MediaStream, options: RealtimeSdkConnectOptions): Promise<RealtimeSdkClient>;
}

export interface DecartRealtimeOptions {
  sdk: RealtimeSdk;
  /** Master switch. False means `connect` refuses and the UI hides the feature. */
  enabled: boolean;
  /** Hard cap on one session so a forgotten tab cannot run up a bill. Default 5 minutes. */
  maxSessionMs?: number;
  /** ImageBitmap -> Blob sent to the vendor. Default: flatten on white, PNG. */
  toBlob?: (garment: ImageBitmap) => Promise<Blob>;
  /** Injectable for tests. */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

// ---------------------------------------------------------------------------
// Prompt (the docs recommend 20-30 words and the "Substitute" / "Add" patterns)
// ---------------------------------------------------------------------------

const ADD_TYPES: readonly GarmentType[] = ['hat', 'glasses'];

const NOUN: Record<GarmentType, string> = {
  top: 'top',
  outerwear: 'jacket',
  bottom: 'bottoms',
  dress: 'dress',
  hat: 'hat',
  glasses: 'glasses',
  shoes: 'shoes',
};

export function buildRealtimePrompt(garmentType: GarmentType = 'top', description?: string): string {
  const what = description?.trim() ? description.trim() : 'the garment in the reference image';
  const verb = ADD_TYPES.includes(garmentType)
    ? `Add ${what} from the reference image`
    : `Substitute the current ${NOUN[garmentType]} with ${what} from the reference image`;
  return `${verb}. Keep its exact color, print and fit. Keep the person's face, hair, hands and background unchanged.`;
}

/** Garments are cut out on transparency; the vendor wants a clean shot on a plain background. */
export async function flattenOnWhite(garment: ImageBitmap, maxSize = 1024): Promise<Blob> {
  const scale = Math.min(1, maxSize / Math.max(garment.width, garment.height));
  const w = Math.max(1, Math.round(garment.width * scale));
  const h = Math.max(1, Math.round(garment.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(garment, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the garment image.'))), 'image/png'),
  );
}

/** Vendor error codes -> neutral errors with plain-language messages. */
export function normalizeRealtimeError(code: string | undefined, message: string): RealtimeTryOnError {
  switch (code) {
    case 'INVALID_API_KEY':
      return new RealtimeTryOnError('auth', 'The live AI try-on key was rejected. Check the server configuration.');
    case 'TOKEN_EXPIRED':
      return new RealtimeTryOnError('expired', 'The live session token expired. Start the live try-on again.');
    case 'WEB_RTC_ERROR':
      return new RealtimeTryOnError('network', 'The live connection failed. Check your network and try again.');
    case 'INVALID_INPUT':
    case 'MODEL_NOT_FOUND':
      return new RealtimeTryOnError('invalid-input', message || 'The live try-on rejected the request.');
    default:
      return new RealtimeTryOnError('unknown', message || 'The live try-on failed.');
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class DecartRealtimeTryOn implements RealtimeTryOn {
  readonly name = 'decart';
  readonly capabilities: readonly ProviderCapability[] = ['realtime-tryon'];
  readonly sendsDataOffDevice = true;

  private readonly _sdk: RealtimeSdk;
  private readonly _enabled: boolean;
  private readonly _maxSessionMs: number;
  private readonly _toBlob: (g: ImageBitmap) => Promise<Blob>;
  private readonly _setTimeout: (fn: () => void, ms: number) => unknown;
  private readonly _clearTimeout: (h: unknown) => void;
  private _sessions = new Set<RealtimeSession>();

  constructor(options: DecartRealtimeOptions) {
    this._sdk = options.sdk;
    this._enabled = options.enabled;
    this._maxSessionMs = options.maxSessionMs ?? 5 * 60_000;
    this._toBlob = options.toBlob ?? ((g) => flattenOnWhite(g));
    this._setTimeout = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this._clearTimeout = options.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  async initialize(): Promise<void> {
    /* The SDK connects per session. */
  }

  async dispose(): Promise<void> {
    for (const s of [...this._sessions]) s.disconnect();
  }

  isFeatureEnabled(): boolean {
    return this._enabled;
  }

  async connect(
    stream: MediaStream,
    garment: ImageBitmap,
    onFrame: (stream: MediaStream) => void,
    options: RealtimeConnectOptions = {},
  ): Promise<RealtimeSession> {
    if (!this._enabled) {
      throw new NotConfiguredError(
        this.name,
        'Live AI try-on is turned off. Set FEATURE_REALTIME_TRYON=true and DECART_API_KEY on the server.',
      );
    }

    let state: RealtimeState = 'connecting';
    let billed = 0;
    let closed = false;
    const stateListeners = new Set<(s: RealtimeState) => void>();
    const errorListeners = new Set<(e: RealtimeTryOnError) => void>();
    const billedListeners = new Set<(s: number) => void>();
    let timer: unknown;

    const setState = (next: RealtimeState) => {
      if (state === next) return;
      state = next;
      stateListeners.forEach((l) => l(next));
    };
    const fail = (err: RealtimeTryOnError) => errorListeners.forEach((l) => l(err));

    const client = await this._sdk
      .connect(stream, {
        onRemoteStream: onFrame,
        resolution: options.resolution ?? '720p',
        onState: (s) => {
          if (!closed) setState(s);
        },
        onBilledSeconds: (s) => {
          billed = s;
          billedListeners.forEach((l) => l(s));
        },
        onError: (e) => fail(normalizeRealtimeError(e.code, e.message)),
      })
      .catch((err: unknown) => {
        const e = err as { code?: string; message?: string };
        throw normalizeRealtimeError(e?.code, e?.message ?? 'Could not start the live try-on.');
      });

    const send = async (img: ImageBitmap, type?: GarmentType, description?: string) => {
      const blob = await this._toBlob(img);
      await client.setGarment(blob, buildRealtimePrompt(type, description));
    };

    const session: RealtimeSession = {
      get state() {
        return state;
      },
      get billedSeconds() {
        return billed;
      },
      updateGarment: async (img, o) => {
        if (closed) throw new RealtimeTryOnError('unknown', 'The live session has ended.');
        await send(img, o?.garmentType, o?.description);
      },
      disconnect: () => {
        if (closed) return;
        closed = true;
        this._clearTimeout(timer);
        this._sessions.delete(session);
        try {
          client.disconnect();
        } finally {
          setState('disconnected');
        }
      },
      onStateChange: (l) => {
        stateListeners.add(l);
        return () => stateListeners.delete(l);
      },
      onError: (l) => {
        errorListeners.add(l);
        return () => errorListeners.delete(l);
      },
      onBilledSeconds: (l) => {
        billedListeners.add(l);
        return () => billedListeners.delete(l);
      },
    };

    this._sessions.add(session);
    timer = this._setTimeout(() => {
      fail(
        new RealtimeTryOnError(
          'session-limit',
          `Live try-on stopped after ${Math.round(this._maxSessionMs / 60_000)} minutes to limit usage. Start it again to continue.`,
        ),
      );
      session.disconnect();
    }, this._maxSessionMs);

    try {
      await send(garment, options.garmentType, options.description);
    } catch (err) {
      session.disconnect();
      const e = err as { code?: string; message?: string };
      throw normalizeRealtimeError(e?.code, e?.message ?? 'Could not send the garment to the live try-on.');
    }
    return session;
  }
}
