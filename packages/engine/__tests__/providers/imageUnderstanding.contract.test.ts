/**
 * @module __tests__/providers/imageUnderstanding.contract.test
 *
 * Contract tests for the ImageUnderstanding interface.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HeuristicUnderstanding, detectGarmentType } from '../../src/providers/image-understanding/HeuristicUnderstanding';
import type { ImageUnderstanding, ImageCandidate } from '../../src/providers/types';

// ---------------------------------------------------------------------------
// HeuristicUnderstanding (default)
// ---------------------------------------------------------------------------

describe('ImageUnderstanding contract: HeuristicUnderstanding', () => {
  let understanding: ImageUnderstanding;

  beforeAll(async () => {
    understanding = new HeuristicUnderstanding();
    await understanding.initialize();
  });

  afterAll(async () => {
    await understanding.dispose();
  });

  it('has correct name and capabilities', () => {
    expect(understanding.name).toBe('heuristic');
    expect(understanding.capabilities).toContain('image-understanding');
  });

  it('ranks candidates by dimension preference', async () => {
    const candidates: ImageCandidate[] = [
      { url: 'https://example.com/small.jpg', width: 100, height: 100 },
      { url: 'https://example.com/large.jpg', width: 800, height: 1200 },
      { url: 'https://example.com/medium.jpg', width: 400, height: 600 },
    ];

    const ranked = await understanding.rankCandidates(candidates);
    expect(ranked.length).toBe(3);
    // Large image should rank first
    expect(ranked[0].url).toBe('https://example.com/large.jpg');
    // Small image should rank last
    expect(ranked[ranked.length - 1].url).toBe('https://example.com/small.jpg');
  });

  it('boosts images with clothing alt text', async () => {
    const candidates: ImageCandidate[] = [
      { url: 'https://example.com/a.jpg', width: 600, height: 800, alt: 'brand logo' },
      { url: 'https://example.com/b.jpg', width: 600, height: 800, alt: 'blue cotton t-shirt' },
    ];

    const ranked = await understanding.rankCandidates(candidates);
    expect(ranked[0].url).toBe('https://example.com/b.jpg');
    expect(ranked[0].garmentType).toBe('top');
  });

  it('detects garment types from alt text', async () => {
    const candidates: ImageCandidate[] = [
      { url: 'https://example.com/jacket.jpg', width: 600, height: 800, alt: 'leather jacket' },
    ];

    const ranked = await understanding.rankCandidates(candidates);
    expect(ranked[0].garmentType).toBe('outerwear');
  });

  it('returns valid structure for all candidates', async () => {
    const candidates: ImageCandidate[] = [
      { url: 'https://example.com/test.jpg', width: 500, height: 700 },
    ];

    const ranked = await understanding.rankCandidates(candidates);
    expect(ranked.length).toBe(1);
    expect(ranked[0]).toHaveProperty('url');
    expect(ranked[0]).toHaveProperty('score');
    expect(ranked[0]).toHaveProperty('garmentType');
    expect(ranked[0]).toHaveProperty('attributes');
    expect(typeof ranked[0].score).toBe('number');
  });

  it('handles empty candidate list', async () => {
    const ranked = await understanding.rankCandidates([]);
    expect(ranked).toEqual([]);
  });
});

describe('HeuristicUnderstanding: product-page ranking', () => {
  const u = new HeuristicUnderstanding();

  it('does not mistake ordinary words for garments', () => {
    expect(detectGarmentType('laptop capture stop guarantee').matched).toBe(false);
    expect(detectGarmentType('Slim fit crop top').type).toBe('top');
    expect(detectGarmentType('Padded Puffer Jackets').type).toBe('outerwear');
    expect(detectGarmentType('Relaxed Fit T-Shirt').type).toBe('top');
    expect(detectGarmentType('floral shirt dress').type).toBe('dress');
  });

  it('prefers structured product data over a stray <img> of the same size', async () => {
    const ranked = await u.rankCandidates([
      { url: 'https://x.com/a.jpg', width: 800, height: 1000, source: 'img' },
      { url: 'https://x.com/b.jpg', width: 800, height: 1000, source: 'json-ld' },
    ]);
    expect(ranked[0].url).toBe('https://x.com/b.jpg');
  });

  it('reads the garment type from the file name when the alt text says nothing', async () => {
    const ranked = await u.rankCandidates([{ url: 'https://x.com/img/mens-fleece-jacket_01.jpg', width: 800, height: 1000 }]);
    expect(ranked[0].garmentType).toBe('outerwear');
  });

  it('pushes logos, icons and sprites down', async () => {
    const ranked = await u.rankCandidates([
      { url: 'https://x.com/assets/site-logo.png', width: 800, height: 800, source: 'img' },
      { url: 'https://x.com/p/12345.jpg', width: 400, height: 500, source: 'img' },
    ]);
    expect(ranked[0].url).toBe('https://x.com/p/12345.jpg');
  });

  it('keeps page order for equal scores', async () => {
    const ranked = await u.rankCandidates([
      { url: 'https://x.com/1.jpg' },
      { url: 'https://x.com/2.jpg' },
      { url: 'https://x.com/3.jpg' },
    ]);
    expect(ranked.map((r) => r.url)).toEqual(['https://x.com/1.jpg', 'https://x.com/2.jpg', 'https://x.com/3.jpg']);
  });
});

// ---------------------------------------------------------------------------
// Meta Muse Spark (conditional)
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.META_API_KEY)(
  'ImageUnderstanding contract: MetaSparkUnderstanding',
  () => {
    it.todo('initializes with valid API key');
    it.todo('ranks candidates with AI analysis');
    it.todo('describes garment with type and attributes');
    it.todo('generates structured try-on prompt');
  },
);
