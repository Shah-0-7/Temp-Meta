/**
 * @module providers/defaults
 *
 * Wires the default (no API key) providers into a registry. Remote/Meta
 * providers register themselves on top via `registerFactory`.
 */

import { ProviderRegistry, type ProviderConfig } from './registry.js';
import { FloodFillSegmenter } from './garment-segmenter/FloodFillSegmenter.js';
import { HeuristicUnderstanding } from './image-understanding/HeuristicUnderstanding.js';
import { CutoutOnlyNormalizer } from './garment-normalizer/CutoutOnlyNormalizer.js';
import { LocalTryOnGenerator, type LocalTryOnGeneratorOptions } from './tryon-generator/LocalTryOnGenerator.js';
import { NullRealtimeTryOn } from './realtime-tryon/NullRealtimeTryOn.js';

export interface AppRegistryOptions {
  config?: ProviderConfig;
  local?: LocalTryOnGeneratorOptions;
}

/** Registry whose defaults all work offline: local cut-out, local render, no realtime. */
export function createAppRegistry(options: AppRegistryOptions = {}): ProviderRegistry {
  const registry = new ProviderRegistry(options.config ?? { providers: {} });
  registry.registerDefault('garment-segmenter', () => new FloodFillSegmenter());
  registry.registerDefault('image-understanding', () => new HeuristicUnderstanding());
  registry.registerDefault('garment-normalizer', () => new CutoutOnlyNormalizer());
  registry.registerDefault('tryon-generator', () => new LocalTryOnGenerator(options.local));
  registry.registerDefault('realtime-tryon', () => new NullRealtimeTryOn());
  return registry;
}
