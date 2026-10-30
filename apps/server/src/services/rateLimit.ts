/**
 * @module server/services/rateLimit
 *
 * Small in-memory sliding-window limiter, keyed by client. Good enough for one
 * server process; put a shared store behind it if the server is ever scaled out.
 */

import { isIP } from 'node:net';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until a slot frees up (0 when allowed). */
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly _hits = new Map<string, number[]>();

  constructor(
    private readonly _limit: number,
    private readonly _windowMs = 60_000,
    private readonly _now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const now = this._now();
    const recent = (this._hits.get(key) ?? []).filter((t) => now - t < this._windowMs);

    if (recent.length >= this._limit) {
      this._hits.set(key, recent);
      return { allowed: false, limit: this._limit, remaining: 0, retryAfterMs: this._windowMs - (now - recent[0]) };
    }

    recent.push(now);
    this._hits.set(key, recent);
    if (this._hits.size > 5000) this._prune(now);
    return { allowed: true, limit: this._limit, remaining: this._limit - recent.length, retryAfterMs: 0 };
  }

  private _prune(now: number): void {
    for (const [k, v] of this._hits) {
      if (v.every((t) => now - t >= this._windowMs)) this._hits.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Client identity
// ---------------------------------------------------------------------------

let trustProxyHops = 0;
const peerAddresses = new WeakMap<Request, string>();

/**
 * How many reverse proxies sit in front of this server and append to `X-Forwarded-For`.
 * 0 (the default) means the header is ignored entirely: anyone can send it, so trusting it
 * would let a caller pick a fresh identity per request and walk past every limit.
 */
export function configureClientIp(options: { trustProxyHops: number }): void {
  trustProxyHops = Math.max(0, Math.floor(options.trustProxyHops) || 0);
}

/** Records the socket's remote address for a request (called once per request by the server). */
export function setClientAddress(req: Request, address: string | undefined): void {
  if (address) peerAddresses.set(req, address);
}

/**
 * The identity a request is rate limited under. With no trusted proxy it is the socket address.
 * With N trusted proxies it is the entry N places from the right of `X-Forwarded-For`, the one
 * the outermost proxy you control appended; anything to its left is client-supplied.
 */
export function clientKey(req: Request): string {
  const peer = peerAddresses.get(req) ?? 'local';
  if (trustProxyHops <= 0) return peer;
  const parts = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const candidate = parts[parts.length - trustProxyHops];
  return candidate && isIP(candidate) ? candidate : peer;
}
