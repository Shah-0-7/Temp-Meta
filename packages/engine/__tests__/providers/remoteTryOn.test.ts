import { describe, it, expect, vi } from 'vitest';
import { RemoteTryOnGenerator } from '../../src/providers/tryon-generator/RemoteTryOnGenerator';
import { FallbackTryOnGenerator } from '../../src/providers/tryon-generator/FallbackTryOnGenerator';
import { ConsentDeclinedError } from '../../src/providers/tryon-generator/errors';
import {
  ContentPolicyError,
  NotConfiguredError,
  RateLimitError,
  type TryOnGenerator,
  type TryOnRequest,
  type TryOnResult,
} from '../../src/providers/types';

const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

const request = (): TryOnRequest => ({
  personFrame: new Blob(['person'], { type: 'image/png' }),
  garmentImages: [new Blob(['garment'], { type: 'image/png' })],
  garmentType: 'top',
});

const id = async (b: Blob) => b;

function remote(fetchFn: typeof fetch, consent = true) {
  const asked = vi.fn(async () => consent);
  const gen = new RemoteTryOnGenerator({
    endpoint: '/api/generate',
    label: 'Test model',
    requestConsent: asked,
    fetchFn,
    preparePerson: id,
    prepareGarment: id,
  });
  return { gen, asked };
}

const errorRes = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code, message: 'm' } }), { status, headers });

describe('RemoteTryOnGenerator', () => {
  it('asks for consent first and sends nothing when declined', async () => {
    const fetchFn = vi.fn();
    const { gen, asked } = remote(fetchFn as unknown as typeof fetch, false);
    await expect(gen.generate(request())).rejects.toBeInstanceOf(ConsentDeclinedError);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('posts person, garment and garment type as multipart, and returns the image', async () => {
    let sent: FormData | null = null;
    const fetchFn = (async (_u: string, init: RequestInit) => {
      sent = init.body as FormData;
      return new Response(png(), { status: 200, headers: { 'Content-Type': 'image/png' } });
    }) as unknown as typeof fetch;
    const { gen } = remote(fetchFn);
    const out = await gen.generate(request());
    expect(sent!.get('garmentType')).toBe('top');
    expect(sent!.get('person')).toBeInstanceOf(Blob);
    expect(sent!.get('garment')).toBeInstanceOf(Blob);
    expect(out.image.size).toBeGreaterThan(0);
    expect(out.metadata?.provider).toBe('Test model');
    expect(String(out.metadata?.note)).toMatch(/AI-generated/);
    expect(gen.sendsDataOffDevice).toBe(true);
  });

  it('maps 429 to RateLimitError with the Retry-After delay', async () => {
    const fetchFn = (async () => errorRes(429, 'quota_exhausted', { 'Retry-After': '300' })) as unknown as typeof fetch;
    const err = await remote(fetchFn).gen.generate(request()).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterMs).toBe(300_000);
  });

  it('maps a 404 (no model configured) to NotConfiguredError and policy refusals to ContentPolicyError', async () => {
    const notFound = (async () => errorRes(404, 'feature_disabled')) as unknown as typeof fetch;
    expect(await remote(notFound).gen.generate(request()).catch((e) => e)).toBeInstanceOf(NotConfiguredError);
    const policy = (async () => errorRes(422, 'content_policy')) as unknown as typeof fetch;
    expect(await remote(policy).gen.generate(request()).catch((e) => e)).toBeInstanceOf(ContentPolicyError);
  });

  it('rejects a reply that is not an image', async () => {
    const fetchFn = (async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } })) as unknown as typeof fetch;
    const err = await remote(fetchFn).gen.generate(request()).catch((e) => e);
    expect(err.name).toBe('RemoteTryOnError');
  });

  it('reports network failures without leaking detail', async () => {
    const fetchFn = (async () => {
      throw new TypeError('connect ECONNREFUSED 10.0.0.5:3001');
    }) as unknown as typeof fetch;
    const err = await remote(fetchFn).gen.generate(request()).catch((e) => e);
    expect(err.code).toBe('network');
    expect(err.message).not.toContain('10.0.0.5');
  });

  it('does not support refinement', async () => {
    const { gen } = remote((async () => errorRes(500, 'x')) as unknown as typeof fetch);
    expect(gen.supportsRefinement()).toBe(false);
    await expect(gen.refine()).rejects.toBeInstanceOf(NotConfiguredError);
  });
});

function stub(name: string, generate: () => Promise<TryOnResult>): TryOnGenerator & { init: number } {
  const g = {
    init: 0,
    name,
    capabilities: ['tryon-generator'] as const,
    async initialize() {
      g.init++;
    },
    async dispose() {},
    supportsRefinement: () => false,
    refine: async () => {
      throw new Error('no');
    },
    generate,
  };
  return g as unknown as TryOnGenerator & { init: number };
}

const ok = (provider: string): TryOnResult => ({ image: png(), metadata: { provider } });

describe('FallbackTryOnGenerator', () => {
  it('uses the primary result and never touches the fallback when it works', async () => {
    const primary = stub('remote', async () => ok('remote'));
    const local = stub('local', async () => ok('local'));
    const out = await new FallbackTryOnGenerator(primary, local).generate(request());
    expect(out.metadata?.provider).toBe('remote');
    expect(local.init).toBe(0);
  });

  it('falls back to the on-device render, explains why, and keeps the local provider name', async () => {
    const primary = stub('remote', async () => {
      throw new RateLimitError('x');
    });
    const local = stub('local', async () => ok('local'));
    const out = await new FallbackTryOnGenerator(primary, local).generate(request());
    expect(out.metadata?.provider).toBe('local');
    expect(String(out.metadata?.note)).toMatch(/busy or out of quota/);
    expect(out.metadata?.fellBackFrom).toBe('remote');
    expect(local.init).toBe(1);
  });

  it('explains a declined upload plainly', async () => {
    const primary = stub('remote', async () => {
      throw new ConsentDeclinedError();
    });
    const out = await new FallbackTryOnGenerator(primary, stub('local', async () => ok('local'))).generate(request());
    expect(String(out.metadata?.note)).toMatch(/chose not to send/);
  });

  it('does NOT swallow a content-policy refusal', async () => {
    const primary = stub('remote', async () => {
      throw new ContentPolicyError('x');
    });
    const local = stub('local', async () => ok('local'));
    const err = await new FallbackTryOnGenerator(primary, local).generate(request()).catch((e) => e);
    expect(err).toBeInstanceOf(ContentPolicyError);
    expect(local.init).toBe(0);
  });

  it('initialises the fallback only once across several failures', async () => {
    const primary = stub('remote', async () => {
      throw new Error('down');
    });
    const local = stub('local', async () => ok('local'));
    const g = new FallbackTryOnGenerator(primary, local);
    await g.generate(request());
    await g.generate(request());
    expect(local.init).toBe(1);
  });

  it('inherits the off-device flag from the primary', () => {
    const { gen } = remote((async () => errorRes(500, 'x')) as unknown as typeof fetch);
    expect(new FallbackTryOnGenerator(gen, stub('local', async () => ok('local'))).sendsDataOffDevice).toBe(true);
  });
});
