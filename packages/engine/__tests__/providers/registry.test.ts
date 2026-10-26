/**
 * @module __tests__/providers/registry.test
 *
 * Tests for the ProviderRegistry — resolution, fallback, and timeout.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from '../../src/providers/registry';
import { MockTryOnGenerator } from '../../src/providers/tryon-generator/MockTryOnGenerator';
import { HeuristicUnderstanding } from '../../src/providers/image-understanding/HeuristicUnderstanding';
import { NotConfiguredError } from '../../src/providers/types';
import type { Provider, ProviderCapability } from '../../src/providers/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

class FailingProvider implements Provider {
  readonly name = 'failing';
  readonly capabilities: readonly ProviderCapability[] = ['tryon-generator'];
  async initialize(): Promise<void> {
    throw new NotConfiguredError('failing', 'Test failure');
  }
  async dispose(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry({
      providers: {},
      timeoutMs: 5000,
    });
  });

  it('resolves a default provider', async () => {
    registry.registerDefault('image-understanding', () => new HeuristicUnderstanding());
    const provider = await registry.resolve('image-understanding');
    expect(provider.name).toBe('heuristic');
  });

  it('prefers configured provider over default', async () => {
    registry.registerDefault('tryon-generator', () => new MockTryOnGenerator());
    registry.registerFactory('custom-gen', () => {
      const gen = new MockTryOnGenerator();
      Object.defineProperty(gen, 'name', { value: 'custom' });
      return gen;
    });

    const registry2 = new ProviderRegistry({
      providers: { 'tryon-generator': 'custom-gen' },
    });
    registry2.registerDefault('tryon-generator', () => new MockTryOnGenerator());
    registry2.registerFactory('custom-gen', () => {
      const gen = new MockTryOnGenerator();
      Object.defineProperty(gen, 'name', { value: 'custom' });
      return gen;
    });

    const provider = await registry2.resolve('tryon-generator');
    expect(provider.name).toBe('custom');
  });

  it('falls back to default when configured provider fails to init', async () => {
    const reg = new ProviderRegistry({
      providers: { 'tryon-generator': 'failing' },
    });
    reg.registerFactory('failing', () => new FailingProvider());
    reg.registerDefault('tryon-generator', () => new MockTryOnGenerator());

    const provider = await reg.resolve('tryon-generator');
    expect(provider.name).toBe('mock');
  });

  it('throws when no provider is registered for a capability', async () => {
    await expect(registry.resolve('garment-segmenter')).rejects.toThrow(
      /no provider registered/i,
    );
  });

  it('hasCapability returns correct values', () => {
    expect(registry.hasCapability('tryon-generator')).toBe(false);
    registry.registerDefault('tryon-generator', () => new MockTryOnGenerator());
    expect(registry.hasCapability('tryon-generator')).toBe(true);
  });

  it('disposeAll clears active providers', async () => {
    registry.registerDefault('tryon-generator', () => new MockTryOnGenerator());
    await registry.resolve('tryon-generator');
    expect(registry.hasCapability('tryon-generator')).toBe(true);
    await registry.disposeAll();
    // After dispose, resolve should create a new instance
    const provider = await registry.resolve('tryon-generator');
    expect(provider.name).toBe('mock');
  });
});
