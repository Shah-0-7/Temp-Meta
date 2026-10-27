/**
 * @module providers/tryon-generator/MockTryOnGenerator
 *
 * Default TryOnGenerator that returns the Tier A composite frame
 * as the "generated" result with a simulated delay.
 *
 * This keeps the full Tier B flow (consent → progress → compare → download)
 * working during development, and in demos without API keys, before Meta
 * Muse Image is plugged in.
 */

import type {
  TryOnGenerator,
  TryOnRequest,
  TryOnResult,
  ProviderCapability,
} from '../types.js';

export interface MockTryOnGeneratorOptions {
  /** Fixed simulated latency in ms. Default: random 2–3 s. */
  delayMs?: number;
}

export class MockTryOnGenerator implements TryOnGenerator {
  readonly name = 'mock';
  readonly capabilities: readonly ProviderCapability[] = ['tryon-generator'];

  private readonly _delayMs: number | undefined;

  constructor(options: MockTryOnGeneratorOptions = {}) {
    this._delayMs = options.delayMs;
  }

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
    const delay = this._delayMs ?? 2000 + Math.random() * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // A real generator would send the person frame + garment to Muse Image.
    // The mock hands back the Tier A composite when the caller supplied one,
    // otherwise the person frame as-is.
    const usedComposite = request.compositeFrame !== undefined;
    return {
      image: request.compositeFrame ?? request.personFrame,
      editHandle: undefined,
      metadata: {
        provider: 'mock',
        processingTimeMs: delay,
        usedComposite,
        note: 'Demo mode: this is the Tier A preview returned as-is, not an AI render. Configure the Meta Model API for photorealistic results.',
      },
    };
  }

  async refine(_editHandle: string, _instruction: string): Promise<TryOnResult> {
    throw new Error('MockTryOnGenerator does not support refinement.');
  }
}
