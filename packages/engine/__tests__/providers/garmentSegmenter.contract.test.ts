/**
 * @module __tests__/providers/garmentSegmenter.contract.test
 *
 * Contract tests for the GarmentSegmenter interface.
 * Runs against the default BrowserSAMSegmenter.
 * Meta SAM tests are skipped when META_API_KEY is not set.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserSAMSegmenter } from '../../src/providers/garment-segmenter/BrowserSAMSegmenter';
import type { GarmentSegmenter, SegmentationResult } from '../../src/providers/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal ImageBitmap-like object for testing in Node.
 * Real ImageBitmap is a browser API, so we mock it for unit tests.
 */
function createMockImageBitmap(width: number, height: number): ImageBitmap {
  return {
    width,
    height,
    close: () => {},
  } as unknown as ImageBitmap;
}

// ---------------------------------------------------------------------------
// Shared contract assertions
// ---------------------------------------------------------------------------

function assertValidSegmentationResult(result: SegmentationResult): void {
  expect(result).toBeDefined();
  expect(result.masks).toBeInstanceOf(Array);
  expect(result.masks.length).toBeGreaterThan(0);
  expect(result.scores).toBeInstanceOf(Array);
  expect(result.scores.length).toBe(result.masks.length);
  expect(result.selectedIndex).toBeGreaterThanOrEqual(0);
  expect(result.selectedIndex).toBeLessThan(result.masks.length);

  // Every mask should be an ImageData
  for (const mask of result.masks) {
    expect(mask).toHaveProperty('width');
    expect(mask).toHaveProperty('height');
    expect(mask).toHaveProperty('data');
    expect(mask.width).toBeGreaterThan(0);
    expect(mask.height).toBeGreaterThan(0);
  }

  // Every score should be in [0, 1]
  for (const score of result.scores) {
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  }
}

// ---------------------------------------------------------------------------
// BrowserSAMSegmenter (default)
// ---------------------------------------------------------------------------

describe('GarmentSegmenter contract: BrowserSAMSegmenter', () => {
  let segmenter: GarmentSegmenter;

  beforeAll(async () => {
    segmenter = new BrowserSAMSegmenter();
    await segmenter.initialize();
  });

  afterAll(async () => {
    await segmenter.dispose();
  });

  it('has correct name and capabilities', () => {
    expect(segmenter.name).toBe('browser-sam');
    expect(segmenter.capabilities).toContain('garment-segmenter');
  });

  it('supports point and box prompts', () => {
    expect(segmenter.supportsPromptType('point')).toBe(true);
    expect(segmenter.supportsPromptType('box')).toBe(true);
  });

  it('does not support text prompts', () => {
    expect(segmenter.supportsPromptType('text')).toBe(false);
  });

  it('returns a valid segmentation result for a point prompt', async () => {
    const image = createMockImageBitmap(640, 480);
    const result = await segmenter.segment(image, {
      type: 'point',
      value: { x: 320, y: 240 },
    });
    assertValidSegmentationResult(result);
  });

  it('returns a valid segmentation result for a box prompt', async () => {
    const image = createMockImageBitmap(640, 480);
    const result = await segmenter.segment(image, {
      type: 'box',
      value: { x1: 100, y1: 100, x2: 500, y2: 400 },
    });
    assertValidSegmentationResult(result);
  });

  it('throws on unsupported text prompt', async () => {
    const image = createMockImageBitmap(640, 480);
    await expect(
      segmenter.segment(image, { type: 'text', value: 'shirt' }),
    ).rejects.toThrow(/does not support/i);
  });

  it('throws if not initialized', async () => {
    const fresh = new BrowserSAMSegmenter();
    const image = createMockImageBitmap(640, 480);
    await expect(
      fresh.segment(image, { type: 'point', value: { x: 0, y: 0 } }),
    ).rejects.toThrow(/not initialized/i);
  });
});

// ---------------------------------------------------------------------------
// Meta SAM 3.1 (conditional — skipped without API key)
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.META_API_KEY)(
  'GarmentSegmenter contract: MetaSAMSegmenter',
  () => {
    it.todo('initializes with valid API key');
    it.todo('supports text, point, and box prompts');
    it.todo('returns valid segmentation for text prompt "shirt"');
    it.todo('returns valid segmentation for point prompt');
    it.todo('handles rate limiting gracefully');
  },
);
