/**
 * @module providers/tryon-generator/FallbackTryOnGenerator
 *
 * Tries an online generator first and quietly drops to the on-device one when the
 * online one is unavailable, so Realistic Photo always produces something.
 *
 * Two things must NOT be swallowed and are re-thrown:
 *  - ContentPolicyError: a safety refusal is an answer, not an outage. Re-running the
 *    same photo elsewhere would defeat it.
 *  - Aborts raised by the caller are not recoverable here either way, so they pass through.
 */

import type { ProviderCapability, TryOnGenerator, TryOnRequest, TryOnResult } from '../types.js';
import { ContentPolicyError, RateLimitError } from '../types.js';
import { ConsentDeclinedError } from './errors.js';

export function fallbackReason(err: unknown): string {
  if (err instanceof ConsentDeclinedError) {
    return 'You chose not to send your photo online, so this render was made on your device.';
  }
  if (err instanceof RateLimitError) {
    return 'The free AI model is busy or out of quota right now, so this render was made on your device.';
  }
  return 'The AI model could not be reached, so this render was made on your device.';
}

export class FallbackTryOnGenerator implements TryOnGenerator {
  readonly capabilities: readonly ProviderCapability[] = ['tryon-generator'];
  readonly sendsDataOffDevice: boolean;
  private _fallbackReady: Promise<void> | null = null;

  constructor(
    private readonly _primary: TryOnGenerator,
    private readonly _fallback: TryOnGenerator,
  ) {
    this.sendsDataOffDevice = _primary.sendsDataOffDevice === true;
  }

  get name(): string {
    return this._primary.name;
  }

  async initialize(): Promise<void> {
    await this._primary.initialize();
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([this._primary.dispose(), this._fallback.dispose()]);
  }

  supportsRefinement(): boolean {
    return false;
  }

  async refine(editHandle: string, instruction: string): Promise<TryOnResult> {
    return this._primary.refine(editHandle, instruction);
  }

  async generate(request: TryOnRequest): Promise<TryOnResult> {
    try {
      return await this._primary.generate(request);
    } catch (err) {
      if (err instanceof ContentPolicyError) throw err;
      if ((err as Error)?.name === 'AbortError') throw err;
      console.warn(`[FallbackTryOnGenerator] "${this._primary.name}" failed, using the on-device render.`, err);

      this._fallbackReady ??= this._fallback.initialize();
      await this._fallbackReady;
      const local = await this._fallback.generate(request);
      const localNote = typeof local.metadata?.note === 'string' ? ` ${local.metadata.note}` : '';
      return {
        ...local,
        metadata: {
          ...local.metadata,
          note: `${fallbackReason(err)}${localNote}`,
          fellBackFrom: this._primary.name,
        },
      };
    }
  }
}
