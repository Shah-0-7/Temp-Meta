/**
 * @module server/providers/meta/muse-image
 *
 * Meta Muse Image — TryOnGenerator and GarmentNormalizer implementation.
 *
 * Endpoints:
 *   - POST /v1/images/edits  (single-shot try-on generation)
 *   - POST /v1/responses     (multi-turn refinement with edit handles)
 *
 * Model: muse-image-1.0
 * Supports up to 10 reference images per request.
 *
 * TODO(M6): Implement against the real Meta Model API.
 *   - Read https://dev.meta.ai/docs for Muse Image specifics
 *   - Verify the /images/edits endpoint parameters
 *   - Verify the Responses API multi-turn pattern with previous_response_id
 *   - Test with real garment + person images
 */

import type {
  TryOnGenerator,
  TryOnRequest,
  TryOnResult,
  GarmentNormalizer,
  ProviderCapability,
} from '@tryanywhere/engine';
import { NotConfiguredError } from '@tryanywhere/engine';
import { getMetaConfig } from './shared.js';

// ---------------------------------------------------------------------------
// TryOnGenerator (Tier B — Realistic Photo)
// ---------------------------------------------------------------------------

export class MetaMuseImageGenerator implements TryOnGenerator {
  readonly name = 'meta-muse-image';
  readonly capabilities: readonly ProviderCapability[] = ['tryon-generator'];

  async initialize(): Promise<void> {
    getMetaConfig('META_MODEL_MUSE_IMAGE');
  }

  async dispose(): Promise<void> {
    // No-op
  }

  supportsRefinement(): boolean {
    // Muse Image supports multi-turn editing via the Responses API
    return true;
  }

  async generate(_request: TryOnRequest): Promise<TryOnResult> {
    // TODO(M6): Implement real Muse Image try-on generation
    //
    // const config = getMetaConfig('META_MODEL_MUSE_IMAGE');
    //
    // 1. Encode person frame and garment images as base64
    // 2. Build structured prompt from templates (apps/server/src/prompts/tryon-v1.ts)
    // 3. POST /v1/images/edits with:
    //    {
    //      model: "muse-image-1.0",
    //      prompt: structuredPrompt,
    //      images: [
    //        { image_url: "data:image/png;base64,{garment}" },
    //        { image_url: "data:image/png;base64,{person}" }
    //      ],
    //      n: 1,
    //      size: "1024x1024",
    //      response_format: "b64_json"
    //    }
    // 4. Parse response, decode b64 image
    // 5. For multi-turn: use POST /v1/responses with previous_response_id
    //
    // Key prompt requirements:
    //   - Preserve face, identity, pose, hands, background, lighting EXACTLY
    //   - Replace ONLY the specified garment with the reference
    //   - Keep garment color, logo, print, fabric texture
    //   - Natural drape, folds, creases

    throw new NotConfiguredError(
      this.name,
      'Meta Muse Image provider not yet implemented. Set META_API_KEY and META_MODEL_MUSE_IMAGE. See https://dev.meta.ai/docs',
    );
  }

  async refine(_editHandle: string, _instruction: string): Promise<TryOnResult> {
    // TODO(M6): Implement multi-turn refinement via Responses API
    // Use previous_response_id = editHandle
    throw new NotConfiguredError(this.name);
  }
}

// ---------------------------------------------------------------------------
// GarmentNormalizer (on-model → flat-lay)
// ---------------------------------------------------------------------------

export class MetaMuseImageNormalizer implements GarmentNormalizer {
  readonly name = 'meta-muse-image-normalizer';
  readonly capabilities: readonly ProviderCapability[] = ['garment-normalizer'];

  async initialize(): Promise<void> {
    getMetaConfig('META_MODEL_MUSE_IMAGE');
  }

  async dispose(): Promise<void> {
    // No-op
  }

  isAvailable(): boolean {
    try {
      getMetaConfig('META_MODEL_MUSE_IMAGE');
      return true;
    } catch {
      return false;
    }
  }

  async normalize(_image: ImageBitmap, _mask: ImageData): Promise<ImageBitmap> {
    // TODO(M6): Implement flat-lay synthesis via Muse Image
    // Prompt: "Convert this on-model garment photo to a clean flat-lay product shot
    //          on a white background, preserving exact color, pattern, and details."
    throw new NotConfiguredError(
      this.name,
      'Meta Muse Image normalizer not yet implemented. Set META_API_KEY. See https://dev.meta.ai/docs',
    );
  }
}
