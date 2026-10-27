/**
 * @module tracking/StillAnalyzer
 *
 * Pose + segmentation for ONE still image (MediaPipe IMAGE mode), used by the
 * local high-resolution render. Frame-exact (no temporal filtering, so no lag
 * relative to the captured frame). Models load lazily on first use.
 */

import {
  PoseLandmarker,
  ImageSegmenter,
  FilesetResolver,
} from '@mediapipe/tasks-vision';
import type { Landmark, OcclusionMask, SegmentationMask } from './types.js';
import { cdnAssets, type VisionAssets } from './assets.js';
import { buildOcclusionMask } from './occlusion.js';

export interface StillAnalysis {
  landmarks: Landmark[];
  segmentation: SegmentationMask | null;
  occlusion: OcclusionMask | null;
}

export class StillAnalyzer {
  private _pose: PoseLandmarker | null = null;
  private _seg: ImageSegmenter | null = null;
  private _loading: Promise<void> | null = null;

  constructor(private readonly _assets: VisionAssets = cdnAssets('full')) {}

  private _load(): Promise<void> {
    if (this._pose) return Promise.resolve();
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const vision = await FilesetResolver.forVisionTasks(this._assets.wasmBase);
      // CPU: this runs once per snapshot; avoid fighting the live pipeline for the GPU.
      this._pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: this._assets.poseModel, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
      });
      try {
        this._seg = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: this._assets.segmenterModel, delegate: 'CPU' },
          runningMode: 'IMAGE',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
      } catch (err) {
        // Occlusion is a nicety; the render still works without it.
        console.warn('[StillAnalyzer] Segmenter unavailable, rendering without occlusion:', err);
      }
    })().catch((err) => {
      this._loading = null;
      throw err;
    });
    return this._loading;
  }

  /** @returns null when no person is found. */
  async analyze(image: ImageBitmap): Promise<StillAnalysis | null> {
    await this._load();
    const pose = this._pose!;

    const result = pose.detect(image);
    if (!result.landmarks?.length) return null;
    const landmarks: Landmark[] = result.landmarks[0].map((l) => ({
      x: l.x,
      y: l.y,
      z: l.z ?? 0,
      visibility: l.visibility ?? 0,
    }));

    let segmentation: SegmentationMask | null = null;
    let occlusion: OcclusionMask | null = null;
    if (this._seg) {
      const segResult = this._seg.segment(image);
      const m = segResult.categoryMask;
      if (m) {
        segmentation = {
          data: new Uint8Array(m.getAsUint8Array()),
          width: m.width,
          height: m.height,
          timestamp: 0,
        };
        m.close();
        occlusion = buildOcclusionMask(segmentation, landmarks, {
          aspect: image.width / image.height,
        });
      }
    }
    return { landmarks, segmentation, occlusion };
  }

  dispose(): void {
    this._pose?.close();
    this._seg?.close();
    this._pose = null;
    this._seg = null;
    this._loading = null;
  }
}
