/**
 * @module providers/garment-segmenter/BrowserSAMSegmenter
 *
 * Default GarmentSegmenter that runs SlimSAM via ONNX Runtime Web
 * entirely in the browser (WebGPU preferred, WASM fallback).
 *
 * Supports point and box prompts. Text prompts are NOT supported
 * (those require Meta SAM 3.1 via the server).
 *
 * TODO(M3): Load the actual SlimSAM ONNX model and wire up inference.
 * For now, returns a synthetic mask derived from simple image analysis
 * so the rest of the pipeline can be developed.
 */

import type {
  GarmentSegmenter,
  ProviderCapability,
  SegmentationPrompt,
  SegmentationResult,
} from '../types.js';

export class BrowserSAMSegmenter implements GarmentSegmenter {
  readonly name = 'browser-sam';
  readonly capabilities: readonly ProviderCapability[] = ['garment-segmenter'];

  private _initialized = false;

  async initialize(): Promise<void> {
    if (this._initialized) return;
    // TODO(M3): Load ONNX Runtime Web + SlimSAM model
    // Detect WebGPU, fall back to WASM
    // const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['webgpu', 'wasm'] });
    this._initialized = true;
    console.log('[BrowserSAMSegmenter] Initialized (stub mode — real model not loaded yet)');
  }

  async dispose(): Promise<void> {
    this._initialized = false;
  }

  supportsPromptType(type: SegmentationPrompt['type']): boolean {
    // SlimSAM supports point and box prompts, NOT text
    return type === 'point' || type === 'box';
  }

  async segment(image: ImageBitmap, prompt: SegmentationPrompt): Promise<SegmentationResult> {
    if (!this._initialized) {
      throw new Error('BrowserSAMSegmenter not initialized. Call initialize() first.');
    }

    if (!this.supportsPromptType(prompt.type)) {
      throw new Error(
        `BrowserSAMSegmenter does not support "${prompt.type}" prompts. Use point or box.`,
      );
    }

    // TODO(M3): Real ONNX inference with SlimSAM
    // For now: generate a placeholder center-weighted mask
    const width = image.width;
    const height = image.height;
    const mask = new ImageData(width, height);

    // Simple elliptical mask centered on the image (placeholder)
    const cx = width / 2;
    const cy = height / 2;
    const rx = width * 0.35;
    const ry = height * 0.45;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const dist = dx * dx + dy * dy;
        const alpha = dist < 1 ? 255 : 0;
        const idx = (y * width + x) * 4;
        mask.data[idx] = 255; // R
        mask.data[idx + 1] = 255; // G
        mask.data[idx + 2] = 255; // B
        mask.data[idx + 3] = alpha; // A — the mask
      }
    }

    return {
      masks: [mask],
      scores: [0.85],
      selectedIndex: 0,
    };
  }
}
