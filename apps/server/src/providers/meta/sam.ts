/**
 * @module server/providers/meta/sam
 *
 * Meta SAM 3.1 — GarmentSegmenter implementation.
 *
 * Endpoint: POST /v1/responses (SAM 3.1 via Responses API)
 * Supports: text prompts ("shirt"), point prompts, box prompts
 *
 * TODO(M6): Implement against the real Meta Model API.
 *   - Read https://dev.meta.ai/docs for SAM 3.1 specifics
 *   - POST /v1/responses with model "sam-3.1"
 *   - Input: image (base64 data URI) + text/point/box prompt
 *   - Output: bounding boxes and pixel-accurate masks
 */

import type {
  GarmentSegmenter,
  ProviderCapability,
  SegmentationPrompt,
  SegmentationResult,
} from '@tryanywhere/engine';
import { NotConfiguredError } from '@tryanywhere/engine';
import { getMetaConfig } from './shared.js';

export class MetaSAMSegmenter implements GarmentSegmenter {
  readonly name = 'meta-sam';
  readonly capabilities: readonly ProviderCapability[] = ['garment-segmenter'];

  async initialize(): Promise<void> {
    // Validate config is present — will throw NotConfiguredError if no key
    getMetaConfig('META_MODEL_SAM');
  }

  async dispose(): Promise<void> {
    // No-op
  }

  supportsPromptType(_type: SegmentationPrompt['type']): boolean {
    // SAM 3.1 supports all prompt types: text, point, box
    return true;
  }

  async segment(_image: ImageBitmap, _prompt: SegmentationPrompt): Promise<SegmentationResult> {
    // TODO(M6): Implement real SAM 3.1 inference via Meta Model API
    // const config = getMetaConfig('META_MODEL_SAM');
    // const response = await fetch(`${config.baseUrl}/responses`, {
    //   method: 'POST',
    //   headers: authHeaders(config.apiKey),
    //   body: JSON.stringify({
    //     model: config.modelId || 'sam-3.1',
    //     input: [{ type: 'input_image', image_url: `data:image/png;base64,${...}` }],
    //     // ... prompt encoding
    //   }),
    // });
    // return parseSegmentationResponse(await handleMetaResponse(this.name, response));

    throw new NotConfiguredError(
      this.name,
      'Meta SAM 3.1 provider not yet implemented. Set META_API_KEY and see https://dev.meta.ai/docs',
    );
  }
}
