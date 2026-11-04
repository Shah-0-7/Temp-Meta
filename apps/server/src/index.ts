/**
 * @module server/index
 *
 * TryAnywhere API server — Hono on Node.
 * Responsibilities: URL resolving, image proxy, Meta API calls, rate limiting.
 * API keys never leave this process.
 */

import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadEnv } from './loadEnv.js';
import { loadConfig } from './config.js';
import { resolveProductUrl } from './services/urlResolver.js';
import { verifyProxySignature, proxyImage, buildProxyUrl, UnsupportedImageError } from './services/imageProxy.js';
import { SSRFError, ResponseTooLargeError } from './services/ssrfGuard.js';
import { handleToken } from './services/realtimeToken.js';
import { RateLimiter, clientKey, configureClientIp, setClientAddress } from './services/rateLimit.js';
import { handleGenerate, LeffaSpaceBackend, type TryOnBackend } from './services/freeTryOn.js';
import { MuseImageBackend } from './services/museImage.js';
import { BackendChain } from './services/backendChain.js';
import { GradioClient } from './services/gradioClient.js';

loadEnv();
const config = loadConfig();
const app = new Hono();
configureClientIp({ trustProxyHops: config.trustProxyHops });

/** What the browser is told about each backend, so the consent dialog can describe where the photo goes. */
type BackendKind = 'meta' | 'free-community';

/**
 * The Realistic Photo backends named in PROVIDER_GENERATOR, in order. A backend that cannot start
 * (no key, bad URL) is skipped with a log line instead of crashing the server.
 */
function createBackends(): { backend: TryOnBackend | null; kinds: BackendKind[] } {
  const backends: TryOnBackend[] = [];
  const kinds: BackendKind[] = [];

  for (const name of config.generatorChain) {
    if (name === 'muse-image') {
      if (!config.meta.apiKey) {
        console.error('[generate] muse-image skipped: META_API_KEY is not set.');
        continue;
      }
      try {
        backends.push(
          new MuseImageBackend({
            apiKey: config.meta.apiKey,
            baseUrl: config.meta.baseUrl,
            model: config.meta.modelMuseImage,
            timeoutMs: config.museImage.timeoutMs,
          }),
        );
        kinds.push('meta');
      } catch (err) {
        console.error('[generate] muse-image disabled:', (err as Error).message);
      }
    } else if (name === 'leffa-space') {
      try {
        backends.push(
          new LeffaSpaceBackend({
            client: new GradioClient({
              baseUrl: config.freeTryOn.spaceUrl,
              token: config.freeTryOn.hfToken,
              timeoutMs: config.freeTryOn.timeoutMs,
            }),
            apiName: config.freeTryOn.apiName,
          }),
        );
        kinds.push('free-community');
      } catch (err) {
        console.error('[generate] free try-on disabled:', (err as Error).message);
      }
    } else if (name !== 'local' && name !== 'mock') {
      console.error(`[generate] unknown PROVIDER_GENERATOR entry "${name}" ignored.`);
    }
  }

  if (backends.length === 0) return { backend: null, kinds };
  return { backend: backends.length === 1 ? backends[0] : new BackendChain(backends), kinds };
}
const { backend: tryOnBackend, kinds: backendKinds } = createBackends();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use('*', logger());
// Rate limits key on the socket address (and X-Forwarded-For only when TRUST_PROXY_HOPS says to).
app.use('*', async (c: Context, next: () => Promise<void>) => {
  // @hono/node-server passes the Node request as `env.incoming`.
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  setClientAddress(c.req.raw, env?.incoming?.socket?.remoteAddress);
  await next();
});
app.use(
  '*',
  cors({
    origin: config.isDev ? '*' : config.allowedOrigins,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    version: '0.1.0',
    providers: config.providers,
    features: {
      // On only when the flag is set AND a key exists, so the UI never offers a dead feature.
      realtimeTryOn: config.decart.featureEnabled && !!config.decart.apiKey,
      realtimeModel: config.decart.model,
      realtimeMaxSessionSeconds: config.decart.maxSessionSeconds,
      metaConfigured: !!config.meta.apiKey,
      // The browser registers the remote generator only when this is true.
      remoteTryOn: !!tryOnBackend,
      remoteTryOnLabel: tryOnBackend?.label ?? '',
      // Where the photo goes, so the consent dialog can say so truthfully: 'meta' and/or 'free-community'.
      remoteTryOnKinds: backendKinds,
    },
  }),
);

// ---------------------------------------------------------------------------
// POST /api/resolve
// ---------------------------------------------------------------------------

const resolveLimiter = new RateLimiter(config.rateLimit.resolveRPM);
const proxyLimiter = new RateLimiter(config.rateLimit.proxyRPM);

function limited(c: Context, key: string, limiter: RateLimiter): Response | null {
  const rate = limiter.check(key);
  if (rate.allowed) return null;
  c.header('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
  return c.json({ error: 'Too many requests. Wait a moment and try again.' }, 429);
}

app.post('/api/resolve', async (c) => {
  const blocked = limited(c, clientKey(c.req.raw), resolveLimiter);
  if (blocked) return blocked;

  // Only a URL is expected, so anything bigger is not a legitimate request.
  const declared = Number(c.req.header('content-length') ?? 0);
  if (declared > 8 * 1024) return c.json({ error: 'Request too large' }, 413);

  let body: { url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { url } = body;
  if (!url || typeof url !== 'string' || url.length > 2048) {
    return c.json({ error: 'Missing or invalid "url" field' }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return c.json({ error: 'Only http and https URLs are supported' }, 400);
  }

  try {
    const result = await resolveProductUrl(url);
    const origin = new URL(c.req.url).origin;

    const candidatesWithProxy = result.candidates.map((candidate) => ({
      ...candidate,
      proxyUrl: buildProxyUrl(candidate.url, config.proxySecret, origin),
    }));

    return c.json({
      candidates: candidatesWithProxy,
      bestIndex: result.bestIndex,
      fromCache: result.fromCache,
      pageTitle: result.pageTitle,
    });
  } catch (err) {
    if (err instanceof SSRFError) {
      return c.json({ error: `Blocked: ${err.message}` }, 422);
    }
    if (err instanceof ResponseTooLargeError) return c.json({ error: 'That page is too large to read.' }, 413);
    const message = (err as Error).message;
    console.error('[resolve] Error:', message);
    return c.json({ error: `Failed to resolve URL: ${message}` }, 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/proxy
// ---------------------------------------------------------------------------

app.get('/api/proxy', async (c) => {
  const blocked = limited(c, clientKey(c.req.raw), proxyLimiter);
  if (blocked) return blocked;

  const imageUrl = c.req.query('url');
  const sig = c.req.query('sig');

  if (!imageUrl || !sig) {
    return c.json({ error: 'Missing url or sig parameter' }, 400);
  }

  if (!verifyProxySignature(imageUrl, sig, config.proxySecret)) {
    return c.json({ error: 'Invalid or tampered signature' }, 403);
  }

  try {
    const { body, contentType } = await proxyImage(imageUrl, c.req.raw.signal);

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=3600',
        'X-Content-Type-Options': 'nosniff',
        // The image is only ever drawn into the page; nothing in it should run.
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    if (err instanceof SSRFError) {
      return c.json({ error: `Blocked: ${err.message}` }, 422);
    }
    if (err instanceof ResponseTooLargeError) return c.json({ error: 'The image is too large.' }, 413);
    if (err instanceof UnsupportedImageError) return c.json({ error: err.message }, 415);
    const message = (err as Error).message;
    console.error('[proxy] Error:', imageUrl, message);
    return c.json({ error: message }, 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/generate: Tier B realistic photo via a free hosted model (M6)
// ---------------------------------------------------------------------------

const generateLimiter = new RateLimiter(config.rateLimit.generateRPM);

app.post('/api/generate', (c) =>
  handleGenerate(c.req.raw, {
    enabled: !!tryOnBackend,
    backend: tryOnBackend,
    limiter: generateLimiter,
    maxConcurrent: config.freeTryOn.maxConcurrent,
  }),
);

// ---------------------------------------------------------------------------
// POST /api/token — short-lived Decart client token (M8, behind FEATURE_REALTIME_TRYON)
// ---------------------------------------------------------------------------

const tokenLimiter = new RateLimiter(config.rateLimit.tokenRPM);

app.post('/api/token', (c) =>
  handleToken(c.req.raw, {
    enabled: config.decart.featureEnabled,
    decartApiKey: config.decart.apiKey,
    model: config.decart.model,
    allowedOrigins: config.isDev ? [] : config.allowedOrigins,
    maxSessionSeconds: config.decart.maxSessionSeconds,
    limiter: tokenLimiter,
  }),
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log(`
╔══════════════════════════════════════════╗
║  TryAnywhere API Server                  ║
║  Port: ${String(config.port).padEnd(33)}║
║  Env:  ${config.nodeEnv.padEnd(33)}║
║  AI:   ${(tryOnBackend ? tryOnBackend.label : 'off (on-device only)').slice(0, 33).padEnd(33)}║
╚══════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port: config.port,
});

export default app;
