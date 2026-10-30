import { describe, it, expect } from 'vitest';
import { mergeRanked } from './garmentRanking';

const raw = [
  { url: 'https://x/a.jpg', proxyUrl: 'https://api/p?a', alt: 'a' },
  { url: 'https://x/b.jpg', proxyUrl: 'https://api/p?b', alt: 'b', width: 800, height: 900 },
];
const ranked = [
  { url: 'https://x/b.jpg', score: 80, garmentType: 'top' as const, attributes: {} },
  { url: 'https://x/a.jpg', score: 250, garmentType: 'top' as const, attributes: {} },
];

describe('mergeRanked', () => {
  it('keeps the ranker order and carries the proxy url, alt and size across', () => {
    const out = mergeRanked(raw, ranked);
    expect(out.map((c) => c.url)).toEqual(['https://x/b.jpg', 'https://x/a.jpg']);
    expect(out[0].proxyUrl).toBe('https://api/p?b');
    expect(out[0].width).toBe(800);
  });

  it('scales scores into 0..1', () => {
    const out = mergeRanked(raw, ranked);
    expect(out[0].score).toBeCloseTo(0.8);
    expect(out[1].score).toBe(1);
  });

  it('lets the page title decide the garment kind when it names one', () => {
    expect(mergeRanked(raw, ranked, 'Mens Padded Jacket | Shop')[0].garmentType).toBe('outerwear');
    expect(mergeRanked(raw, ranked, 'Welcome to Shop')[0].garmentType).toBe('top');
  });

  it('does not lose candidates the ranker dropped', () => {
    const out = mergeRanked(raw, [ranked[0]]);
    expect(out).toHaveLength(2);
    expect(out[1].url).toBe('https://x/a.jpg');
  });
});
