/**
 * @module server/services/realtimeToken
 *
 * `POST /api/token`: mints a SHORT-LIVED Decart client token for the browser so the
 * permanent `DECART_API_KEY` never leaves this process.
 *
 * Source: https://docs.platform.decart.ai/sdks/javascript (client tokens:
 * `client.tokens.create({ expiresIn, allowedOrigins })` returns `{ apiKey, expiresAt }`;
 * default lifetime 60 s, `expiresIn` 1 to 3600 s; active WebRTC sessions outlive the token).
 *
 * Framework-agnostic (Web `Request` -> `Response`) so it can be tested without Hono.
 * Model scoping (`allowedModels`) is deliberately not used: the docs show concrete model
 * ids, and `lucy-vton-latest` is an alias that has not been verified to match.
 */

import { RateLimiter, clientKey } from './rateLimit.js';

export interface MintedToken {
  apiKey: string;
  expiresAt?: string | number;
}

export interface MintOptions {
  expiresIn: number;
  allowedOrigins?: string[];
}

export type MintFn = (apiKey: string, options: MintOptions) => Promise<MintedToken>;

export interface TokenRouteDeps {
  /** FEATURE_REALTIME_TRYON */
  enabled: boolean;
  /** Permanent key. Never returned to the client. */
  decartApiKey: string;
  /** Model the browser should connect with. */
  model: string;
  /** Production origins the token is restricted to. Empty in dev. */
  allowedOrigins: string[];
  /** Max length of one live session, advertised to the client. */
  maxSessionSeconds: number;
  limiter: RateLimiter;
  mint?: MintFn;
}

const TOKEN_LIFETIME_S = 120;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Mints via the official SDK, loaded lazily so the server still boots without it. */
export const mintWithSdk: MintFn = async (apiKey, options) => {
  const name = '@decartai/sdk';
  let mod: { createDecartClient: (o: { apiKey: string }) => { tokens: { create: (o: MintOptions) => Promise<MintedToken> } } };
  try {
    mod = await import(/* @vite-ignore */ name);
  } catch {
    throw new Error('The @decartai/sdk package is not installed on the server. Run pnpm install.');
  }
  return mod.createDecartClient({ apiKey }).tokens.create(options);
};

export async function handleToken(req: Request, deps: TokenRouteDeps): Promise<Response> {
  if (!deps.enabled) {
    return json(404, { error: { code: 'feature_disabled', message: 'Live AI try-on is not enabled.' } });
  }
  if (!deps.decartApiKey) {
    return json(503, { error: { code: 'not_configured', message: 'Live AI try-on is not configured on the server.' } });
  }

  const rate = deps.limiter.check(clientKey(req));
  if (!rate.allowed) {
    return json(
      429,
      { error: { code: 'rate_limited', message: 'Too many live sessions started. Wait a moment and try again.' } },
      { 'Retry-After': String(Math.ceil(rate.retryAfterMs / 1000)) },
    );
  }

  try {
    const token = await (deps.mint ?? mintWithSdk)(deps.decartApiKey, {
      expiresIn: TOKEN_LIFETIME_S,
      ...(deps.allowedOrigins.length ? { allowedOrigins: deps.allowedOrigins } : {}),
    });
    if (!token?.apiKey) throw new Error('empty token');
    return json(200, {
      apiKey: token.apiKey,
      expiresAt: token.expiresAt ?? null,
      model: deps.model,
      maxSessionSeconds: deps.maxSessionSeconds,
    });
  } catch (err) {
    // Log the reason server-side; never echo vendor detail (or any key) to the browser.
    console.error('[token] mint failed:', String((err as Error).message).replace(/dct_\w+/g, 'dct_[redacted]'));
    return json(502, { error: { code: 'token_failed', message: 'Could not start a live session. Try again shortly.' } });
  }
}

export { RateLimiter };
