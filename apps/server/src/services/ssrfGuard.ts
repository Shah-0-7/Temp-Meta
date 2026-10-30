/**
 * @module server/services/ssrfGuard
 *
 * SSRF (Server-Side Request Forgery) guard for everything this server fetches on a
 * stranger's behalf (product pages and images).
 *
 * What it enforces:
 *  - Only http(s), no embedded credentials, and only common web ports.
 *  - Addresses are classified numerically (not with string prefixes), so IPv4-mapped IPv6
 *    (`::ffff:127.0.0.1`), NAT64, 6to4, unique-local and the reserved IPv4 ranges are all caught.
 *  - The address is validated AT CONNECT TIME, inside the socket's own DNS lookup. A
 *    "resolve, check, then fetch again" design can be beaten by DNS rebinding (the name
 *    answers with a public address for the check and a private one for the connection);
 *    here the address that was checked is the address that is connected to.
 *  - Redirects are followed by hand and every hop is validated again.
 *  - The body is capped while streaming (a lying or missing Content-Length cannot get past it)
 *    and the deadline covers the whole download, not just the headers.
 *  - Compressed responses are decoded here and the cap is applied to the decoded bytes, so a
 *    small gzip cannot expand into memory.
 */

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http, { type IncomingMessage, type OutgoingHttpHeaders } from 'node:http';
import https from 'node:https';
import { isIPv4, isIPv6, type LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

export class SSRFError extends Error {
  constructor(reason: string) {
    super(`SSRF guard blocked request: ${reason}`);
    this.name = 'SSRFError';
  }
}

/** The remote body was larger than the caller's limit. */
export class ResponseTooLargeError extends Error {
  constructor(limit: number) {
    super(`The remote response is larger than the ${limit}-byte limit.`);
    this.name = 'ResponseTooLargeError';
  }
}

// ---------------------------------------------------------------------------
// Address classification
// ---------------------------------------------------------------------------

/** Blocked IPv4 ranges as [network, prefix length]. */
const BLOCKED_V4: ReadonlyArray<readonly [number, number]> = [
  [ip4(0, 0, 0, 0), 8], // "this network"
  [ip4(10, 0, 0, 0), 8], // private
  [ip4(100, 64, 0, 0), 10], // carrier-grade NAT
  [ip4(127, 0, 0, 0), 8], // loopback
  [ip4(169, 254, 0, 0), 16], // link-local, incl. cloud metadata (169.254.169.254)
  [ip4(172, 16, 0, 0), 12], // private
  [ip4(192, 0, 0, 0), 24], // IETF protocol assignments
  [ip4(192, 0, 2, 0), 24], // documentation
  [ip4(192, 88, 99, 0), 24], // 6to4 relay (deprecated)
  [ip4(192, 168, 0, 0), 16], // private
  [ip4(198, 18, 0, 0), 15], // benchmarking
  [ip4(198, 51, 100, 0), 24], // documentation
  [ip4(203, 0, 113, 0), 24], // documentation
  [ip4(224, 0, 0, 0), 4], // multicast
  [ip4(240, 0, 0, 0), 4], // reserved + broadcast
];

function ip4(a: number, b: number, c: number, d: number): number {
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function v4InBlockedRange(value: number): boolean {
  for (const [net, bits] of BLOCKED_V4) {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (((value & mask) >>> 0) === net) return true;
  }
  return false;
}

function parseV4(text: string): number | null {
  if (!isIPv4(text)) return null;
  const [a, b, c, d] = text.split('.').map(Number);
  return ip4(a, b, c, d);
}

/** Parses an IPv6 literal into eight 16-bit groups, or null when it is not one. */
function parseV6(text: string): number[] | null {
  if (!isIPv6(text)) return null;
  let s = text;
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);

  // An embedded dotted IPv4 tail (::ffff:1.2.3.4) becomes two hex groups.
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseV4(tail);
    if (v4 === null) return null;
    s = `${s.slice(0, lastColon + 1)}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => parseInt(g, 16));
  return out.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : out;
}

function v6Embedded(g: number[], hi: number): number {
  return (((g[hi] << 16) | g[hi + 1]) >>> 0);
}

function v6Blocked(g: number[]): boolean {
  const allZero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);

  // ::/96 covers "::" and "::1" and the deprecated IPv4-compatible form.
  if (allZero(0, 6)) return true;
  // ::ffff:0:0/96 IPv4-mapped: judged as the IPv4 address it wraps.
  if (allZero(0, 5) && g[5] === 0xffff) return v4InBlockedRange(v6Embedded(g, 6));
  // 64:ff9b::/96 NAT64: judged as the IPv4 address it wraps. 64:ff9b:1::/48 is local-use.
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    if (g[2] === 1) return true;
    if (allZero(2, 6)) return v4InBlockedRange(v6Embedded(g, 6));
  }
  // 100::/64 discard-only.
  if (g[0] === 0x100 && allZero(1, 4)) return true;
  // 2001::/32 Teredo, 2001:db8::/32 documentation, 2002::/16 6to4 (judged by the wrapped IPv4).
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0x0db8)) return true;
  if (g[0] === 0x2002) return v4InBlockedRange(v6Embedded(g, 1));
  // fc00::/7 unique-local, fe80::/10 link-local, fec0::/10 site-local (deprecated), ff00::/8 multicast.
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if ((g[0] & 0xffc0) === 0xfe80) return true;
  if ((g[0] & 0xffc0) === 0xfec0) return true;
  if ((g[0] & 0xff00) === 0xff00) return true;
  return false;
}

/**
 * True when `ip` is an IP literal in a private, loopback, link-local, multicast or otherwise
 * non-public range. A string that is not an IP literal (an ordinary hostname) returns false;
 * hostnames are validated at connect time instead.
 */
export function isPrivateIP(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '');
  const v4 = parseV4(clean);
  if (v4 !== null) return v4InBlockedRange(v4);
  const v6 = parseV6(clean);
  if (v6 !== null) return v6Blocked(v6);
  return false;
}

// ---------------------------------------------------------------------------
// Guarded fetch
// ---------------------------------------------------------------------------

export interface SafeFetchOptions {
  /** Max redirects to follow. Default: 3 */
  maxRedirects?: number;
  /** Deadline for the whole download, body included, in ms. Default: 10000 */
  timeoutMs?: number;
  /** Max body size in bytes (decoded). Default: 10MB */
  maxBytes?: number;
  /** User-Agent header */
  userAgent?: string;
  /** Abort from the caller (for example, the browser went away). */
  signal?: AbortSignal;
}

export interface GuardDeps {
  /** Decides whether an IP literal may not be contacted. Replaceable so tests can reach a local server. */
  isBlocked: (ip: string) => boolean;
  /** Replaceable DNS lookup, for tests. */
  dnsLookup?: typeof dnsLookup;
  /** Ports that may be contacted. Defaults to 80, 443, 8080 and 8443. */
  allowedPorts?: ReadonlySet<number>;
}

const DEFAULT_USER_AGENT = 'TryAnywhere/0.1 (image-resolver; +https://tryanywhere.dev/bot)';
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function checkUrl(url: URL, deps: GuardDeps): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SSRFError(`Disallowed protocol: ${url.protocol}`);
  }
  if (url.username || url.password) throw new SSRFError('URLs with credentials are not allowed');
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!(deps.allowedPorts ?? ALLOWED_PORTS).has(port)) throw new SSRFError(`Port ${port} is not allowed`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new SSRFError('Missing host');
  // Literal IPs skip DNS entirely, so they are checked here. Names are checked in the connect-time lookup.
  if ((isIPv4(host) || isIPv6(host)) && deps.isBlocked(host)) {
    throw new SSRFError(`Host "${host}" is a private IP`);
  }
}

/** A DNS lookup that refuses to hand the socket a blocked address. */
function guardedLookup(deps: GuardDeps): LookupFunction {
  const resolve = deps.dnsLookup ?? dnsLookup;
  return ((hostname: string, options: { all?: boolean; family?: number }, callback: (...args: unknown[]) => void) => {
    resolve(hostname, { ...options, all: true }, (err: Error | null, addresses: LookupAddress[]) => {
      if (err) return callback(new SSRFError(`Could not resolve host "${hostname}"`));
      if (!addresses?.length) return callback(new SSRFError(`Host "${hostname}" has no address`));
      for (const a of addresses) {
        if (deps.isBlocked(a.address)) {
          return callback(new SSRFError(`Host "${hostname}" resolves to private IP ${a.address}`));
        }
      }
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  }) as unknown as LookupFunction;
}

/** Turns a Node response into a web Response whose body errors out once `maxBytes` is passed. */
function toCappedResponse(res: IncomingMessage, maxBytes: number, done: () => void, finalUrl: string): Response {
  const response = buildCappedResponse(res, maxBytes, done);
  // A constructed Response has an empty `url`; callers need the post-redirect address to resolve relative links.
  Object.defineProperty(response, 'url', { value: finalUrl });
  return response;
}

function buildCappedResponse(res: IncomingMessage, maxBytes: number, done: () => void): Response {
  const status = res.statusCode ?? 502;
  const headers = new Headers();
  for (const [name, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    // The body is decoded below, so the encoding and the encoded length no longer describe it.
    if (name === 'content-encoding' || name === 'content-length' || name === 'transfer-encoding') continue;
    try {
      for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
    } catch {
      /* skip a header the runtime refuses */
    }
  }

  const bodyless = status === 204 || status === 205 || status === 304 || status < 200;
  if (bodyless) {
    res.resume();
    done();
    return new Response(null, { status, headers });
  }

  const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase().trim();
  let source: NodeJS.ReadableStream = res;
  if (encoding === 'gzip' || encoding === 'x-gzip') source = res.pipe(createGunzip());
  else if (encoding === 'deflate') source = res.pipe(createInflate());
  else if (encoding === 'br') source = res.pipe(createBrotliDecompress());
  if (source !== res) {
    res.on('error', (e) => (source as unknown as { destroy(e: Error): void }).destroy(e));
  }

  // The declared length is honoured only to fail fast; the byte count below is what is enforced.
  const declared = Number(res.headers['content-length']);
  if (!encoding && Number.isFinite(declared) && declared > maxBytes) {
    res.destroy();
    done();
    throw new ResponseTooLargeError(maxBytes);
  }

  let total = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      source.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          controller.error(new ResponseTooLargeError(maxBytes));
          res.destroy();
          (source as unknown as { destroy?: () => void }).destroy?.();
          done();
          return;
        }
        controller.enqueue(Uint8Array.from(chunk));
        if ((controller.desiredSize ?? 1) <= 0) source.pause();
      });
      source.on('end', () => {
        controller.close();
        done();
      });
      source.on('error', (e) => {
        controller.error(e);
        done();
      });
    },
    pull() {
      source.resume();
    },
    cancel() {
      res.destroy();
      (source as unknown as { destroy?: () => void }).destroy?.();
      done();
    },
  });
  return new Response(body, { status, headers });
}

function requestOnce(
  url: URL,
  deps: GuardDeps,
  headers: OutgoingHttpHeaders,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers,
        agent: false,
        lookup: guardedLookup(deps),
      },
      resolve,
    );
    const onAbort = () => req.destroy(new Error('aborted'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    req.on('error', (err) => reject(err));
    req.on('close', () => signal.removeEventListener('abort', onAbort));
    req.end();
  });
}

/**
 * Builds a guarded fetch. `safeFetch` below is the production instance; tests build one with a
 * relaxed `isBlocked` so they can talk to a local server.
 */
export function createSafeFetch(deps: GuardDeps) {
  return async function safeFetchImpl(url: string, opts: SafeFetchOptions = {}): Promise<Response> {
    const {
      maxRedirects = 3,
      timeoutMs = 10_000,
      maxBytes = 10 * 1024 * 1024,
      userAgent = DEFAULT_USER_AGENT,
      signal,
    } = opts;

    let current: URL;
    try {
      current = new URL(url);
    } catch {
      throw new SSRFError('Invalid URL');
    }

    const controller = new AbortController();
    const onCaller = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onCaller, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCaller);
    };

    try {
      for (let hop = 0; ; hop++) {
        checkUrl(current, deps);
        const res = await requestOnce(
          current,
          deps,
          {
            'User-Agent': userAgent,
            Accept: 'text/html,application/xhtml+xml,application/json,image/*;q=0.8,*/*;q=0.5',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
          },
          controller.signal,
        );

        if (res.statusCode && REDIRECT_STATUSES.has(res.statusCode)) {
          const location = res.headers.location;
          res.resume();
          res.destroy();
          if (hop >= maxRedirects) throw new SSRFError('Too many redirects');
          if (!location) throw new SSRFError('Redirect with no Location header');
          try {
            current = new URL(location, current);
          } catch {
            throw new SSRFError('Redirect to an invalid URL');
          }
          continue;
        }

        // From here the caller owns the body; the deadline and listeners are released when it ends.
        controller.signal.addEventListener('abort', () => res.destroy(new Error('aborted')), { once: true });
        return toCappedResponse(res, maxBytes, cleanup, current.href);
      }
    } catch (err) {
      cleanup();
      if (err instanceof SSRFError || err instanceof ResponseTooLargeError) throw err;
      // The lookup's SSRFError reaches us wrapped by the socket layer.
      const cause = (err as { cause?: unknown }).cause;
      if (cause instanceof SSRFError) throw cause;
      if (controller.signal.aborted) throw new Error('The remote site took too long to respond.');
      throw err;
    }
  };
}

/** Production guarded fetch. */
export const safeFetch = createSafeFetch({ isBlocked: isPrivateIP });
