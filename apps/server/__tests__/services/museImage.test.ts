import { describe, it, expect } from 'vitest';
import { MuseImageBackend, redactKey, toBackendError } from '../../src/services/museImage';
import { BackendError } from '../../src/services/backendError';
import { handleGenerate, _resetInFlightForTests } from '../../src/services/freeTryOn';
import { RateLimiter } from '../../src/services/rateLimit';

function pngHeader(w: number, h: number, pad = 40): Uint8Array {
  const b = new Uint8Array(33 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0, 0, 0, 0]);
const RESULT = pngHeader(1536, 864, 100);
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

interface Call {
  url: string;
  init: RequestInit;
  body: any;
}

function fakeFetch(responses: Array<Response | Error>): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : null });
    const next = responses[Math.min(i++, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next.clone();
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const ok = () => new Response(JSON.stringify({ data: [{ b64_json: b64(RESULT) }], output_format: 'png' }), { status: 200 });
const err = (status: number, error: object | null, headers: Record<string, string> = {}) =>
  new Response(error ? JSON.stringify({ error }) : '', { status, headers });

function make(responses: Array<Response | Error>, over: Record<string, unknown> = {}) {
  const f = fakeFetch(responses);
  const sleeps: number[] = [];
  const backend = new MuseImageBackend({
    apiKey: 'LLM_123_secretvalue',
    fetchFn: f.fetchFn,
    sleep: async (ms) => void sleeps.push(ms),
    ...over,
  });
  return { backend, calls: f.calls, sleeps };
}

const input = {
  person: new Blob([pngHeader(1280, 720)], { type: 'image/png' }),
  garment: new Blob([JPG], { type: 'image/jpeg' }),
  garmentType: 'top' as const,
};

async function failure(p: Promise<unknown>): Promise<BackendError> {
  try {
    await p;
  } catch (e) {
    return e as BackendError;
  }
  throw new Error('expected a failure');
}

describe('MuseImageBackend request', () => {
  it('posts to /images/edits with the documented shape', async () => {
    const { backend, calls } = make([ok()]);
    await backend.run(input);
    const c = calls[0];
    expect(c.url).toBe('https://api.meta.ai/v1/images/edits');
    expect(c.init.method).toBe('POST');
    const h = c.init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer LLM_123_secretvalue');
    expect(h['Content-Type']).toBe('application/json');
    expect(c.body.model).toBe('muse-image-1.0');
    expect(c.body.n).toBe(1);
    expect(c.body.response_format).toBe('b64_json');
    expect(c.body.output_format).toBe('png');
    expect(typeof c.body.prompt).toBe('string');
  });

  it('sends the garment first and the person second, each with its own mime type', async () => {
    const { backend, calls } = make([ok()]);
    await backend.run(input);
    const images = calls[0].body.images;
    expect(images).toHaveLength(2);
    expect(images[0].image_url.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(images[1].image_url.startsWith('data:image/png;base64,')).toBe(true);
    expect(Object.keys(images[0])).toEqual(['image_url']);
  });

  it('asks for the person photo\'s aspect ratio', async () => {
    const { backend, calls } = make([ok()]);
    await backend.run(input);
    expect(calls[0].body.size).toBe('1536x864');
  });

  it('omits size when the photo size cannot be read', async () => {
    const { backend, calls } = make([ok()]);
    await backend.run({ ...input, person: new Blob([JPG], { type: 'image/jpeg' }) });
    expect('size' in calls[0].body).toBe(false);
  });

  it('prompt mentions the garment kind and the reference order', async () => {
    const { backend, calls } = make([ok()]);
    await backend.run({ ...input, garmentType: 'outerwear' });
    const prompt = calls[0].body.prompt as string;
    expect(prompt).toContain('outerwear');
    expect(prompt).toContain('first reference image');
    expect(prompt).toContain('second reference image');
  });

  it('honours a custom model and base URL, and refuses a plain-http or credentialed one', () => {
    const { backend, calls } = make([ok()], { model: 'muse-image-2', baseUrl: 'https://example.test/v9/' });
    return backend.run(input).then(() => {
      expect(calls[0].url).toBe('https://example.test/v9/images/edits');
      expect(calls[0].body.model).toBe('muse-image-2');
      expect(() => new MuseImageBackend({ apiKey: 'k', baseUrl: 'http://evil.test/v1' })).toThrow('https');
      expect(() => new MuseImageBackend({ apiKey: 'k', baseUrl: 'https://u:p@x.test/v1' })).toThrow('credentials');
      expect(() => new MuseImageBackend({ apiKey: '' })).toThrow('key');
    });
  });

  it('supports tops and jackets only', () => {
    const { backend } = make([ok()]);
    expect(backend.supports('top')).toBe(true);
    expect(backend.supports('outerwear')).toBe(true);
    expect(backend.supports('dress')).toBe(false);
  });
});

describe('MuseImageBackend result', () => {
  it('decodes the image and names the provider', async () => {
    const { backend } = make([ok()]);
    const out = await backend.run(input);
    expect(out.contentType).toBe('image/png');
    expect(out.provider).toBe('Meta Muse Image');
    expect(out.bytes.length).toBe(RESULT.length);
  });

  it('rejects an empty data list, a non-image payload and invalid JSON', async () => {
    const empty = make([new Response(JSON.stringify({ data: [] }), { status: 200 })]);
    expect((await failure(empty.backend.run(input))).kind).toBe('bad-response');

    const notImage = make([new Response(JSON.stringify({ data: [{ b64_json: b64(new Uint8Array([1, 2, 3, 4])) }] }), { status: 200 })]);
    expect((await failure(notImage.backend.run(input))).kind).toBe('bad-response');

    const badJson = make([new Response('<html>', { status: 200 })]);
    expect((await failure(badJson.backend.run(input))).kind).toBe('bad-response');
  });

  it('rejects an input that is not an image', async () => {
    const { backend, calls } = make([ok()]);
    const e = await failure(backend.run({ ...input, person: new Blob([new Uint8Array([1, 2, 3])]) }));
    expect(e.kind).toBe('bad-response');
    expect(calls).toHaveLength(0);
  });
});

describe('MuseImageBackend errors and retries', () => {
  it('maps a content-policy refusal and does not retry it', async () => {
    const { backend, calls } = make([err(400, { type: 'invalid_request_error', code: 'content_policy_violation', param: 'prompt', message: 'blocked' })]);
    expect((await failure(backend.run(input))).kind).toBe('policy');
    expect(calls).toHaveLength(1);
  });

  it('maps a policy refusal that only sets the type', async () => {
    const { backend } = make([err(400, { type: 'content_policy_violation', message: 'blocked' })]);
    expect((await failure(backend.run(input))).kind).toBe('policy');
  });

  it('maps 401 and 403 to auth, 402 to quota, other 400s to upstream, without retrying', async () => {
    for (const [status, kind] of [[401, 'auth'], [403, 'auth'], [402, 'quota'], [400, 'upstream'], [413, 'upstream']] as const) {
      const { backend, calls } = make([err(status, { type: 'x', message: 'm' })]);
      expect((await failure(backend.run(input))).kind).toBe(kind);
      expect(calls).toHaveLength(1);
    }
  });

  it('retries a 503 and succeeds, waiting for Retry-After when it is short', async () => {
    const { backend, calls, sleeps } = make([err(503, { type: 'server_error', message: 'busy' }, { 'retry-after': '2' }), ok()]);
    const out = await backend.run(input);
    expect(out.provider).toBe('Meta Muse Image');
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it('uses exponential backoff when there is no Retry-After, and gives up after maxRetries', async () => {
    const { backend, calls, sleeps } = make([err(500, { type: 'server_error', message: 'x' })]);
    const e = await failure(backend.run(input));
    expect(e.kind).toBe('upstream');
    expect(calls).toHaveLength(3); // 1 try + 2 retries
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(500);
    expect(sleeps[1]).toBeGreaterThanOrEqual(1000);
  });

  it('does not hold the person waiting on a long Retry-After', async () => {
    const { backend, calls, sleeps } = make([err(429, { type: 'rate_limit_error', message: 'slow down' }, { 'retry-after': '60' })]);
    expect((await failure(backend.run(input))).kind).toBe('quota');
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('retries a short 429', async () => {
    const { backend, calls } = make([err(429, null, { 'retry-after': '1' }), ok()]);
    await backend.run(input);
    expect(calls).toHaveLength(2);
  });

  it('does not simply retry a 504', async () => {
    const { backend, calls } = make([err(504, { type: 'gateway_timeout', message: 't' })]);
    expect((await failure(backend.run(input))).kind).toBe('timeout');
    expect(calls).toHaveLength(1);
  });

  it('turns a network failure into an upstream error', async () => {
    const { backend } = make([new TypeError('fetch failed')]);
    expect((await failure(backend.run(input))).kind).toBe('upstream');
  });

  it('enforces one deadline over the whole render', async () => {
    const slow = (async (_u: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        // Like real fetch: an already-aborted signal rejects at once.
        if (init.signal?.aborted) abort();
        else init.signal?.addEventListener('abort', abort);
      })) as unknown as typeof fetch;
    const backend = new MuseImageBackend({ apiKey: 'k', fetchFn: slow, timeoutMs: 50 });
    expect((await failure(backend.run(input))).kind).toBe('timeout');
  });

  it('stops when the caller aborts', async () => {
    const controller = new AbortController();
    const slow = (async (_u: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        // Like real fetch: an already-aborted signal rejects at once.
        if (init.signal?.aborted) abort();
        else init.signal?.addEventListener('abort', abort);
      })) as unknown as typeof fetch;
    const backend = new MuseImageBackend({ apiKey: 'k', fetchFn: slow });
    const pending = failure(backend.run(input, controller.signal));
    controller.abort();
    expect((await pending).kind).toBe('timeout');
  });
});

describe('secrets', () => {
  it('redacts anything shaped like a Meta key', () => {
    expect(redactKey('key LLM_1607358788850350_nx9abc.def~ghi was bad')).toBe('key LLM_[redacted] was bad');
  });

  it('never puts the key in an error message', async () => {
    const { backend } = make([err(401, { type: 'authentication_error', message: 'bad key LLM_123_secretvalue' })]);
    const e = await failure(backend.run(input));
    expect(e.message).not.toContain('secretvalue');
  });

  it('toBackendError tolerates an empty body', () => {
    expect(toBackendError(500, {}).kind).toBe('upstream');
  });
});

describe('through the /api/generate route', () => {
  async function post(backend: MuseImageBackend): Promise<Response> {
    _resetInFlightForTests();
    const form = new FormData();
    form.append('person', new Blob([pngHeader(1280, 720)], { type: 'image/png' }), 'p.png');
    form.append('garment', new Blob([pngHeader(500, 600)], { type: 'image/png' }), 'g.png');
    form.append('garmentType', 'top');
    const encoded = new Response(form);
    const bytes = new Uint8Array(await encoded.arrayBuffer());
    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      body: bytes,
      headers: { 'content-type': encoded.headers.get('content-type')!, 'content-length': String(bytes.length) },
    });
    return handleGenerate(req, { enabled: true, backend, limiter: new RateLimiter(100) });
  }

  it('returns the image with X-Provider', async () => {
    const res = await post(make([ok()]).backend);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-provider')).toBe('Meta Muse Image');
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('answers a policy refusal with 422 content_policy, which the browser treats as final', async () => {
    const res = await post(make([err(400, { code: 'content_policy_violation', message: 'x' })]).backend);
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('content_policy');
  });

  it('answers quota with 429 and hides the vendor detail', async () => {
    const res = await post(make([err(402, { message: 'out of LLM_123_secretvalue credit' })]).backend);
    expect(res.status).toBe(429);
    expect(JSON.stringify(await res.json())).not.toContain('secretvalue');
  });

  it('answers a rejected key with a generic 502', async () => {
    const res = await post(make([err(401, { message: 'bad key' })]).backend);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('upstream_failed');
  });
});
