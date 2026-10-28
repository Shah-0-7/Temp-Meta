/**
 * @module server/index
 *
 * TryAnywhere API server — Hono on Node.
 * Responsibilities: URL resolving, image proxy, Meta API calls, rate limiting.
 * API keys never leave this process.
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createHmac } from 'crypto';
import { loadConfig } from './config.js';
import { resolveProductUrl } from './services/urlResolver.js';
import { verifyProxySignature, proxyImage } from './services/imageProxy.js';
import { SSRFError } from './services/ssrfGuard.js';
import { handleToken, RateLimiter } from './services/realtimeToken.js';

const config = loadConfig();
const app = new Hono();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use('*', logger());
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
    },
  }),
);

// ---------------------------------------------------------------------------
// POST /api/resolve
// ---------------------------------------------------------------------------

app.post('/api/resolve', async (c) => {
  let body: { url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { url } = body;
  if (!url || typeof url !== 'string') {
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
    const message = (err as Error).message;
    console.error('[resolve] Error:', message);
    return c.json({ error: `Failed to resolve URL: ${message}` }, 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/proxy
// ---------------------------------------------------------------------------

app.get('/api/proxy', async (c) => {
  const imageUrl = c.req.query('url');
  const sig = c.req.query('sig');

  if (!imageUrl || !sig) {
    return c.json({ error: 'Missing url or sig parameter' }, 400);
  }

  if (!verifyProxySignature(imageUrl, sig, config.proxySecret)) {
    return c.json({ error: 'Invalid or tampered signature' }, 403);
  }

  try {
    const { body, contentType, contentLength } = await proxyImage(imageUrl);

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=3600',
      'X-Content-Type-Options': 'nosniff',
    };
    if (contentLength) headers['Content-Length'] = contentLength;

    return new Response(body, { status: 200, headers });
  } catch (err) {
    if (err instanceof SSRFError) {
      return c.json({ error: `Blocked: ${err.message}` }, 422);
    }
    const message = (err as Error).message;
    console.error('[proxy] Error:', imageUrl, message);
    return c.json({ error: message }, 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/generate — Tier B (M5)
// ---------------------------------------------------------------------------

app.post('/api/generate', (c) =>
  c.json({ error: 'Not implemented yet — coming in M5' }, 501),
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
║  Meta: ${(config.meta.apiKey ? 'configured' : 'not configured').padEnd(33)}║
╚══════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port: config.port,
});

export default app;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProxyUrl(imageUrl: string, secret: string, origin: string): string {
  const sig = createHmac('sha256', secret)
    .update(imageUrl)
    .digest('base64url')
    .slice(0, 16);
  const params = new URLSearchParams({ url: imageUrl, sig });
  return `${origin}/api/proxy?${params}`;
}
