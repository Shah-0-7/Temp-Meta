/**
 * @module __tests__/providers/tryOnGenerator.contract.test
 *
 * Contract tests for the TryOnGenerator interface.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockTryOnGenerator } from '../../src/providers/tryon-generator/MockTryOnGenerator';
import type { TryOnGenerator, TryOnRequest } from '../../src/providers/types';

// ---------------------------------------------------------------------------
// MockTryOnGenerator (default)
// ---------------------------------------------------------------------------

describe('TryOnGenerator contract: MockTryOnGenerator', () => {
  let generator: TryOnGenerator;

  beforeAll(async () => {
    generator = new MockTryOnGenerator();
    await generator.initialize();
  });

  afterAll(async () => {
    await generator.dispose();
  });

  it('has correct name and capabilities', () => {
    expect(generator.name).toBe('mock');
    expect(generator.capabilities).toContain('tryon-generator');
  });

  it('does not support refinement', () => {
    expect(generator.supportsRefinement()).toBe(false);
  });

  it('generates a result with the expected structure', async () => {
    const request: TryOnRequest = {
      personFrame: new Blob(['fake-person-frame'], { type: 'image/png' }),
      garmentImages: [new Blob(['fake-garment'], { type: 'image/png' })],
      garmentType: 'top',
    };

    const result = await generator.generate(request);

    expect(result).toHaveProperty('image');
    expect(result.image).toBeInstanceOf(Blob);
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.provider).toBe('mock');
  }, 10_000); // Allow for simulated delay

  it('throws on refine', async () => {
    await expect(generator.refine('handle', 'instruction')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Meta Muse Image (conditional)
// ---------------------------------------------------------------------------

describe.skipIf(!process.env.META_API_KEY)(
  'TryOnGenerator contract: MetaMuseImageGenerator',
  () => {
    it.todo('initializes with valid API key');
    it.todo('generates a realistic try-on result');
    it.todo('supports multi-turn refinement');
    it.todo('handles rate limiting');
  },
);
