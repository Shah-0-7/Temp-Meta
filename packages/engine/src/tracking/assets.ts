/**
 * @module tracking/assets
 *
 * Where MediaPipe's WASM runtime and model files come from.
 *
 * Order of preference:
 *   1. Same-origin files (`/mediapipe/wasm`, `/models/*`), put there by
 *      `pnpm setup:assets`. Works offline, no third-party request, instant.
 *   2. Public CDNs, with the WASM version PINNED to the installed npm package
 *      (a mismatched `@latest` runtime fails with cryptic errors).
 */

/** Must match the `@mediapipe/tasks-vision` version in packages/engine/package.json. */
export const MEDIAPIPE_VERSION = '1.1.1';

/** accuracy/latency trade-off of the body model. `full` is the default. */
export type PoseModelVariant = 'lite' | 'full' | 'heavy';

export interface VisionAssets {
  /** Directory that contains `vision_wasm_internal.js` and friends. */
  wasmBase: string;
  poseModel: string;
  segmenterModel: string;
}

export const SEGMENTER_MODEL_FILE = 'selfie_multiclass_256x256.tflite';

export function poseModelFile(variant: PoseModelVariant): string {
  return `pose_landmarker_${variant}.task`;
}

/** Public CDN locations (fallback). */
export function cdnAssets(
  variant: PoseModelVariant,
  version: string = MEDIAPIPE_VERSION,
): VisionAssets {
  return {
    wasmBase: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`,
    poseModel: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/latest/${poseModelFile(variant)}`,
    segmenterModel: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/${SEGMENTER_MODEL_FILE}`,
  };
}

/** Same-origin locations written by scripts/setup-assets.mjs. `base` must end with '/'. */
export function localAssets(variant: PoseModelVariant, base = '/'): VisionAssets {
  const b = base.endsWith('/') ? base : `${base}/`;
  return {
    wasmBase: `${b}mediapipe/wasm`,
    poseModel: `${b}models/${poseModelFile(variant)}`,
    segmenterModel: `${b}models/${SEGMENTER_MODEL_FILE}`,
  };
}

export interface ResolveAssetsOptions {
  variant?: PoseModelVariant;
  /** Base URL of the app (Vite's `import.meta.env.BASE_URL`). Default '/'. */
  localBase?: string;
  /** Skip the same-origin probe. */
  cdnOnly?: boolean;
  fetchImpl?: typeof fetch;
  /** Per-probe timeout. Default 2500 ms. */
  timeoutMs?: number;
}

export interface ResolvedAssets {
  assets: VisionAssets;
  source: 'local' | 'cdn';
}

/** True when a URL answers 200 with something that is NOT an HTML page (SPA fallback). */
async function exists(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<boolean> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, { method: 'HEAD', signal: ctrl?.signal });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') ?? '';
    return !type.includes('text/html');
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Pick same-origin assets when they are all present, otherwise the CDN. */
export async function resolveVisionAssets(
  options: ResolveAssetsOptions = {},
): Promise<ResolvedAssets> {
  const variant = options.variant ?? 'full';
  const cdn = cdnAssets(variant);
  if (options.cdnOnly) return { assets: cdn, source: 'cdn' };

  const fetchImpl = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fetchImpl) return { assets: cdn, source: 'cdn' };

  const local = localAssets(variant, options.localBase ?? '/');
  const timeout = options.timeoutMs ?? 2500;
  const checks = await Promise.all([
    exists(`${local.wasmBase}/vision_wasm_internal.wasm`, fetchImpl, timeout),
    exists(local.poseModel, fetchImpl, timeout),
    exists(local.segmenterModel, fetchImpl, timeout),
  ]);
  if (checks.every(Boolean)) return { assets: local, source: 'local' };

  // Mixed: use local pieces where available, CDN for the rest.
  const mixed: VisionAssets = {
    wasmBase: checks[0] ? local.wasmBase : cdn.wasmBase,
    poseModel: checks[1] ? local.poseModel : cdn.poseModel,
    segmenterModel: checks[2] ? local.segmenterModel : cdn.segmenterModel,
  };
  return { assets: mixed, source: checks.some(Boolean) ? 'local' : 'cdn' };
}
