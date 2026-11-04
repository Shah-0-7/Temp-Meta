/**
 * @module providers/tryon-generator/LocalTryOnGenerator
 *
 * The no-API-key "Realistic Photo" renderer. Runs entirely in the browser:
 * nothing is uploaded. It re-renders the captured frame at full camera
 * resolution with the same engine as the live preview, but with the settings
 * that cost too much for live use:
 *   - frame-exact pose + segmentation of THAT frame (no temporal lag)
 *   - fine warp mesh (40x40), mipmapped + anisotropic garment texture, MSAA
 *   - lighting transfer from the user's own clothes (folds, creases, shadows)
 *   - face / hair / hands kept in front of the garment
 *
 * It does NOT hallucinate: it cannot repaint what the user is already wearing
 * (e.g. long sleeves under a short-sleeve garment). That is what the Meta Muse
 * Image provider is for; this class is the offline stand-in that implements the
 * same `TryOnGenerator` interface, so the app flow is identical.
 */

import type {
  TryOnGenerator,
  TryOnRequest,
  TryOnResult,
  ProviderCapability,
} from '../types.js';
import type { Landmark, OcclusionMask, SegmentationMask } from '../../tracking/types.js';
import { WebGLContext } from '../../renderer/WebGLContext.js';
import { TierARenderer } from '../../renderer/TierARenderer.js';
import { deriveControlPoints } from '../../tracking/GarmentKeypoints.js';
import { prepareGarmentImage } from '../../garment/prepareGarment.js';
import { PoseModelUnavailableError } from './errors.js';
import { dominantColor, eraseClothes } from './clothesEraser.js';
import type { GarmentAnchors } from '../../garment/anchors.js';

export class NoPersonDetectedError extends Error {
  constructor() {
    super(
      'No person was detected in the captured frame. Step back so your shoulders and hips are visible, then try again.',
    );
    this.name = 'NoPersonDetectedError';
  }
}

export interface StillAnalysisResult {
  landmarks: Landmark[];
  occlusion: OcclusionMask | null;
  /** The class map behind `occlusion`; lets the renderer recolour the clothes being worn. */
  segmentation?: SegmentationMask | null;
}

/** Finds the pose of a captured frame (injected so the engine stays testable and lazy). */
export type StillAnalyzerFn = (frame: ImageBitmap) => Promise<StillAnalysisResult | null>;

export interface LocalTryOnGeneratorOptions {
  /** Frame-exact pose finder (StillAnalyzer). Used before falling back to `request.tracking`. */
  analyze?: StillAnalyzerFn;
  /** Longest side of the output. Never upscales. Default 2048. */
  maxSize?: number;
  /** Lighting transfer strength 0..1. Default 0.6. */
  shading?: number;
  /** Mesh subdivisions. Default 40. */
  gridSize?: number;
}

export class LocalTryOnGenerator implements TryOnGenerator {
  readonly name = 'local';
  readonly capabilities: readonly ProviderCapability[] = ['tryon-generator'];

  private readonly _options: Required<Omit<LocalTryOnGeneratorOptions, 'analyze'>>;
  private readonly _analyze: StillAnalyzerFn | undefined;

  constructor(options: LocalTryOnGeneratorOptions = {}) {
    this._analyze = options.analyze;
    this._options = {
      maxSize: options.maxSize ?? 2048,
      shading: options.shading ?? 0.6,
      gridSize: options.gridSize ?? 40,
    };
  }

  async initialize(): Promise<void> {
    // Models load lazily inside the analyzer on first use.
  }

  async dispose(): Promise<void> {
    // Nothing persistent: GL resources are created and released per render.
  }

  supportsRefinement(): boolean {
    return false;
  }

  async refine(_editHandle: string, _instruction: string): Promise<TryOnResult> {
    throw new Error('The local renderer cannot refine results. Connect the Meta Model API for AI edits.');
  }

  async generate(request: TryOnRequest): Promise<TryOnResult> {
    const started = performance.now();
    if (!request.garmentImages.length) throw new Error('A garment image is required.');

    const person = await createImageBitmap(request.personFrame);
    const garmentBitmap = await createImageBitmap(request.garmentImages[0]);

    try {
      // 1) Where is the body?
      let landmarks: Landmark[] | null = null;
      let occlusion: OcclusionMask | null = null;
      let segmentation: SegmentationMask | null = null;
      let source: 'still-analysis' | 'live-tracking' = 'still-analysis';

      if (this._analyze) {
        try {
          const a = await this._analyze(person);
          if (a) { landmarks = a.landmarks; occlusion = a.occlusion; segmentation = a.segmentation ?? null; }
        } catch (err) {
          console.warn('[LocalTryOn] Still analysis failed, trying live tracking data:', err);
          if (!request.tracking) throw new PoseModelUnavailableError(err);
        }
      }
      if (!landmarks && request.tracking && request.tracking.landmarks.length >= 33) {
        landmarks = request.tracking.landmarks;
        occlusion = request.tracking.occlusion ?? null;
        source = 'live-tracking';
      }
      if (!landmarks) throw new NoPersonDetectedError();

      const mirror = request.tracking?.mirror ?? true;

      // 2) Garment cut-out + anchors
      const garment = prepareGarmentImage(garmentBitmap);

      // 3) Render
      const scale = Math.min(1, this._options.maxSize / Math.max(person.width, person.height));
      const width = Math.max(1, Math.round(person.width * scale));
      const height = Math.max(1, Math.round(person.height * scale));

      const canvas = document.createElement('canvas');
      const ctx = new WebGLContext({ canvas, preserveDrawingBuffer: true, antialias: true });
      ctx.setDrawingBufferSize(width, height);
      const renderer = new TierARenderer(ctx, {
        shading: this._options.shading,
        gridSize: this._options.gridSize,
        smoothingMs: 0,
        lostGraceMs: Infinity,
        opacity: 1,
        edgeFade: 0,
      });

      try {
        renderer.mirror = mirror;
        renderer.setGarment(garment.canvas);

        const cps = deriveControlPoints(landmarks, request.garmentType === 'outerwear' ? 'outerwear' : 'top', {
          mirror,
          aspect: width / height,
          garmentAspect: garment.aspect,
          anchors: garment.anchors,
        });
        if (cps.length < 4) throw new NoPersonDetectedError();

        const now = performance.now();
        renderer.snapTo(cps, now);
        renderer.setOcclusionMask(occlusion);

        // Hide the clothes being worn, so they do not peek out around the new garment.
        // The cleaned frame is what the renderer draws under the garment AND reads its lighting from,
        // so the old shirt's pattern cannot show through the new garment either.
        let frame: TexImageSource = person;
        let clothesErased = false;
        if (segmentation) {
          try {
            const cleaned = buildCleanedFrame(
              person, width, height, segmentation, landmarks, garment.canvas, garment.anchors,
              request.garmentType === 'outerwear' ? 0.2 : 0.12,
            );
            if (cleaned) {
              frame = cleaned;
              clothesErased = true;
            }
          } catch (err) {
            console.warn('[LocalTryOn] Could not hide the current clothes, rendering without that step:', err);
          }
        }
        renderer.draw(frame, now);

        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Could not encode the render as PNG.'))),
            'image/png',
          ),
        );

        return {
          image: blob,
          editHandle: undefined,
          metadata: {
            provider: 'local',
            processingTimeMs: performance.now() - started,
            width,
            height,
            poseSource: source,
            garmentCutout: garment.mode,
            garmentConfidence: garment.confidence,
            occlusion: occlusion !== null,
            clothesErased,
            note: 'Rendered on your device. Nothing was uploaded.',
          },
        };
      } finally {
        renderer.dispose();
        ctx.gl.getExtension('WEBGL_lose_context')?.loseContext();
        ctx.dispose();
      }
    } finally {
      person.close();
      garmentBitmap.close();
    }
  }
}

/** True when the garment's sleeves run well past the elbow (measured from its silhouette). */
export function hasLongSleeves(anchors: GarmentAnchors): boolean {
  const drops: number[] = [];
  if (anchors.sleeveEndL) drops.push(anchors.sleeveEndL[1] - anchors.shoulderL[1]);
  if (anchors.sleeveEndR) drops.push(anchors.sleeveEndR[1] - anchors.shoulderR[1]);
  if (!drops.length) return false;
  return drops.reduce((a, b) => a + b, 0) / drops.length > 0.4;
}

/**
 * The person's frame with the clothes they are wearing recoloured. Null when there was nothing
 * to change. `hemExtend` is how far below the hip joints the new garment's hem reaches.
 */
function buildCleanedFrame(
  person: ImageBitmap,
  width: number,
  height: number,
  segmentation: SegmentationMask,
  landmarks: Landmark[],
  garmentCanvas: HTMLCanvasElement | OffscreenCanvas,
  anchors: GarmentAnchors,
  hemExtend: number,
): HTMLCanvasElement | null {
  const gctx = garmentCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!gctx) return null;
  const g = gctx.getImageData(0, 0, garmentCanvas.width, garmentCanvas.height);
  const color = dominantColor(g.data, g.width, g.height);
  if (!color) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(person, 0, 0, width, height);
  const frame = ctx.getImageData(0, 0, width, height);

  const result = eraseClothes({
    image: { data: frame.data, width, height },
    segmentation,
    landmarks,
    garmentColor: color,
    longSleeves: hasLongSleeves(anchors),
    hemExtend,
  });
  if (!result) return null;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(result.image.data), width, height), 0, 0);
  return canvas;
}
