import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleGenerate,
  sniffImage,
  LeffaSpaceBackend,
  _resetInFlightForTests,
  type GenerateRouteDeps,
  type TryOnBackend,
} from '../../src/services/freeTryOn';
import { GradioClient, GradioError } from '../../src/services/gradioClient';
import { RateLimiter } from '../../src/services/rateLimit';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

async function request(parts: Record<string, Blob | string | null> = {}, headers: Record<string, string> = {}): Promise<Request> {
  const form = new FormData();
  const all: Record<string, Blob | string | null> = {
    person: new Blob([JPG], { type: 'image/jpeg' }),
    garment: new Blob([PNG], { type: 'image/png' }),
    garmentType: 'top',
    ...parts,
  };
  for (const [k, v] of Object.entries(all)) {
    if (v === null) continue;
    if (typeof v === 'string') form.append(k, v);
    else form.append(k, v, `${k}.bin`);
  }
  // Serialise like a browser would, so the body and Content-Length are real.
  const encoded = new Response(form);
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    body: bytes,
    headers: { 'content-type': encoded.headers.get('content-type')!, 'content-length': String(bytes.length), ...headers },
  });
}

function backend(over: Partial<TryOnBackend> = {}): TryOnBackend & { runs: number } {
  const b = {
    runs: 0,
    label: 'Test model',
    supports: () => true,
    async run() {
      b.runs++;
      return { bytes: PNG, contentType: 'image/png' };
    },
    ...over,
  };
  return b as TryOnBackend & { runs: number };
}

function deps(over: Partial<GenerateRouteDeps> = {}): GenerateRouteDeps {
  return { enabled: true, backend: backend(), limiter: new RateLimiter(100), ...over };
}

beforeEach(() => _resetInFlightForTests());

describe('sniffImage', () => {
  it('recognises png, jpeg, webp and rejects others', () => {
    expect(sniffImage(PNG)).toBe('png');
    expect(sniffImage(JPG)).toBe('jpeg');
    expect(sniffImage(new TextEncoder().encode('RIFF....WEBPVP8 '))).toBe('webp');
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });
});

describe('POST /api/generate', () => {
  it('is hidden (404) when no free model is configured', async () => {
    const res = await handleGenerate(await request(), deps({ enabled: false, backend: null }));
    expect(res.status).toBe(404);
  });

  it('returns the generated image', async () => {
    const b = backend();
    const res = await handleGenerate(await request(), deps({ backend: b }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(b.runs).toBe(1);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it('requires both images and a known garment type', async () => {
    expect((await handleGenerate(await request({ person: null }), deps())).status).toBe(400);
    expect((await handleGenerate(await request({ garment: null }), deps())).status).toBe(400);
    expect((await handleGenerate(await request({ garmentType: 'cape' }), deps())).status).toBe(400);
  });

  it('refuses garment types the model does not support', async () => {
    const b = backend({ supports: (t) => t === 'top' });
    const res = await handleGenerate(await request({ garmentType: 'dress' }), deps({ backend: b }));
    expect(res.status).toBe(422);
    expect(b.runs).toBe(0);
  });

  it('refuses files that are not really images, whatever the declared type', async () => {
    const fake = new Blob(['<svg onload="alert(1)">'], { type: 'image/png' });
    const res = await handleGenerate(await request({ person: fake }), deps());
    expect(res.status).toBe(415);
  });

  it('refuses oversized images and bodies without a length', async () => {
    const big = new Blob([PNG, new Uint8Array(200)], { type: 'image/png' });
    expect((await handleGenerate(await request({ person: big }), deps({ maxImageBytes: 100 }))).status).toBe(413);
    expect((await handleGenerate(await request({}, { 'content-length': '999999999' }), deps())).status).toBe(413);
    const noLength = await request();
    noLength.headers.delete('content-length');
    expect((await handleGenerate(noLength, deps())).status).toBe(411);
  });

  it('rate limits per client with Retry-After', async () => {
    const d = deps({ limiter: new RateLimiter(1) });
    expect((await handleGenerate(await request(), d)).status).toBe(200);
    const second = await handleGenerate(await request(), d);
    expect(second.status).toBe(429);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('caps parallel upstream jobs to protect the free quota', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = backend({
      async run() {
        await gate;
        return { bytes: PNG, contentType: 'image/png' };
      },
    });
    const d = deps({ backend: slow, maxConcurrent: 1 });
    const first = handleGenerate(await request(), d);
    await new Promise((r) => setTimeout(r, 20));
    const second = await handleGenerate(await request(), d);
    expect(second.status).toBe(503);
    release();
    expect((await first).status).toBe(200);
  });

  it('maps quota exhaustion to 429, timeouts to 504, anything else to a generic 502', async () => {
    const fails = (err: Error) => deps({ backend: backend({ run: async () => { throw err; } }) });
    const quota = await handleGenerate(await request(), fails(new GradioError('quota', 'x')));
    expect(quota.status).toBe(429);
    expect((await quota.json()).error.code).toBe('quota_exhausted');
    expect((await handleGenerate(await request(), fails(new GradioError('timeout', 'x')))).status).toBe(504);
    const other = await handleGenerate(await request(), fails(new Error('Traceback hf_SECRET at /app/x.py')));
    expect(other.status).toBe(502);
    expect(JSON.stringify(await other.json())).not.toContain('hf_SECRET');
  });

  it('frees the concurrency slot after a failure', async () => {
    const failing = deps({ backend: backend({ run: async () => { throw new Error('boom'); } }), maxConcurrent: 1 });
    expect((await handleGenerate(await request(), failing)).status).toBe(502);
    expect((await handleGenerate(await request(), failing)).status).toBe(502); // not 503
  });
});

describe('LeffaSpaceBackend', () => {
  it('uploads both images, calls leffa_predict_vt with the Space defaults, and downloads the first output', async () => {
    const urls: string[] = [];
    let callBody: { data: unknown[] } | null = null;
    const fn = (async (url: string, init: RequestInit) => {
      urls.push(`${init.method} ${url}`);
      if (url.endsWith('/upload')) return new Response(JSON.stringify([`/tmp/${urls.length}.png`]), { headers: { 'Content-Type': 'application/json' } });
      if (init.method === 'POST') {
        callBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ event_id: 'e1' }));
      }
      if (url.includes('/call/')) {
        return new Response('event: complete\ndata: [{"url":"https://o-s.hf.space/gradio_api/file=/tmp/out.png"},{"url":"m"},{"url":"d"}]\n\n');
      }
      return new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
    }) as unknown as typeof fetch;

    const backend = new LeffaSpaceBackend({ client: new GradioClient({ baseUrl: 'https://o-s.hf.space', fetchFn: fn }) });
    const out = await backend.run({ person: new Blob([JPG]), garment: new Blob([PNG]), garmentType: 'outerwear' });

    expect(out.contentType).toBe('image/png');
    expect(urls[0]).toBe('POST https://o-s.hf.space/gradio_api/upload');
    expect(urls[2]).toBe('POST https://o-s.hf.space/gradio_api/call/leffa_predict_vt');
    const data = callBody!.data;
    expect(data).toHaveLength(9);
    expect((data[0] as { meta: { _type: string } }).meta._type).toBe('gradio.FileData');
    // acceleration, step, scale, seed, model type, garment type, repaint
    expect(data.slice(2)).toEqual([false, 30, 2.5, 42, 'viton_hd', 'upper_body', false]);
  });

  it('supports only tops and outerwear', () => {
    const b = new LeffaSpaceBackend({ client: new GradioClient({ baseUrl: 'https://o-s.hf.space' }) });
    expect(b.supports('top')).toBe(true);
    expect(b.supports('outerwear')).toBe(true);
    expect(b.supports('bottom')).toBe(false);
    expect(b.supports('dress')).toBe(false);
  });
});
