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
  GarmentType,
} from './providers/types.js';

export {
  SUPPORTED_GARMENT_TYPES,
  isGarmentTypeSupported,
  NotConfiguredError,
  ProviderTimeoutError,
  RateLimitError,
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
export type { ControlPoint, GarmentType as WarpGarmentType } from './tracking/GarmentKeypoints.js';

