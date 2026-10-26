/**
 * @module providers/registry
 *
 * Central registry that maps capabilities to provider implementations.
 * Picks one implementation per capability from config, with automatic
 * fallback to the default on error/timeout.
 */

import type {
  Provider,
  ProviderCapability,
  GarmentSegmenter,
  ImageUnderstanding,
  GarmentNormalizer,
  TryOnGenerator,
  RealtimeTryOn,
} from './types.js';
import { ProviderTimeoutError } from './types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  /** Map of capability → provider name to use (e.g. 'garment-segmenter' → 'meta-sam') */
  providers: Partial<Record<ProviderCapability, string>>;
  /** Timeout (ms) before falling back to default. Default: 30 000 */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ProviderRegistry {
  private active = new Map<ProviderCapability, Provider>();
  private defaults = new Map<ProviderCapability, () => Provider>();
  private factories = new Map<string, () => Provider>();
  private config: ProviderConfig;
  private initialized = new Set<string>();

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  // ---- Registration -------------------------------------------------------

  /** Register a named provider factory (e.g. 'browser-sam', 'meta-sam'). */
  registerFactory(name: string, factory: () => Provider): void {
    this.factories.set(name, factory);
  }

  /** Register the default (fallback) provider for a capability. */
  registerDefault(capability: ProviderCapability, factory: () => Provider): void {
    this.defaults.set(capability, factory);
  }

  // ---- Resolution ---------------------------------------------------------

  /** Resolve the active provider for a capability, initializing if needed. */
  async resolve<T extends Provider>(capability: ProviderCapability): Promise<T> {
    // Already resolved?
    const cached = this.active.get(capability);
    if (cached) return cached as T;

    // Try the configured provider first
    const configuredName = this.config.providers[capability];
    if (configuredName && this.factories.has(configuredName)) {
      try {
        const provider = this.factories.get(configuredName)!();
        await this.initializeProvider(provider);
        this.active.set(capability, provider);
        return provider as T;
      } catch (err) {
        console.warn(
          `[ProviderRegistry] Configured provider "${configuredName}" for "${capability}" failed to initialize, falling back to default.`,
          err,
        );
      }
    }

    // Fall back to default
    const defaultFactory = this.defaults.get(capability);
    if (!defaultFactory) {
      throw new Error(`No provider registered for capability "${capability}".`);
    }

    const provider = defaultFactory();
    await this.initializeProvider(provider);
    this.active.set(capability, provider);
    return provider as T;
  }

  /** Check if a capability has any provider registered (configured or default). */
  hasCapability(capability: ProviderCapability): boolean {
    const configuredName = this.config.providers[capability];
    if (configuredName && this.factories.has(configuredName)) return true;
    return this.defaults.has(capability);
  }

  /**
   * Execute a function with the provider for a capability.
   * On error, automatically falls back to the default provider.
   */
  async withFallback<T>(
    capability: ProviderCapability,
    fn: (provider: Provider) => Promise<T>,
  ): Promise<T> {
    const provider = await this.resolve(capability);
    const timeoutMs = this.config.timeoutMs ?? 30_000;

    try {
      return await Promise.race([
        fn(provider),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new ProviderTimeoutError(provider.name, timeoutMs)),
            timeoutMs,
          ),
        ),
      ]);
    } catch (err) {
      // If this IS the default, just throw
      const defaultFactory = this.defaults.get(capability);
      if (defaultFactory) {
        const defaultProvider = defaultFactory();
        if (defaultProvider.name === provider.name) throw err;
      }

      console.warn(
        `[ProviderRegistry] Provider "${provider.name}" failed for "${capability}", falling back to default.`,
        err,
      );

      // Try the default
      const fallbackFactory = this.defaults.get(capability);
      if (!fallbackFactory) throw err;

      const fallback = fallbackFactory();
      await this.initializeProvider(fallback);
      this.active.set(capability, fallback);
      return fn(fallback);
    }
  }

  // ---- Convenience accessors -----------------------------------------------

  async getSegmenter(): Promise<GarmentSegmenter> {
    return this.resolve<GarmentSegmenter>('garment-segmenter');
  }

  async getUnderstanding(): Promise<ImageUnderstanding> {
    return this.resolve<ImageUnderstanding>('image-understanding');
  }

  async getNormalizer(): Promise<GarmentNormalizer> {
    return this.resolve<GarmentNormalizer>('garment-normalizer');
  }

  async getGenerator(): Promise<TryOnGenerator> {
    return this.resolve<TryOnGenerator>('tryon-generator');
  }

  async getRealtime(): Promise<RealtimeTryOn> {
    return this.resolve<RealtimeTryOn>('realtime-tryon');
  }

  // ---- Lifecycle -----------------------------------------------------------

  /** Dispose all active providers. */
  async disposeAll(): Promise<void> {
    const providers = Array.from(this.active.values());
    this.active.clear();
    this.initialized.clear();
    await Promise.allSettled(providers.map((p) => p.dispose()));
  }

  // ---- Private -------------------------------------------------------------

  private async initializeProvider(provider: Provider): Promise<void> {
    if (this.initialized.has(provider.name)) return;
    await provider.initialize();
    this.initialized.add(provider.name);
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let globalRegistry: ProviderRegistry | null = null;

export function createRegistry(config: ProviderConfig): ProviderRegistry {
  globalRegistry = new ProviderRegistry(config);
  return globalRegistry;
}

export function getRegistry(): ProviderRegistry {
  if (!globalRegistry) {
    throw new Error('ProviderRegistry not created yet. Call createRegistry() first.');
  }
  return globalRegistry;
}
