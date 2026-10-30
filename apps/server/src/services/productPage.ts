/**
 * @module server/services/productPage
 *
 * Pulls garment image candidates out of a product page's HTML. Pure functions, no network.
 * Sources, most trustworthy first: JSON-LD Product data (including `@graph`), OpenGraph and
 * Twitter meta tags, `<link rel="image_src">`, then `<img>`/`<picture>` elements.
 * Ranking is left to the engine's ImageUnderstanding provider; this only finds and tidies.
 */

import type { ImageCandidate } from '@tryanywhere/engine';

const MAX_CANDIDATES = 40;

// ---------------------------------------------------------------------------
// Small HTML helpers (no DOM on the server, so regex over tags, with care)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', eacute: 'é', copy: '©', reg: '®', trade: '™',
};

/** Decodes the HTML entities that show up in URLs, titles and alt text. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Parses the attributes of one tag into a lower-cased name -> decoded value map. */
function parseAttrs(source: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const m of source.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    if (attrs.has(name)) continue;
    attrs.set(name, decodeEntities((m[2] ?? m[3] ?? m[4] ?? '').trim()));
  }
  return attrs;
}

function tags(html: string, name: string): Array<Map<string, string>> {
  const out: Array<Map<string, string>> = [];
  const re = new RegExp(`<${name}\\b([^>]*)>`, 'gi');
  for (const m of html.matchAll(re)) out.push(parseAttrs(m[1]));
  return out;
}

/** meta tags by property/name, in page order (a page can list several og:image). */
function metaTags(html: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const attrs of tags(html, 'meta')) {
    const key = (attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase();
    const content = attrs.get('content');
    if (!key || !content) continue;
    const list = out.get(key) ?? [];
    list.push(content);
    out.set(key, list);
  }
  return out;
}

function toInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The widest entry of a srcset ("a.jpg 480w, b.jpg 1080w" or "a.jpg 1x, b.jpg 2x").
 * Follows the HTML parsing rules: a URL runs to the next whitespace (so CDN URLs with commas
 * like `w_400,c_fill/x.jpg` stay whole), then an optional descriptor runs to the next comma.
 */
export function bestFromSrcset(srcset: string): string | null {
  let best: { url: string; weight: number } | null = null;
  let i = 0;
  const n = srcset.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(srcset[i])) i++;
    let start = i;
    while (i < n && !/\s/.test(srcset[i])) i++;
    let url = srcset.slice(start, i);
    let descriptor = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      start = i;
      while (i < n && srcset[i] !== ',') i++;
      descriptor = srcset.slice(start, i).trim();
    }
    if (!url) continue;
    const weight = descriptor ? parseFloat(descriptor) || 1 : 1;
    if (!best || weight > best.weight) best = { url, weight };
  }
  return best?.url ?? null;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const PRODUCT_TYPES = new Set(['Product', 'ProductGroup', 'IndividualProduct']);

function isProductNode(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === 'string' && PRODUCT_TYPES.has(t.replace(/^.*[/:#]/, '')));
}

/** Walks JSON-LD (arrays, `@graph`, nested objects) and yields every Product node. */
function* productNodes(value: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) yield* productNodes(v, depth + 1);
    return;
  }
  const node = value as Record<string, unknown>;
  if (isProductNode(node)) yield node;
  if (node['@graph']) yield* productNodes(node['@graph'], depth + 1);
  if (node.mainEntity) yield* productNodes(node.mainEntity, depth + 1);
}

function imageUrls(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((v) => imageUrls(v, depth + 1));
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return imageUrls(o.url ?? o.contentUrl ?? o['@id'], depth + 1);
  }
  return [];
}

function extractJsonLd(html: string): ImageCandidate[] {
  const results: ImageCandidate[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/ld\+json/i.test(m[1])) continue;
    let data: unknown;
    try {
      data = JSON.parse(decodeEntities(m[2]).trim());
    } catch {
      try {
        data = JSON.parse(m[2].trim());
      } catch {
        continue;
      }
    }
    for (const product of productNodes(data)) {
      const name = typeof product.name === 'string' ? product.name : 'Product image';
      for (const key of ['image', 'images', 'thumbnail', 'thumbnailUrl']) {
        for (const url of imageUrls(product[key])) results.push({ url, alt: name, source: 'json-ld' });
      }
      // Variants (colours) often carry their own images.
      const variants = product.hasVariant;
      if (Array.isArray(variants)) {
        for (const v of variants.slice(0, 6)) {
          if (v && typeof v === 'object') {
            for (const url of imageUrls((v as Record<string, unknown>).image)) results.push({ url, alt: name, source: 'json-ld' });
          }
        }
      }
    }
  }
  return results;
}

function extractMeta(html: string): ImageCandidate[] {
  const meta = metaTags(html);
  const first = (key: string) => meta.get(key)?.[0];
  const alt = first('og:image:alt') ?? first('og:title') ?? first('twitter:image:alt') ?? first('twitter:title');
  const out: ImageCandidate[] = [];

  const og = [...(meta.get('og:image') ?? []), ...(meta.get('og:image:url') ?? []), ...(meta.get('og:image:secure_url') ?? [])];
  og.forEach((url, i) =>
    out.push({
      url,
      alt: alt ?? 'OG image',
      // The size tags describe the first og:image only.
      width: i === 0 ? toInt(first('og:image:width')) : undefined,
      height: i === 0 ? toInt(first('og:image:height')) : undefined,
      source: 'og',
    }),
  );
  for (const key of ['twitter:image', 'twitter:image:src']) {
    for (const url of meta.get(key) ?? []) out.push({ url, alt: alt ?? 'Twitter card image', source: 'twitter' });
  }
  for (const attrs of tags(html, 'link')) {
    if ((attrs.get('rel') ?? '').toLowerCase().split(/\s+/).includes('image_src') && attrs.get('href')) {
      out.push({ url: attrs.get('href')!, alt: alt ?? 'Page image', source: 'link' });
    }
  }
  return out;
}

const JUNK_RE = /(?:^|[^a-z0-9])(?:logo|icon|sprite|avatar|badge|flag|favicon|placeholder|spacer|pixel|blank|transparent|tracking|beacon|payment|social)s?(?=$|[^a-z0-9])/i;

function extractImgs(html: string): ImageCandidate[] {
  const out: ImageCandidate[] = [];

  const consider = (attrs: Map<string, string>, fallbackAlt?: string) => {
    const srcset = attrs.get('srcset') ?? attrs.get('data-srcset') ?? attrs.get('data-lazy-srcset');
    const src =
      (srcset ? bestFromSrcset(srcset) : null) ??
      attrs.get('src') ??
      attrs.get('data-src') ??
      attrs.get('data-lazy-src') ??
      attrs.get('data-original');
    if (!src || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('javascript:')) return;

    const width = toInt(attrs.get('width'));
    const height = toInt(attrs.get('height'));
    // A declared size under 60px is an icon or a tracking pixel.
    if ((width && width < 60) || (height && height < 60)) return;

    const alt = attrs.get('alt') ?? fallbackAlt ?? '';
    if (JUNK_RE.test(alt) || JUNK_RE.test(attrs.get('class') ?? '') || JUNK_RE.test(src.split('?')[0].split('/').pop() ?? '')) return;
    out.push({ url: src, alt, width, height, source: 'img' });
  };

  // <picture><source srcset> carries the real asset on many shops; its <img> is the fallback.
  for (const m of html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)) {
    const sources = tags(m[1], 'source');
    const img = tags(m[1], 'img')[0];
    const alt = img?.get('alt');
    for (const s of sources) {
      const srcset = s.get('srcset');
      if (!srcset) continue;
      const attrs = new Map<string, string>([['srcset', srcset]]);
      if (alt) attrs.set('alt', alt);
      consider(attrs);
    }
  }
  for (const attrs of tags(html, 'img')) consider(attrs);
  return out;
}

/** Resolves, filters and de-duplicates the raw candidates. */
function finalize(raw: ImageCandidate[], baseUrl: string): ImageCandidate[] {
  const seen = new Set<string>();
  const out: ImageCandidate[] = [];
  for (const c of raw) {
    let abs: URL;
    try {
      abs = new URL(c.url.trim(), baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    // Vector art cannot be a garment photo, and it can carry script.
    if (/\.svg$/i.test(abs.pathname)) continue;
    abs.hash = '';
    const href = abs.href;
    if (href.length > 2000 || seen.has(href)) continue;
    seen.add(href);
    out.push({ ...c, url: href });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

export function parseProductPage(html: string, baseUrl: string): { candidates: ImageCandidate[]; title?: string } {
  const candidates = finalize([...extractJsonLd(html), ...extractMeta(html), ...extractImgs(html)], baseUrl);
  return { candidates, title: extractTitle(html) };
}

export function extractTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
  return title ? title.slice(0, 200) : undefined;
}
