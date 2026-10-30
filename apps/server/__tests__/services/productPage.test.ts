/**
 * @module __tests__/services/productPage.test
 *
 * Image discovery on product pages. Pure HTML in, candidates out.
 */

import { describe, it, expect } from 'vitest';
import { parseProductPage, bestFromSrcset, decodeEntities } from '../../src/services/productPage';

const BASE = 'https://shop.example.com/products/jacket';
const urls = (html: string) => parseProductPage(html, BASE).candidates.map((c) => c.url);

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities and leaves unknown ones alone', () => {
    expect(decodeEntities('a&amp;b &quot;c&quot; &#39;d&#39; &#x26; &bogus;')).toBe('a&b "c" \'d\' & &bogus;');
  });
});

describe('bestFromSrcset', () => {
  it('picks the widest by w descriptor', () => {
    expect(bestFromSrcset('/a.jpg 480w, /b.jpg 1080w, /c.jpg 800w')).toBe('/b.jpg');
  });
  it('picks the highest density by x descriptor', () => {
    expect(bestFromSrcset('/a.jpg 1x, /b.jpg 2x')).toBe('/b.jpg');
  });
  it('keeps CDN URLs that contain commas whole', () => {
    expect(bestFromSrcset('https://cdn.x/w_400,c_fill/p.jpg 400w, https://cdn.x/w_900,c_fill/p.jpg 900w')).toBe(
      'https://cdn.x/w_900,c_fill/p.jpg',
    );
  });
  it('handles a single URL with no descriptor', () => {
    expect(bestFromSrcset('/only.jpg')).toBe('/only.jpg');
  });
});

describe('parseProductPage', () => {
  it('decodes &amp; in image URLs, which would otherwise break the query string', () => {
    const html = `<meta property="og:image" content="https://cdn.x.com/p.jpg?w=800&amp;h=1000">`;
    expect(urls(html)).toEqual(['https://cdn.x.com/p.jpg?w=800&h=1000']);
  });

  it('finds Product inside @graph and reads ImageObject entries', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"WebSite","name":"Shop"},
      {"@type":"Product","name":"Puffer Jacket","image":[{"@type":"ImageObject","url":"https://cdn.x.com/1.jpg"},"https://cdn.x.com/2.jpg"]}]}</script>`;
    const { candidates } = parseProductPage(html, BASE);
    expect(candidates.map((c) => c.url)).toEqual(['https://cdn.x.com/1.jpg', 'https://cdn.x.com/2.jpg']);
    expect(candidates[0].alt).toBe('Puffer Jacket');
    expect(candidates[0].source).toBe('json-ld');
  });

  it('reads ProductGroup and variant images', () => {
    const html = `<script type="application/ld+json">{"@type":"ProductGroup","name":"Tee","image":"/main.jpg",
      "hasVariant":[{"@type":"Product","image":"/red.jpg"}]}</script>`;
    expect(urls(html)).toEqual(['https://shop.example.com/main.jpg', 'https://shop.example.com/red.jpg']);
  });

  it('survives a broken JSON-LD block and still reads the rest', () => {
    const html = `<script type="application/ld+json">{ not json </script><meta property="og:image" content="/ok.jpg">`;
    expect(urls(html)).toEqual(['https://shop.example.com/ok.jpg']);
  });

  it('does not take data-src for src and prefers the largest srcset entry', () => {
    const html = `<img data-src="/lazy.jpg" srcset="/s.jpg 300w, /l.jpg 1200w" alt="Jacket">`;
    expect(urls(html)).toEqual(['https://shop.example.com/l.jpg']);
    expect(urls(`<img data-src="/lazy.jpg" alt="Jacket">`)).toEqual(['https://shop.example.com/lazy.jpg']);
  });

  it('reads <picture><source srcset>', () => {
    const html = `<picture><source srcset="/big.webp 1600w, /small.webp 400w"><img src="/fallback.jpg" alt="Coat"></picture>`;
    const found = urls(html);
    expect(found[0]).toBe('https://shop.example.com/big.webp');
  });

  it('handles unquoted attributes and single quotes', () => {
    expect(urls(`<img src=/a.jpg alt=Shirt><img src='/b.jpg'>`)).toEqual([
      'https://shop.example.com/a.jpg',
      'https://shop.example.com/b.jpg',
    ]);
  });

  it('drops tracking pixels, icons, logos, svg and data URIs from <img> tags', () => {
    const html = `
      <img src="/px.gif" width="1" height="1">
      <img src="/icons/cart.png" alt="cart icon">
      <img src="/assets/site-logo.png">
      <img src="/vector.svg" width="400" height="400">
      <img src="data:image/png;base64,AAAA">
      <img src="/real.jpg" alt="Blue jacket" width="800" height="1000">`;
    expect(urls(html)).toEqual(['https://shop.example.com/real.jpg']);
  });

  it('never returns non-http(s) URLs', () => {
    const html = `<meta property="og:image" content="javascript:alert(1)"><meta name="twitter:image" content="ftp://x/y.jpg"><meta property="og:image" content="//cdn.x.com/p.jpg">`;
    expect(urls(html)).toEqual(['https://cdn.x.com/p.jpg']);
  });

  it('orders structured data before meta tags before <img>, and de-duplicates', () => {
    const html = `
      <img src="/img.jpg" alt="x" width="500" height="500">
      <meta property="og:image" content="/og.jpg">
      <meta name="twitter:image" content="/og.jpg">
      <script type="application/ld+json">{"@type":"Product","image":"/ld.jpg"}</script>`;
    const { candidates } = parseProductPage(html, BASE);
    expect(candidates.map((c) => [c.url.split('/').pop(), c.source])).toEqual([
      ['ld.jpg', 'json-ld'],
      ['og.jpg', 'og'],
      ['img.jpg', 'img'],
    ]);
  });

  it('applies og:image size tags to the first og:image only', () => {
    const html = `<meta property="og:image" content="/a.jpg"><meta property="og:image" content="/b.jpg">
      <meta property="og:image:width" content="1200"><meta property="og:image:height" content="1500">`;
    const { candidates } = parseProductPage(html, BASE);
    expect(candidates[0].width).toBe(1200);
    expect(candidates[1].width).toBeUndefined();
  });

  it('caps the number of candidates', () => {
    const html = Array.from({ length: 200 }, (_, i) => `<img src="/p${i}.jpg" alt="p" width="400" height="400">`).join('');
    expect(parseProductPage(html, BASE).candidates.length).toBeLessThanOrEqual(40);
  });

  it('decodes and tidies the page title', () => {
    expect(parseProductPage('<title>\n  Men&#39;s Jacket &amp; Coat \n</title>', BASE).title).toBe("Men's Jacket & Coat");
  });

  it('copes with a huge page without hanging', () => {
    const html = '<img '.repeat(50_000) + '<meta property="og:image" content="/z.jpg">';
    const t = Date.now();
    parseProductPage(html, BASE);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});
