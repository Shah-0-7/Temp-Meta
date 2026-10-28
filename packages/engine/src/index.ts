/**
 * @module @tryanywhere/engine
 *
 * Public API for the TryAnywhere engine.
 * Framework-agnostic — can be used by the web app, a Chrome extension, or tests.
 */

// Provider types & interfaces
export type {
  Provider,
  ProviderCapability,
  SegmentationPrompt,
  SegmentationResult,
  GarmentSegmenter,
  ImageCandidate,
  GarmentCandidate,
  GarmentDescription,
  ImageUnderstanding,
  GarmentNormalizer,
  TryOnRequest,
  TryOnResult,
  TryOnGenerator,
  RealtimeSession,
  RealtimeTryOn,
  RealtimeState,
  RealtimeConnectOptions,
  GarmentType,
} from './providers/types.js';

export {
  SUPPORTED_GARMENT_TYPES,
  isGarmentTypeSupported,
  NotConfiguredError,
  ProviderTimeoutError,
  RateLimitError,
  ContentPolicyError,
  RealtimeTryOnError,
} from './providers/types.js';

// Provider registry
export { ProviderRegistry, createRegistry, getRegistry } from './providers/registry.js';
export type { ProviderConfig } from './providers/registry.js';

// Default provider implementations
export { BrowserSAMSegmenter } from './providers/garment-segmenter/BrowserSAMSegmenter.js';
export { HeuristicUnderstanding } from './providers/image-understanding/HeuristicUnderstanding.js';
export { CutoutOnlyNormalizer } from './providers/garment-normalizer/CutoutOnlyNormalizer.js';
export { MockTryOnGenerator } from './providers/tryon-generator/MockTryOnGenerator.js';
export { NullRealtimeTryOn } from './providers/realtime-tryon/NullRealtimeTryOn.js';

// Camera (M1)
export { CameraManager } from './camera/CameraManager.js';
export type {
  CameraState,
  CameraDevice,
  CameraOptions,
  FrameCallback,
  ResolutionPreset,
  Resolution,
} from './camera/types.js';
export { RESOLUTION_PRESETS } from './camera/types.js';

// Renderer (M1)
export { WebGLContext } from './renderer/WebGLContext.js';
export type { WebGLContextOptions } from './renderer/WebGLContext.js';
export { PassthroughRenderer } from './renderer/PassthroughRenderer.js';

// Performance (M1)
export { PerfMonitor } from './performance/PerfMonitor.js';
export type { PerfMetrics } from './performance/PerfMonitor.js';

// Filters (M2)
export { OneEuroFilter, OneEuroFilterBank } from './filters/OneEuroFilter.js';
export type { OneEuroFilterConfig } from './filters/OneEuroFilter.js';

// Tracking (M2)
export { TrackingPipeline } from './tracking/TrackingPipeline.js';
export type { TrackingPipelineOptions } from './tracking/TrackingPipeline.js';
export { PoseTracker } from './tracking/PoseTracker.js';
export type { PoseTrackerOptions } from './tracking/PoseTracker.js';
export { Segmenter } from './tracking/Segmenter.js';
export type { SegmenterOptions } from './tracking/Segmenter.js';
export type {
  Landmark,
  PoseLandmarks,
  SegmentationMask,
  TrackingResult,
} from './tracking/types.js';
export { SegmentationClass, PoseIndex, SKELETON_CONNECTIONS } from './tracking/types.js';

// Debug overlay (M2)
export { DebugOverlay } from './renderer/DebugOverlay.js';

// Auto-adapt (M2)
export { AutoAdapt } from './performance/AutoAdapt.js';
export type { AutoAdaptOptions, AdaptLevel, AdaptChangeListener } from './performance/AutoAdapt.js';

// Renderer — M4
export { TierARenderer } from './renderer/TierARenderer.js';
export type { TierARendererOptions } from './renderer/TierARenderer.js';
export { WarpMesh } from './renderer/WarpMesh.js';

// Garment keypoints — M4
export { deriveControlPoints, GARMENT_UV } from './tracking/GarmentKeypoints.js';
export type {
  ControlPoint,
  DeriveOptions,
  GarmentType as WarpGarmentType,
} from './tracking/GarmentKeypoints.js';
export { pointAlongPath } from './tracking/GarmentKeypoints.js';

// ---- Local render (no API key) -------------------------------------------------
export { mlsSimilarity, fitSimilarity } from './renderer/mls.js';
export type { MlsPoint } from './renderer/mls.js';
export { OcclusionPass } from './renderer/OcclusionPass.js';
export { evaluatePose, PoseStatusTracker } from './tracking/PoseQuality.js';
export type { EvaluatePoseOptions } from './tracking/PoseQuality.js';
export { buildOcclusionMask } from './tracking/occlusion.js';
export type { OcclusionOptions } from './tracking/occlusion.js';
export type { OcclusionMask, PoseStatus, PoseStatusCode } from './tracking/types.js';
export { POSE_FILTER_DEFAULTS } from './tracking/TrackingPipeline.js';
export {
  MEDIAPIPE_VERSION,
  cdnAssets,
  localAssets,
  resolveVisionAssets,
} from './tracking/assets.js';
export type { VisionAssets, PoseModelVariant, ResolvedAssets, ResolveAssetsOptions } from './tracking/assets.js';
export { StillAnalyzer } from './tracking/StillAnalyzer.js';
export type { StillAnalysis } from './tracking/StillAnalyzer.js';
export { describeCameraError } from './camera/CameraManager.js';

// Garment preparation (cut-out + anchors)
export * from './garment/cutout.js';
export { analyzeGarment, defaultAnchors, DEFAULT_TOP_ANCHORS } from './garment/anchors.js';
export type { GarmentAnchors } from './garment/anchors.js';
export {
  prepareFromRgba,
  prepareGarmentImage,
  readPixels,
  rgbaToCanvas,
} from './garment/prepareGarment.js';
export type { PrepareOptions, PreparedGarment, PreparedGarmentData, CutoutMode } from './garment/prepareGarment.js';
export * from './mask/rle.js';

// Providers: local implementations + app registry
export { FloodFillSegmenter } from './providers/garment-segmenter/FloodFillSegmenter.js';
export {
  LocalTryOnGenerator,
  NoPersonDetectedError,
} from './providers/tryon-generator/LocalTryOnGenerator.js';
export type {
  LocalTryOnGeneratorOptions,
  StillAnalyzerFn,
} from './providers/tryon-generator/LocalTryOnGenerator.js';
export { PoseModelUnavailableError } from './providers/tryon-generator/errors.js';
export { createAppRegistry } from './providers/defaults.js';


export { DecartRealtimeTryOn, buildRealtimePrompt, flattenOnWhite } from './providers/realtime-tryon/DecartRealtimeTryOn.js';
export type {
  DecartRealtimeOptions,
  RealtimeSdk,
  RealtimeSdkClient,
  RealtimeSdkConnectOptions,
} from './providers/realtime-tryon/DecartRealtimeTryOn.js';
