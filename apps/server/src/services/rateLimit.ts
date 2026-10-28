/**
 * @module server/services/rateLimit
 *
 * Small in-memory sliding-window limiter, keyed by client. Good enough for one
 * server process; put a shared store behind it if the server is ever scaled out.
 */

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

/** Best-effort client key. Behind a proxy, `x-forwarded-for` carries the real address. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : '') || 'local';
}
