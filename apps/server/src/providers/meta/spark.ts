/**
 * @module server/providers/meta/spark
 *
 * Meta Muse Spark — ImageUnderstanding implementation.
 *
 * Endpoint: POST /v1/responses (Muse Spark via Responses API)
 * Uses: multimodal perception to rank product images, detect garment type,
 *       extract attributes, and generate structured try-on prompts.
 *
 * TODO(M6): Implement against the real Meta Model API.
 *   - Read https://dev.meta.ai/docs for Muse Spark specifics
 *   - POST /v1/responses with model "muse-spark-1.3"
 *   - Input: candidate images + system prompt for garment analysis
 *   - Output: structured JSON with rankings, types, attributes
 */

import type {
  ImageUnderstanding,
  ImageCandidate,
  GarmentCandidate,
  GarmentDescription,
  ProviderCapability,
} from '@tryanywhere/engine';
import { NotConfiguredError } from '@tryanywhere/engine';
import { getMetaConfig } from './shared.js';

export class MetaSparkUnderstanding implements ImageUnderstanding {
  readonly name = 'meta-spark';
  readonly capabilities: readonly ProviderCapability[] = ['image-understanding'];

  async initialize(): Promise<void> {
    getMetaConfig('META_MODEL_SPARK');
  }

  async dispose(): Promise<void> {
    // No-op
  }

  async rankCandidates(_images: ImageCandidate[]): Promise<GarmentCandidate[]> {
    // TODO(M6): Implement with Muse Spark multimodal perception
    // const config = getMetaConfig('META_MODEL_SPARK');
    // Send images with a structured prompt asking for garment ranking
    // Parse structured JSON response

    throw new NotConfiguredError(
      this.name,
      'Meta Muse Spark provider not yet implemented. Set META_API_KEY and see https://dev.meta.ai/docs',
    );
  }

  async describeGarment(_image: ImageBitmap): Promise<GarmentDescription> {
    // TODO(M6): Implement with Muse Spark
    throw new NotConfiguredError(
      this.name,
      'Meta Muse Spark provider not yet implemented. Set META_API_KEY and see https://dev.meta.ai/docs',
    );
  }
}
