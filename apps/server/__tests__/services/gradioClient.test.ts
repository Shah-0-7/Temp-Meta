import { describe, it, expect } from 'vitest';
import { GradioClient, GradioError, parseSse } from '../../src/services/gradioClient';

const BASE = 'https://owner-space.hf.space';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function fakeFetch(handler: Handler) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sse = (body: string) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

describe('parseSse', () => {
  it('parses events and ignores heartbeats without data', () => {
    const out = parseSse('event: heartbeat\ndata: null\n\nevent: complete\ndata: ["x"]\n\n');
    expect(out.map((e) => e.event)).toEqual(['heartbeat', 'complete']);
    expect(out[1].data).toBe('["x"]');
  });
  it('handles CRLF', () => {
    expect(parseSse('event: complete\r\ndata: [1]\r\n\r\n')[0].data).toBe('[1]');
  });
});

describe('GradioClient', () => {
  it('rejects non-https and credentialed base URLs', () => {
    expect(() => new GradioClient({ baseUrl: 'http://example.com' })).toThrow(/https/);
    expect(() => new GradioClient({ baseUrl: 'https://u:p@example.com' })).toThrow(/credentials/);
  });

  it('uploads a file and returns the server path', async () => {
    const { fn, calls } = fakeFetch(() => jsonRes(['/tmp/gradio/abc/person.jpg']));
    const c = new GradioClient({ baseUrl: BASE, fetchFn: fn });
    const path = await c.upload(new Blob(['x']), 'person.jpg');
    expect(path).toBe('/tmp/gradio/abc/person.jpg');
    expect(calls[0].url).toBe(`${BASE}/gradio_api/upload`);
    expect(calls[0].init.body).toBeInstanceOf(FormData);
  });

  it('submits then reads the SSE result', async () => {
    const { fn, calls } = fakeFetch((url, init) =>
      init.method === 'POST' ? jsonRes({ event_id: 'ev1' }) : sse('event: heartbeat\ndata: null\n\nevent: complete\ndata: [{"url":"u"}]\n\n'),
    );
    const c = new GradioClient({ baseUrl: BASE, fetchFn: fn });
    const out = await c.call('/leffa_predict_vt', [1, 2]);
    expect(out).toEqual([{ url: 'u' }]);
    expect(calls[0].url).toBe(`${BASE}/gradio_api/call/leffa_predict_vt`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ data: [1, 2] });
    expect(calls[1].url).toBe(`${BASE}/gradio_api/call/leffa_predict_vt/ev1`);
  });

  it('sends the token as a Bearer header', async () => {
    const { fn, calls } = fakeFetch(() => jsonRes(['p']));
    await new GradioClient({ baseUrl: BASE, token: 'hf_secret', fetchFn: fn }).upload(new Blob(['x']), 'a.png');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer hf_secret');
  });

  it('classifies a quota error from the stream', async () => {
    const { fn } = fakeFetch((_u, init) =>
      init.method === 'POST' ? jsonRes({ event_id: 'e' }) : sse('event: error\ndata: "You have exceeded your GPU quota (60s)."\n\n'),
    );
    const err = await new GradioClient({ baseUrl: BASE, fetchFn: fn }).call('x', []).catch((e) => e);
    expect(err).toBeInstanceOf(GradioError);
    expect(err.kind).toBe('quota');
  });

  it('classifies other stream errors as upstream and hides the detail', async () => {
    const { fn } = fakeFetch((_u, init) =>
      init.method === 'POST' ? jsonRes({ event_id: 'e' }) : sse('event: error\ndata: "Traceback: secret internals"\n\n'),
    );
    const err = await new GradioClient({ baseUrl: BASE, fetchFn: fn }).call('x', []).catch((e) => e);
    expect(err.kind).toBe('upstream');
    expect(err.message).not.toContain('secret');
  });

  it('maps HTTP 429 to quota and 500 to upstream', async () => {
    const c429 = new GradioClient({ baseUrl: BASE, fetchFn: fakeFetch(() => new Response('', { status: 429 })).fn });
    expect((await c429.call('x', []).catch((e) => e)).kind).toBe('quota');
    const c500 = new GradioClient({ baseUrl: BASE, fetchFn: fakeFetch(() => new Response('', { status: 500 })).fn });
    expect((await c500.call('x', []).catch((e) => e)).kind).toBe('upstream');
  });

  it('fails clearly when the stream ends without a result', async () => {
    const { fn } = fakeFetch((_u, init) => (init.method === 'POST' ? jsonRes({ event_id: 'e' }) : sse('event: heartbeat\ndata: null\n\n')));
    const err = await new GradioClient({ baseUrl: BASE, fetchFn: fn }).call('x', []).catch((e) => e);
    expect(err.kind).toBe('bad-response');
  });

  it('times out when the queue never answers, covering the body read', async () => {
    const { fn } = fakeFetch(
      (_u, init) =>
        init.method === 'POST'
          ? jsonRes({ event_id: 'e' })
          : // A stream that never ends, but honours abort like real fetch does.
            new Response(
              new ReadableStream({
                start(controller) {
                  init.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
                },
              }),
            ),
    );
    const err = await new GradioClient({ baseUrl: BASE, fetchFn: fn, timeoutMs: 50 }).call('x', []).catch((e) => e);
    expect(err.kind).toBe('timeout');
  });

  it('downloads an image from the Space host', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const { fn, calls } = fakeFetch(() => new Response(png, { headers: { 'Content-Type': 'image/png' } }));
    const c = new GradioClient({ baseUrl: BASE, fetchFn: fn });
    const out = await c.download({ url: `${BASE}/gradio_api/file=/tmp/a.png` });
    expect(out.contentType).toBe('image/png');
    expect(out.bytes.length).toBe(8);
    expect(calls[0].url).toBe(`${BASE}/gradio_api/file=/tmp/a.png`);
  });

  it('builds the file URL from a bare path', async () => {
    const { fn, calls } = fakeFetch(() => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/webp' } }));
    await new GradioClient({ baseUrl: BASE, fetchFn: fn }).download({ path: '/tmp/gradio/x/out.webp' });
    expect(calls[0].url).toBe(`${BASE}/gradio_api/file=tmp/gradio/x/out.webp`);
  });

  it('refuses to download from another host (no open fetcher)', async () => {
    const { fn, calls } = fakeFetch(() => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/png' } }));
    const err = await new GradioClient({ baseUrl: BASE, fetchFn: fn }).download({ url: 'http://169.254.169.254/latest' }).catch((e) => e);
    expect(err.kind).toBe('bad-response');
    expect(calls).toHaveLength(0);
  });

  it('refuses a non-image result and an oversized one', async () => {
    const html = fakeFetch(() => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })).fn;
    expect((await new GradioClient({ baseUrl: BASE, fetchFn: html }).download({ path: '/a' }).catch((e) => e)).kind).toBe('bad-response');
    const big = fakeFetch(() => new Response(new Uint8Array(100), { headers: { 'Content-Type': 'image/png' } })).fn;
    const c = new GradioClient({ baseUrl: BASE, fetchFn: big, maxDownloadBytes: 10 });
    expect((await c.download({ path: '/a' }).catch((e) => e)).kind).toBe('bad-response');
  });
});
