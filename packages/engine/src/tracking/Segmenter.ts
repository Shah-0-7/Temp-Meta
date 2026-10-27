/**
 * @module tracking/Segmenter
 *
 * Wraps MediaPipe ImageSegmenter with selfie_multiclass_256x256.
 * Per-pixel classes: 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 accessories.
 *
 * Used for occlusion (face / hair / hands stay in front of the garment) and for
 * the debug overlay.
 */

import {
  ImageSegmenter,
  FilesetResolver,
  type ImageSegmenterResult,
} from '@mediapipe/tasks-vision';
import type { SegmentationMask } from './types.js';
import { cdnAssets } from './assets.js';

export interface SegmenterOptions {
  /** Use GPU delegate if available. Default: true */
  useGpu?: boolean;
  /** Directory with the WASM runtime. Default: pinned CDN. */
  wasmBase?: string;
  /** URL of the segmentation .tflite. Default: CDN. */
  modelUrl?: string;
}

export class Segmenter {
  private _segmenter: ImageSegmenter | null = null;
  private _initialized = false;
  private _gpuDelegateActive = false;
  private _errorLogged = false;
  private readonly _options: Required<SegmenterOptions>;

  constructor(options: SegmenterOptions = {}) {
    const cdn = cdnAssets('full');
    this._options = {
      useGpu: options.useGpu ?? true,
      wasmBase: options.wasmBase ?? cdn.wasmBase,
      modelUrl: options.modelUrl ?? cdn.segmenterModel,
    };
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get gpuDelegateActive(): boolean {
    return this._gpuDelegateActive;
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;

    const vision = await FilesetResolver.forVisionTasks(this._options.wasmBase);

    const create = (delegate: 'GPU' | 'CPU') =>
      ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: this._options.modelUrl, delegate },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });

    if (this._options.useGpu) {
      try {
        this._segmenter = await create('GPU');
        this._gpuDelegateActive = true;
      } catch (err) {
        console.warn('[Segmenter] GPU delegate unavailable, using CPU:', err);
      }
    }
    if (!this._segmenter) {
      this._segmenter = await create('CPU');
      this._gpuDelegateActive = false;
    }

    this._initialized = true;
    console.log(`[Segmenter] Ready (${this._gpuDelegateActive ? 'GPU' : 'CPU'})`);
  }

  /** Segment a video frame. `timestampMs` must be strictly increasing. */
  segment(video: HTMLVideoElement, timestampMs: number): SegmentationMask | null {
    if (!this._segmenter || !this._initialized) return null;

    let result: ImageSegmenterResult;
    try {
      result = this._segmenter.segmentForVideo(video, timestampMs);
    } catch (err) {
      if (!this._errorLogged) {
        console.warn('[Segmenter] segmentForVideo failed:', err);
        this._errorLogged = true;
      }
      return null;
    }

    const mpMask = result.categoryMask;
    if (!mpMask) return null;

    const width = mpMask.width;
    const height = mpMask.height;
    const data = new Uint8Array(mpMask.getAsUint8Array()); // copy before close()
    mpMask.close();

    return { data, width, height, timestamp: timestampMs / 1000 };
  }

  async dispose(): Promise<void> {
    this._segmenter?.close();
    this._segmenter = null;
    this._initialized = false;
  }
}
