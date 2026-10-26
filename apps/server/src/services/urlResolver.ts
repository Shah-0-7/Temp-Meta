/**
 * @module server/services/urlResolver
 *
 * Resolves a product page URL to a ranked list of garment image candidates.
 * Parsing strategy (in order of priority):
 *   1. JSON-LD Product schema (most structured)
 *   2. OpenGraph og:image
 *   3. All <img> tags, ranked by size + position
 */

import { safeFetch } from './ssrfGuard.js';
import type { ImageCandidate } from '@tryanywhere/engine';

// ---- In-memory LRU cache ---------------------------------------------------

interface CacheEntry {
  candidates: ImageCandidate[];
  resolvedAt: number;
}

const CACHE_MAX = 500;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

class LRUCache<K, V> {
  private _map = new Map<K, V>();
  private _maxSize: number;
  constructor(maxSize: number) { this._maxSize = maxSize; }

  get(key: K): V | undefined {
    if (!this._map.has(key)) return undefined;
    const value = this._map.get(key)!;
    // Move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this._map.has(key)) this._map.delete(key);
    else if (this._map.size >= this._maxSize) {
      // Evict oldest
      this._map.delete(this._map.keys().next().value!);
    }
    this._map.set(key, value);
  }

  get size() { return this._map.size; }
}

const cache = new LRUCache<string, CacheEntry>(CACHE_MAX);

// ---- Public API ------------------------------------------------------------

export interface ResolveResult {
  candidates: ImageCandidate[];
  bestIndex: number;
  fromCache: boolean;
  pageTitle?: string;
}

/**
 * Resolve a product page URL to image candidates.
 * Results are cached by URL for 15 minutes.
 */
export async function resolveProductUrl(url: string): Promise<ResolveResult> {
  const cacheKey = normalizeUrl(url);

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.resolvedAt < CACHE_TTL_MS) {
    return {
      candidates: cached.candidates,
      bestIndex: 0,
      fromCache: true,
    };
  }

  // Fetch the page
  const response = await safeFetch(url, { maxRedirects: 3, timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024 });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  // Direct image URL — wrap as single candidate
  if (contentType.startsWith('image/')) {
    const candidate: ImageCandidate = { url, alt: 'Direct image' };
    return { candidates: [candidate], bestIndex: 0, fromCache: false };
  }

  const html = await response.text();
  const candidates = await parseHtmlForImages(html, url);

  // Cache result
  cache.set(cacheKey, { candidates, resolvedAt: Date.now() });

  return {
    candidates,
    bestIndex: 0,
    fromCache: false,
    pageTitle: extractTitle(html),
  };
}

// ---- HTML Parsing ----------------------------------------------------------

async function parseHtmlForImages(html: string, baseUrl: string): Promise<ImageCandidate[]> {
  const candidates: ImageCandidate[] = [];
  const seen = new Set<string>();

  const add = (candidate: ImageCandidate) => {
    try {
      const abs = new URL(candidate.url, baseUrl).href;
      if (seen.has(abs)) return;
      seen.add(abs);
      candidates.push({ ...candidate, url: abs });
    } catch {
      // Skip invalid URLs
    }
  };

  // 1. JSON-LD Product schema
  const jsonLdImages = extractJsonLdImages(html);
  for (const img of jsonLdImages) add(img);

  // 2. OpenGraph
  const ogImage = extractOgImage(html);
  if (ogImage) add(ogImage);

  // 3. <img> tags
  const imgTags = extractImgTags(html);
  for (const img of imgTags) add(img);

  // 4. <meta> twitter:image
  const twitterImage = extractMetaContent(html, 'twitter:image');
  if (twitterImage) add({ url: twitterImage, alt: 'Twitter card image' });

  return candidates;
}

function extractJsonLdImages(html: string): ImageCandidate[] {
  const results: ImageCandidate[] = [];
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const schemas = Array.isArray(data) ? data : [data];
      for (const schema of schemas) {
        const type = schema['@type'];
        if (!type) continue;
        const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
        if (!isProduct) continue;

        const images = schema.image ?? schema.images ?? [];
        const imageList = Array.isArray(images) ? images : [images];
        for (const img of imageList) {
          if (typeof img === 'string') {
            results.push({ url: img, alt: schema.name ?? 'Product image' });
          } else if (img && typeof img.url === 'string') {
            results.push({ url: img.url, alt: img.name ?? schema.name ?? 'Product image' });
          }
        }
        // Also check offers/thumbnail
        if (schema.thumbnail) results.push({ url: String(schema.thumbnail), alt: 'Thumbnail' });
      }
    } catch {
      // Invalid JSON — skip
    }
  }
  return results;
}

function extractOgImage(html: string): ImageCandidate | null {
  const ogUrl = extractMetaContent(html, 'og:image');
  const ogAlt = extractMetaContent(html, 'og:image:alt') ?? extractMetaContent(html, 'og:title');
  const ogW = extractMetaContent(html, 'og:image:width');
  const ogH = extractMetaContent(html, 'og:image:height');

  if (!ogUrl) return null;
  return {
    url: ogUrl,
    alt: ogAlt ?? 'OG image',
    width: ogW ? parseInt(ogW, 10) : undefined,
    height: ogH ? parseInt(ogH, 10) : undefined,
  };
}

function extractMetaContent(html: string, property: string): string | null {
  // Matches both property= and name= variants
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i',
  );
  const m = re.exec(html) ?? alt.exec(html);
  return m ? m[1] : null;
}

function extractImgTags(html: string): ImageCandidate[] {
  const results: ImageCandidate[] = [];
  // Match <img> tags and capture src, alt, width, height
  const imgRe = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRe.exec(html)) !== null) {
    const attrs = match[1];
    const src = attrValue(attrs, 'src') ?? attrValue(attrs, 'data-src') ?? attrValue(attrs, 'data-lazy-src');
    if (!src) continue;
    // Skip tracking pixels and tiny images
    if (src.startsWith('data:')) continue;

    const alt = attrValue(attrs, 'alt') ?? '';
    const width = attrValue(attrs, 'width');
    const height = attrValue(attrs, 'height');

    results.push({
      url: src,
      alt,
      width: width ? parseInt(width, 10) : undefined,
      height: height ? parseInt(height, 10) : undefined,
    });
  }
  return results;
}

function attrValue(attrs: string, name: string): string | null {
  const re = new RegExp(`${name}=["']([^"']*)["']`, 'i');
  const m = re.exec(attrs);
  return m ? m[1].trim() : null;
}

function extractTitle(html: string): string | undefined {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? m[1].trim() : undefined;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'fbclid', 'gclid'].forEach((p) =>
      u.searchParams.delete(p),
    );
    return u.href;
  } catch {
    return url;
  }
}
