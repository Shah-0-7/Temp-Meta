/**
 * @module camera/types
 *
 * Camera-related type definitions.
 */

/** Supported resolution presets. */
export type ResolutionPreset = '480p' | '720p' | '1080p' | 'native';

/** Resolution dimensions in pixels. */
export interface Resolution {
  width: number;
  height: number;
  label: ResolutionPreset;
}

/** Standard resolution presets. */
export const RESOLUTION_PRESETS: Record<ResolutionPreset, Resolution> = {
  '480p':   { width: 640,  height: 480,  label: '480p' },
  '720p':   { width: 1280, height: 720,  label: '720p' },
  '1080p':  { width: 1920, height: 1080, label: '1080p' },
  'native': { width: 0,    height: 0,    label: 'native' }, // uses device default
};

/** Camera device info. */
export interface CameraDevice {
  deviceId: string;
  label: string;
  facing?: 'user' | 'environment';
}

/** Camera state. */
export type CameraState =
  | 'idle'          // No camera requested
  | 'requesting'    // Requesting permission
  | 'active'        // Camera streaming
  | 'denied'        // Permission denied
  | 'error';        // Other error

/** Callback for each video frame. */
export type FrameCallback = (
  video: HTMLVideoElement,
  timestamp: DOMHighResTimeStamp,
) => void;

/** Camera configuration options. */
export interface CameraOptions {
  resolution: ResolutionPreset;
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  /** Target FPS cap (0 = no cap). Default: 0 */
  fpsCap?: number;
  /** Mirror the preview horizontally. Default: true */
  mirror?: boolean;
}
