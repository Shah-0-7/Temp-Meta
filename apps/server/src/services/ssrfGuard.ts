/**
 * @module server/services/ssrfGuard
 *
 * SSRF (Server-Side Request Forgery) guard.
 * Blocks requests to private/loopback IPs, limits redirects,
 * response size, and request timeout.
 */

import { URL } from 'url';

export class SSRFError extends Error {
  constructor(reason: string) {
    super(`SSRF guard blocked request: ${reason}`);
    this.name = 'SSRFError';
  }
}

/** Private/reserved CIDR blocks to block. */
const BLOCKED_RANGES = [
  // Loopback
  /^127\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  // Private
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // Link-local
  /^169\.254\./,
  /^fe80:/i,
  // Multicast / reserved
  /^224\./,
  /^240\./,
  // Internal metadata services
  /^100\.64\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
];

/**
 * Check if an IP address is in a private/blocked range.
 */
export function isPrivateIP(ip: string): boolean {
  // Strip IPv6 brackets
  const clean = ip.replace(/^\[|\]$/g, '');
  return BLOCKED_RANGES.some((re) => re.test(clean));
}

/**
 * Resolve a hostname to IPs and check none are private.
 * Uses Node's DNS resolver.
 */
async function checkHostNotPrivate(hostname: string): Promise<void> {
  const { promises: dns } = await import('dns');
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIP(addr.address)) {
        throw new SSRFError(`Host "${hostname}" resolves to private IP ${addr.address}`);
      }
    }
  } catch (err) {
    if (err instanceof SSRFError) throw err;
    // DNS failure — block to be safe
    throw new SSRFError(`Could not resolve host "${hostname}"`);
  }
}

export interface SafeFetchOptions {
  /** Max redirects to follow. Default: 3 */
  maxRedirects?: number;
  /** Request timeout in ms. Default: 10000 */
  timeoutMs?: number;
  /** Max response size in bytes. Default: 10MB */
  maxBytes?: number;
  /** User-Agent header */
  userAgent?: string;
}

const DEFAULT_USER_AGENT =
  'TryAnywhere/0.1 (image-resolver; +https://tryanywhere.dev/bot)';

/**
 * A safe fetch wrapper that enforces SSRF protections:
 * - Validates URL scheme (only http/https)
 * - Checks the resolved IP isn't private/loopback
 * - Limits redirects, response size, and timeout
 */
export async function safeFetch(
  url: string,
  opts: SafeFetchOptions = {},
): Promise<Response> {
  const {
    maxRedirects = 3,
    timeoutMs = 10_000,
    maxBytes = 10 * 1024 * 1024,
    userAgent = DEFAULT_USER_AGENT,
  } = opts;

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SSRFError(`Invalid URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SSRFError(`Disallowed protocol: ${parsed.protocol}`);
  }

  // Check hostname is not numeric private IP (fast path before DNS)
  if (isPrivateIP(parsed.hostname)) {
    throw new SSRFError(`Host "${parsed.hostname}" is a private IP`);
  }

  // DNS check (resolves hostname → IPs)
  await checkHostNotPrivate(parsed.hostname);

  // Fetch with redirect tracking and timeout
  let redirectsLeft = maxRedirects;
  let currentUrl = url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (true) {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/json,image/*;q=0.8,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      // Handle redirects manually to re-validate each hop
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirectsLeft-- <= 0) {
          throw new SSRFError('Too many redirects');
        }
        const location = response.headers.get('location');
        if (!location) throw new SSRFError('Redirect with no Location header');

        const nextUrl = new URL(location, currentUrl).href;
        const nextParsed = new URL(nextUrl);

        if (!['http:', 'https:'].includes(nextParsed.protocol)) {
          throw new SSRFError(`Redirect to disallowed protocol: ${nextParsed.protocol}`);
        }
        if (isPrivateIP(nextParsed.hostname)) {
          throw new SSRFError(`Redirect to private IP: ${nextParsed.hostname}`);
        }
        await checkHostNotPrivate(nextParsed.hostname);

        currentUrl = nextUrl;
        continue;
      }

      // Check response size via Content-Length header
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxBytes) {
        throw new SSRFError(`Response too large: ${contentLength} bytes (limit: ${maxBytes})`);
      }

      return response;
    }
  } finally {
    clearTimeout(timer);
  }
}
