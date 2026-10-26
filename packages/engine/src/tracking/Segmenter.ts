/**
 * @module tracking/Segmenter
 *
 * Wraps MediaPipe ImageSegmenter with selfie_multiclass_256x256.
 * Outputs per-pixel category masks with classes:
 *   0=background, 1=hair, 2=body-skin, 3=face-skin, 4=clothes, 5=accessories
 *
 * This is used for shading transfer (clothes mask), occlusion (skin/hair),
 * and edge cleanup.
 */

import {
  ImageSegmenter,
  FilesetResolver,
  type ImageSegmenterResult,
} from '@mediapipe/tasks-vision';
import type { SegmentationMask } from './types.js';

export interface SegmenterOptions {
  /** Use GPU delegate if available. Default: true */
  useGpu?: boolean;
}

export class Segmenter {
  private _segmenter: ImageSegmenter | null = null;
  private _initialized = false;
  private _gpuDelegateActive = false;
  private _options: Required<SegmenterOptions>;

  constructor(options: SegmenterOptions = {}) {
    this._options = {
      useGpu: options.useGpu ?? true,
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

    let delegate: 'GPU' | 'CPU' = this._options.useGpu ? 'GPU' : 'CPU';

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
      );

      this._segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
          delegate,
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });

      this._gpuDelegateActive = delegate === 'GPU';
      this._initialized = true;
      console.log(`[Segmenter] Initialized (delegate: ${delegate})`);
    } catch (err) {
      if (delegate === 'GPU') {
        console.warn('[Segmenter] GPU init failed, retrying with CPU:', err);
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
        );

        this._segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });

        this._gpuDelegateActive = false;
        this._initialized = true;
        console.log('[Segmenter] Initialized (delegate: CPU, GPU fallback)');
      } else {
        throw err;
      }
    }
  }

  /** Segment a video frame. Returns per-pixel category mask. */
  segment(video: HTMLVideoElement, timestampMs: number): SegmentationMask | null {
    if (!this._segmenter || !this._initialized) return null;

    const result: ImageSegmenterResult = this._segmenter.segmentForVideo(video, timestampMs);

    if (!result.categoryMask) {
      return null;
    }

    const mpMask = result.categoryMask;
    const width = mpMask.width;
    const height = mpMask.height;

    // Get the raw mask data — MediaPipe returns Float32Array or Uint8Array
    // depending on version. We normalize to Uint8Array.
    const rawData = mpMask.getAsUint8Array();
    const data = new Uint8Array(rawData.length);
    data.set(rawData);

    // Close the mask to release WebGL resources
    mpMask.close();

    return {
      data,
      width,
      height,
      timestamp: timestampMs / 1000,
    };
  }

  async dispose(): Promise<void> {
    this._segmenter?.close();
    this._segmenter = null;
    this._initialized = false;
  }
}
