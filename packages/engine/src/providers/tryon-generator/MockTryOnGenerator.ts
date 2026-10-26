/**
 * @module providers/tryon-generator/MockTryOnGenerator
 *
 * Default TryOnGenerator that returns the Tier A composite frame
 * as the "generated" result with a simulated delay.
 *
 * This keeps the full Tier B flow (consent → progress → compare → download)
 * working during development before Meta Muse Image is plugged in.
 */

import type {
  TryOnGenerator,
  TryOnRequest,
  TryOnResult,
  ProviderCapability,
} from '../types.js';

export class MockTryOnGenerator implements TryOnGenerator {
  readonly name = 'mock';
  readonly capabilities: readonly ProviderCapability[] = ['tryon-generator'];

  async initialize(): Promise<void> {
    // No setup needed
  }

  async dispose(): Promise<void> {
    // Nothing to clean up
  }

  supportsRefinement(): boolean {
    return false;
  }

  async generate(request: TryOnRequest): Promise<TryOnResult> {
    // Simulate network/processing delay (2–3 seconds)
    const delay = 2000 + Math.random() * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // In the real implementation, this sends person frame + garment to Muse Image.
    // For now, return the person frame as-is (the Tier A composite should be
    // captured and passed as personFrame by the caller).
    return {
      image: request.personFrame,
      editHandle: undefined,
      metadata: {
        provider: 'mock',
        processingTimeMs: delay,
        note: 'This is the Tier A composite returned as-is. Replace with Meta Muse Image for real generation.',
      },
    };
  }

  async refine(_editHandle: string, _instruction: string): Promise<TryOnResult> {
    throw new Error('MockTryOnGenerator does not support refinement.');
  }
}
