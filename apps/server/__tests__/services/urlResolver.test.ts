/**
 * @module __tests__/services/urlResolver.test
 *
 * Tests for URL resolver HTML parsing (no network calls).
 * Uses inline HTML fixtures to test each extraction strategy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the internal parsing logic. Since it's not exported separately,
// we test via resolveProductUrl with a mocked safeFetch.

// Mock the ssrfGuard module
vi.mock('../../src/services/ssrfGuard.js', () => ({
  safeFetch: vi.fn(),
  SSRFError: class SSRFError extends Error {
    constructor(msg: string) { super(msg); this.name = 'SSRFError'; }
  },
}));

import { safeFetch } from '../../src/services/ssrfGuard.js';
import { resolveProductUrl } from '../../src/services/urlResolver.js';

const mockFetch = vi.mocked(safeFetch);

function makeMockResponse(html: string, contentType = 'text/html'): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    text: async () => html,
  } as unknown as Response;
}

describe('resolveProductUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts images from JSON-LD Product schema', async () => {
    const html = `
      <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org/",
          "@type": "Product",
          "name": "Blue T-Shirt",
          "image": [
            "https://example.com/images/blue-tshirt-front.jpg",
            "https://example.com/images/blue-tshirt-back.jpg"
          ]
        }
        </script>
      </head>
      <body></body>
      </html>
    `;
    mockFetch.mockResolvedValue(makeMockResponse(html));

    const result = await resolveProductUrl('https://shop.example.com/product/blue-tshirt');
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.candidates[0].url).toBe('https://example.com/images/blue-tshirt-front.jpg');
  });

  it('extracts og:image and og:image:alt', async () => {
    const html = `
      <html>
      <head>
        <meta property="og:image" content="https://cdn.example.com/product.jpg" />
        <meta property="og:image:alt" content="Red Hoodie front view" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="1200" />
        <title>Red Hoodie – ExampleStore</title>
      </head>
      <body></body>
      </html>
    `;
    mockFetch.mockResolvedValue(makeMockResponse(html));

    const result = await resolveProductUrl('https://shop.example.com/product/red-hoodie');
    const ogCandidate = result.candidates.find((c) =>
      c.url === 'https://cdn.example.com/product.jpg',
    );
    expect(ogCandidate).toBeDefined();
    expect(ogCandidate?.alt).toBe('Red Hoodie front view');
    expect(ogCandidate?.width).toBe(1200);
    expect(result.pageTitle).toBe('Red Hoodie – ExampleStore');
  });

  it('extracts <img> tags with src', async () => {
    const html = `
      <html>
      <body>
        <img src="/images/product1.jpg" alt="Front view" width="800" height="800" />
        <img src="/images/product2.jpg" alt="Back view" />
        <img src="data:image/gif;base64,R0l..." alt="spacer" />
      </body>
      </html>
    `;
    mockFetch.mockResolvedValue(makeMockResponse(html));

    const result = await resolveProductUrl('https://shop.example.com/product');
    // Should include img tags but not data URIs
    const hasProduct1 = result.candidates.some((c) =>
      c.url.includes('/images/product1.jpg'),
    );
    const hasProduct2 = result.candidates.some((c) =>
      c.url.includes('/images/product2.jpg'),
    );
    const hasDataUri = result.candidates.some((c) => c.url.startsWith('data:'));
    expect(hasProduct1).toBe(true);
    expect(hasProduct2).toBe(true);
    expect(hasDataUri).toBe(false);
  });

  it('resolves relative img URLs against the base URL', async () => {
    const html = `
      <html><body><img src="/images/shirt.jpg" alt="Shirt" /></body></html>
    `;
    mockFetch.mockResolvedValue(makeMockResponse(html));

    const result = await resolveProductUrl('https://example.com/products/shirt');
    expect(result.candidates[0].url).toBe('https://example.com/images/shirt.jpg');
  });

  it('handles direct image URLs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      text: async () => '',
    } as unknown as Response);

    const result = await resolveProductUrl('https://cdn.example.com/product.jpg');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].url).toBe('https://cdn.example.com/product.jpg');
  });

  it('de-duplicates the same image from multiple sources', async () => {
    const html = `
      <html>
      <head>
        <script type="application/ld+json">
          {"@type":"Product","name":"Jeans","image":"https://cdn.example.com/jeans.jpg"}
        </script>
        <meta property="og:image" content="https://cdn.example.com/jeans.jpg" />
      </head>
      <body>
        <img src="https://cdn.example.com/jeans.jpg" alt="Jeans" />
      </body>
      </html>
    `;
    mockFetch.mockResolvedValue(makeMockResponse(html));

    const result = await resolveProductUrl('https://shop.example.com/jeans');
    const dupeCount = result.candidates.filter(
      (c) => c.url === 'https://cdn.example.com/jeans.jpg',
    ).length;
    expect(dupeCount).toBe(1);
  });

  it('throws on HTTP error from page fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'text/html' }),
    } as unknown as Response);

    await expect(resolveProductUrl('https://example.com/not-found')).rejects.toThrow(
      'HTTP 404',
    );
  });
});
