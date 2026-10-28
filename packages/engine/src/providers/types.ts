/**
 * @module providers/types
 *
 * Typed interfaces for every AI capability in TryAnywhere.
 * No vendor-specific types may leak into the engine or UI.
 * Each interface has a default browser-side implementation and a
 * Meta Model API implementation that is plugged in via the registry.
 */

import type { Landmark, OcclusionMask } from '../tracking/types.js';
import type { GarmentAnchors } from '../garment/anchors.js';

// ---------------------------------------------------------------------------
// Garment Type Registry
// ---------------------------------------------------------------------------

/** Supported garment categories. `top` and `outerwear` are implemented now; others are stubbed. */
export type GarmentType = 'top' | 'outerwear' | 'bottom' | 'dress' | 'hat' | 'glasses' | 'shoes';

/** Garment types that are fully implemented in the current build. */
export const SUPPORTED_GARMENT_TYPES: readonly GarmentType[] = ['top', 'outerwear'] as const;

/** Check if a garment type is currently supported by the renderer. */
export function isGarmentTypeSupported(type: GarmentType): boolean {
  return (SUPPORTED_GARMENT_TYPES as readonly string[]).includes(type);
}

// ---------------------------------------------------------------------------
// Provider Capability
// ---------------------------------------------------------------------------

export type ProviderCapability =
  | 'garment-segmenter'
  | 'image-understanding'
  | 'garment-normalizer'
  | 'tryon-generator'
  | 'realtime-tryon';

// ---------------------------------------------------------------------------
// Base Provider
// ---------------------------------------------------------------------------

export interface Provider {
  /** Human-readable name (e.g. "Browser SAM", "Meta SAM 3.1") */
  readonly name: string;
  /** Capabilities this provider implements */
  readonly capabilities: readonly ProviderCapability[];
  /** One-time setup (load models, warm up connections) */
  initialize(): Promise<void>;
  /** Release resources */
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Thrown when a provider is registered but not configured (e.g. missing API key). */
export class NotConfiguredError extends Error {
  constructor(providerName: string, hint?: string) {
    super(
      `Provider "${providerName}" is not configured.${hint ? ` ${hint}` : ''}`
    );
    this.name = 'NotConfiguredError';
  }
}

/** Thrown when a provider operation times out. */
export class ProviderTimeoutError extends Error {
  constructor(providerName: string, timeoutMs: number) {
    super(`Provider "${providerName}" timed out after ${timeoutMs}ms.`);
    this.name = 'ProviderTimeoutError';
  }
}

/** Thrown when rate-limited or credits exhausted. */
export class RateLimitError extends Error {
  public readonly retryAfterMs?: number;
  constructor(providerName: string, retryAfterMs?: number) {
    super(
      `Provider "${providerName}" is rate-limited.${retryAfterMs ? ` Retry after ${retryAfterMs}ms.` : ''}`
    );
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Thrown when a provider's safety system refuses the input (e.g. Muse Image
 * `content_policy_violation`). Not retryable, and NOT a reason to silently fall
 * back to a lower-quality provider: the user should be told why.
 */
export class ContentPolicyError extends Error {
  constructor(providerName: string, detail?: string) {
    super(
      `Provider "${providerName}" declined this request for safety reasons.${detail ? ` ${detail}` : ''}`,
    );
    this.name = 'ContentPolicyError';
  }
}

// ---------------------------------------------------------------------------
// GarmentSegmenter
// ---------------------------------------------------------------------------

export interface SegmentationPrompt {
  type: 'text' | 'point' | 'box';
  value:
    | string
    | { x: number; y: number }
    | { x1: number; y1: number; x2: number; y2: number };
}

export interface SegmentationResult {
  /** One mask per detected object/region */
  masks: ImageData[];
  /** Confidence score per mask, aligned with masks array */
  scores: number[];
  /** Index of the auto-selected best mask */
  selectedIndex: number;
}

export interface GarmentSegmenter extends Provider {
  /** Segment a garment from the image using the given prompt. */
  segment(image: ImageBitmap, prompt: SegmentationPrompt): Promise<SegmentationResult>;
  /** Whether this implementation supports the given prompt type. */
  supportsPromptType(type: SegmentationPrompt['type']): boolean;
}

// ---------------------------------------------------------------------------
// ImageUnderstanding
// ---------------------------------------------------------------------------

export interface ImageCandidate {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface GarmentCandidate {
  url: string;
  score: number;
  garmentType: GarmentType;
  attributes: Record<string, string>;
}

export interface GarmentDescription {
  type: GarmentType;
  attributes: Record<string, string>;
  /** Structured prompt suitable for TryOnGenerator */
  tryonPrompt: string;
}

export interface ImageUnderstanding extends Provider {
  /** Rank candidate images and return them scored with garment metadata. */
  rankCandidates(images: ImageCandidate[]): Promise<GarmentCandidate[]>;
  /** Describe a single garment image for rendering and generation. */
  describeGarment(image: ImageBitmap): Promise<GarmentDescription>;
}

// ---------------------------------------------------------------------------
// GarmentNormalizer
// ---------------------------------------------------------------------------

export interface GarmentNormalizer extends Provider {
  /** Convert an on-model photo to a clean flat-lay / product shot. */
  normalize(image: ImageBitmap, mask: ImageData): Promise<ImageBitmap>;
  /** Whether this normalizer can actually do synthesis (false for cutout-only). */
  isAvailable(): boolean;
}

// ---------------------------------------------------------------------------
// TryOnGenerator (Tier B — Realistic Photo)
// ---------------------------------------------------------------------------

export interface TryOnRequest {
  /** Lossless PNG frame of the person (no garment overlay). */
  personFrame: Blob;
  /**
   * Optional Tier A composite (the live preview with the garment overlay).
   * Real generators ignore it; the mock generator returns it so the whole
   * Tier B flow is demonstrable without any API key.
   */
  compositeFrame?: Blob;
  /**
   * Pose data for the person frame, when the caller already has it (the live
   * tracker). The local renderer needs landmarks; remote generators ignore this.
   */
  tracking?: {
    /** 33 pose landmarks, or an empty array when there is no live data. */
    landmarks: Landmark[];
    occlusion?: OcclusionMask | null;
    /** Was the live preview mirrored? The render matches it. */
    mirror: boolean;
    /** Anchors measured on the cut-out garment, if already computed. */
    anchors?: GarmentAnchors | null;
  };
  /** One or more garment reference images */
  garmentImages: Blob[];
  /** What kind of garment this is */
  garmentType: GarmentType;
  /** Optional structured prompt override */
  prompt?: string;
  options?: {
    preserveBackground?: boolean;
    size?: string;
    /** Number of result variations */
    n?: number;
  };
}

export interface TryOnResult {
  /** The generated image */
  image: Blob;
  /** Edit handle for multi-turn refinement (Muse Image) */
  editHandle?: string;
  /** Provider-specific metadata (credits remaining, model version, etc.) */
  metadata?: Record<string, unknown>;
}

export interface TryOnGenerator extends Provider {
  /** Generate a realistic try-on image. */
  generate(request: TryOnRequest): Promise<TryOnResult>;
  /** Refine a previous result using the edit handle. */
  refine(editHandle: string, instruction: string): Promise<TryOnResult>;
  /** Whether this provider supports multi-turn refinement. */
  supportsRefinement(): boolean;
}

// ---------------------------------------------------------------------------
// RealtimeTryOn (Tier C — Live Realistic)
// ---------------------------------------------------------------------------

export type RealtimeState = 'connecting' | 'connected' | 'generating' | 'reconnecting' | 'disconnected';

/** Normalised realtime failure. `code` is vendor-neutral. */
export class RealtimeTryOnError extends Error {
  constructor(
    public readonly code: 'auth' | 'expired' | 'network' | 'invalid-input' | 'session-limit' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'RealtimeTryOnError';
  }
}

export interface RealtimeConnectOptions {
  garmentType?: GarmentType;
  /** Short text about the garment ("navy crew-neck t-shirt") to sharpen the prompt. */
  description?: string;
  /** Output resolution. Default 720p. */
  resolution?: '720p' | '1080p';
}

export interface RealtimeSession {
  /** Swap garment without reconnecting. */
  updateGarment(garment: ImageBitmap, options?: Pick<RealtimeConnectOptions, 'garmentType' | 'description'>): Promise<void>;
  /** Clean disconnect. */
  disconnect(): void;
  readonly state: RealtimeState;
  /** Seconds of generated video billed so far (0 until the vendor reports it). */
  readonly billedSeconds: number;
  onStateChange(listener: (state: RealtimeState) => void): () => void;
  /** Failures after connect, including the session limit. */
  onError(listener: (error: RealtimeTryOnError) => void): () => void;
  onBilledSeconds(listener: (seconds: number) => void): () => void;
}

export interface RealtimeTryOn extends Provider {
  /** Open a realtime generative try-on session. */
  connect(
    stream: MediaStream,
    garment: ImageBitmap,
    onFrame: (stream: MediaStream) => void,
    options?: RealtimeConnectOptions,
  ): Promise<RealtimeSession>;
  /** Whether this feature is enabled via config/feature flag. */
  isFeatureEnabled(): boolean;
}
