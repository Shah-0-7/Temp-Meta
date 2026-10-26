/**
 * @module server/services/imageProxy
 *
 * HMAC-signed image proxy.
 * Prevents hot-linking abuse and gives us a stable URL for caching.
 *
 * Signing: HMAC-SHA256(secret, url) → hex → URL-safe base64 trim to 16 chars
 * Route:   GET /api/proxy?url=<encoded>&sig=<hmac>
 *
 * The proxy:
 *  1. Validates the HMAC signature
 *  2. Runs the URL through safeFetch (SSRF protection)
 *  3. Streams the image back with appropriate headers
 *  4. Sets cache headers (1 hour CDN, 24hr browser)
 */

import { createHmac } from 'crypto';
import { safeFetch, SSRFError } from './ssrfGuard.js';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

/**
 * Sign a URL for use with the proxy endpoint.
 */
export function signProxyUrl(imageUrl: string, secret: string): string {
  const sig = createHmac('sha256', secret)
    .update(imageUrl)
    .digest('base64url')
    .slice(0, 16);
  return sig;
}

/**
 * Build a full proxy URL (for use by the web client).
 */
export function buildProxyUrl(imageUrl: string, secret: string, origin: string): string {
  const sig = signProxyUrl(imageUrl, secret);
  const params = new URLSearchParams({ url: imageUrl, sig });
  return `${origin}/api/proxy?${params}`;
}

/**
 * Verify the signature on an incoming proxy request.
 * Returns true if valid, false if tampered/expired.
 */
export function verifyProxySignature(imageUrl: string, sig: string, secret: string): boolean {
  const expected = signProxyUrl(imageUrl, secret);
  // Timing-safe compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Fetch and return an image through the proxy.
 * Returns the response ready to stream.
 *
 * @throws SSRFError | Error
 */
export async function proxyImage(imageUrl: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: string | null;
}> {
  let response: Response;
  try {
    response = await safeFetch(imageUrl, {
      maxRedirects: 3,
      timeoutMs: 15_000,
      maxBytes: MAX_IMAGE_BYTES,
    });
  } catch (err) {
    if (err instanceof SSRFError) throw err;
    throw new Error(`Failed to fetch image: ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`Upstream returned HTTP ${response.status}`);
  }

  const rawContentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const contentType = ALLOWED_CONTENT_TYPES.has(rawContentType) ? rawContentType : 'image/jpeg';

  // Validate size
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large: ${contentLength} bytes`);
  }

  if (!response.body) {
    throw new Error('No response body from upstream');
  }

  return {
    body: response.body,
    contentType,
    contentLength,
  };
}
