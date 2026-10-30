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
import { safeFetch, SSRFError, ResponseTooLargeError } from './ssrfGuard.js';

/** The upstream answered with something other than a supported image. */
export class UnsupportedImageError extends Error {
  constructor() {
    super('The link did not return a supported image.');
    this.name = 'UnsupportedImageError';
  }
}

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  // SVG is deliberately absent: it can carry script.
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
 * The body is capped while streaming, so no upstream can make this server buffer or relay more
 * than MAX_IMAGE_BYTES.
 *
 * @throws SSRFError | ResponseTooLargeError | UnsupportedImageError | Error
 */
export async function proxyImage(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
  let response: Response;
  try {
    response = await safeFetch(imageUrl, {
      maxRedirects: 3,
      timeoutMs: 20_000,
      maxBytes: MAX_IMAGE_BYTES,
      signal,
    });
  } catch (err) {
    if (err instanceof SSRFError || err instanceof ResponseTooLargeError) throw err;
    throw new Error(`Failed to fetch image: ${(err as Error).message}`);
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Upstream returned HTTP ${response.status}`);
  }

  // No guessing: an unknown or missing type is refused rather than relabelled as a JPEG.
  let contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType === 'image/jpg') contentType = 'image/jpeg'; // a common non-standard spelling
  if (!ALLOWED_CONTENT_TYPES.has(contentType) || !response.body) {
    await response.body?.cancel();
    throw new UnsupportedImageError();
  }

  return { body: response.body, contentType };
}
