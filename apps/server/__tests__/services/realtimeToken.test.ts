import { describe, it, expect } from 'vitest';
import { handleToken, type TokenRouteDeps } from '../../src/services/realtimeToken';
import { RateLimiter, clientKey } from '../../src/services/rateLimit';

const req = (headers: Record<string, string> = {}) =>
  new Request('http://localhost:3001/api/token', { method: 'POST', headers });

function deps(over: Partial<TokenRouteDeps> = {}): TokenRouteDeps & { minted: unknown[] } {
  const minted: unknown[] = [];
  return {
    enabled: true,
    decartApiKey: 'dct_PERMANENT_SECRET',
    model: 'lucy-vton-latest',
    allowedOrigins: [],
    maxSessionSeconds: 300,
    limiter: new RateLimiter(3),
    mint: async (key, options) => {
      minted.push({ key, options });
      return { apiKey: 'short-lived-token', expiresAt: '2026-10-28T00:02:00Z' };
    },
    minted,
    ...over,
  };
}

describe('POST /api/token', () => {
  it('is hidden (404) when the feature flag is off and never mints', async () => {
    const d = deps({ enabled: false });
    const res = await handleToken(req(), d);
    expect(res.status).toBe(404);
    expect(d.minted).toHaveLength(0);
  });

  it('reports 503 when enabled but no Decart key is configured', async () => {
    const res = await handleToken(req(), deps({ decartApiKey: '' }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('not_configured');
  });

  it('returns a short-lived token and never the permanent key', async () => {
    const d = deps();
    const res = await handleToken(req(), d);
    const text = await res.clone().text();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.apiKey).toBe('short-lived-token');
    expect(body.model).toBe('lucy-vton-latest');
    expect(body.maxSessionSeconds).toBe(300);
    expect(text).not.toContain('PERMANENT');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((d.minted[0] as { options: { expiresIn: number } }).options.expiresIn).toBe(120);
  });

  it('passes allowedOrigins only when configured', async () => {
    const a = deps();
    await handleToken(req(), a);
    expect((a.minted[0] as { options: object }).options).not.toHaveProperty('allowedOrigins');

    const b = deps({ allowedOrigins: ['https://app.example.com'] });
    await handleToken(req(), b);
    expect((b.minted[0] as { options: { allowedOrigins: string[] } }).options.allowedOrigins).toEqual([
      'https://app.example.com',
    ]);
  });

  it('rate-limits per client with Retry-After', async () => {
    const d = deps();
    for (let i = 0; i < 3; i++) expect((await handleToken(req({ 'x-forwarded-for': '1.1.1.1' }), d)).status).toBe(200);
    const blocked = await handleToken(req({ 'x-forwarded-for': '1.1.1.1' }), d);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    // A different client is unaffected.
    expect((await handleToken(req({ 'x-forwarded-for': '2.2.2.2' }), d)).status).toBe(200);
  });

  it('hides vendor failure detail from the browser', async () => {
    const res = await handleToken(
      req(),
      deps({
        mint: async () => {
          throw new Error('upstream said key dct_PERMANENT_SECRET is bad');
        },
      }),
    );
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).not.toContain('PERMANENT');
  });
});

describe('RateLimiter', () => {
  it('frees slots as the window slides', () => {
    let now = 0;
    const l = new RateLimiter(2, 1000, () => now);
    expect(l.check('a').allowed).toBe(true);
    expect(l.check('a').allowed).toBe(true);
    const blocked = l.check('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    now = 1001;
    expect(l.check('a').allowed).toBe(true);
  });

  it('takes the first forwarded address as the client key', () => {
    expect(clientKey(req({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    expect(clientKey(req())).toBe('local');
  });
});
