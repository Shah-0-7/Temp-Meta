/**
 * @module server/services/urlResolver
 *
 * Resolves a product page URL to a ranked list of garment image candidates.
 * Fetching and caching live here; finding the images is `productPage.ts`.
 */

import { safeFetch } from './ssrfGuard.js';
import { parseProductPage } from './productPage.js';
import type { ImageCandidate } from '@tryanywhere/engine';

// ---- In-memory LRU cache ---------------------------------------------------

interface CacheEntry {
  candidates: ImageCandidate[];
  pageTitle?: string;
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
export async function resolveProductUrl(url: string, signal?: AbortSignal): Promise<ResolveResult> {
  const cacheKey = normalizeUrl(url);

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.resolvedAt < CACHE_TTL_MS) {
    return {
      candidates: cached.candidates,
      bestIndex: 0,
      fromCache: true,
      pageTitle: cached.pageTitle,
    };
  }

  // Fetch the page
  const response = await safeFetch(url, { maxRedirects: 3, timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024, signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  // Direct image URL — wrap as single candidate
  if (contentType.startsWith('image/')) {
    await response.body?.cancel?.();
    const candidate: ImageCandidate = { url, alt: 'Direct image', source: 'direct' };
    return { candidates: [candidate], bestIndex: 0, fromCache: false };
  }

  const html = await response.text();
  // Relative URLs resolve against the page's final address, which a redirect may have changed.
  const { candidates, title } = parseProductPage(html, (response as { url?: string }).url || url);

  cache.set(cacheKey, { candidates, pageTitle: title, resolvedAt: Date.now() });

  return { candidates, bestIndex: 0, fromCache: false, pageTitle: title };
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
