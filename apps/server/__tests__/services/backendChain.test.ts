import { describe, it, expect } from 'vitest';
import { BackendChain } from '../../src/services/backendChain';
import { BackendError } from '../../src/services/backendError';
import type { TryOnBackend } from '../../src/services/freeTryOn';

const OUT = { bytes: new Uint8Array([1]), contentType: 'image/png' };
const input = { person: new Blob(['p']), garment: new Blob(['g']), garmentType: 'top' as const };

function backend(label: string, run: () => Promise<typeof OUT>, supports = true): TryOnBackend & { calls: number } {
  const b = {
    calls: 0,
    label,
    supports: () => supports,
    async run() {
      b.calls++;
      return run();
    },
  };
  return b;
}

describe('BackendChain', () => {
  it('names every backend, in order', () => {
    expect(new BackendChain([backend('A', async () => OUT), backend('B', async () => OUT)]).label).toBe('A, then B');
  });

  it('uses the first backend and reports it as the provider', async () => {
    const a = backend('A', async () => OUT);
    const b = backend('B', async () => OUT);
    const out = await new BackendChain([a, b]).run(input);
    expect(out.provider).toBe('A');
    expect(b.calls).toBe(0);
  });

  for (const kind of ['quota', 'timeout', 'upstream', 'bad-response', 'auth'] as const) {
    it(`falls through to the next backend after ${kind}`, async () => {
      const a = backend('A', async () => { throw new BackendError(kind, 'x'); });
      const b = backend('B', async () => OUT);
      const out = await new BackendChain([a, b]).run(input);
      expect(out.provider).toBe('B');
    });
  }

  it('falls through after an unexpected error too', async () => {
    const a = backend('A', async () => { throw new Error('boom'); });
    const out = await new BackendChain([a, backend('B', async () => OUT)]).run(input);
    expect(out.provider).toBe('B');
  });

  it('does not send the same photo to another model after a content-policy refusal', async () => {
    const a = backend('A', async () => { throw new BackendError('policy', 'no'); });
    const b = backend('B', async () => OUT);
    await expect(new BackendChain([a, b]).run(input)).rejects.toThrow('no');
    expect(b.calls).toBe(0);
  });

  it('skips backends that do not support the garment', async () => {
    const a = backend('A', async () => OUT, false);
    const b = backend('B', async () => OUT);
    expect((await new BackendChain([a, b]).run(input)).provider).toBe('B');
    expect(a.calls).toBe(0);
  });

  it('throws the last error when every backend fails', async () => {
    const a = backend('A', async () => { throw new BackendError('quota', 'first'); });
    const b = backend('B', async () => { throw new BackendError('timeout', 'second'); });
    await expect(new BackendChain([a, b]).run(input)).rejects.toThrow('second');
  });

  it('stops trying once the caller has aborted', async () => {
    const controller = new AbortController();
    const a = backend('A', async () => { controller.abort(); throw new Error('aborted'); });
    const b = backend('B', async () => OUT);
    await expect(new BackendChain([a, b]).run(input, controller.signal)).rejects.toThrow('aborted');
    expect(b.calls).toBe(0);
  });

  it('needs at least one backend', () => {
    expect(() => new BackendChain([])).toThrow();
  });
});
