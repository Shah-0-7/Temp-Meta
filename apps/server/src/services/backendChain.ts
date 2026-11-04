/**
 * @module server/services/backendChain
 *
 * Tries try-on backends in order, so a better model can come first and a free one can catch
 * its failures. It moves on after quota, timeout, upstream and bad-response errors. It does not
 * move on after a content-policy refusal (another model would just be sent the same photo), and
 * it reports a credentials error from the first model only in the server log.
 */

import { BackendError } from './backendError.js';
import type { TryOnBackend, TryOnBackendInput, TryOnBackendOutput, TryOnGarmentType } from './freeTryOn.js';

export class BackendChain implements TryOnBackend {
  readonly label: string;

  constructor(private readonly _backends: readonly TryOnBackend[]) {
    if (_backends.length === 0) throw new Error('A backend chain needs at least one backend.');
    this.label = _backends.map((b) => b.label).join(', then ');
  }

  supports(type: TryOnGarmentType): boolean {
    return this._backends.some((b) => b.supports(type));
  }

  async run(input: TryOnBackendInput, signal?: AbortSignal): Promise<TryOnBackendOutput> {
    let last: unknown = new BackendError('upstream', 'No backend could handle this garment.');
    for (const backend of this._backends) {
      if (!backend.supports(input.garmentType)) continue;
      try {
        const out = await backend.run(input, signal);
        return { ...out, provider: out.provider ?? backend.label };
      } catch (err) {
        last = err;
        if (signal?.aborted) throw err;
        if (err instanceof BackendError && err.kind === 'policy') throw err;
        console.warn(`[generate] ${backend.label} failed (${(err as Error).name}); trying the next backend if there is one.`);
      }
    }
    throw last;
  }
}
