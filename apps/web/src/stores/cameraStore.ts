/**
 * @module stores/cameraStore
 *
 * Zustand store for camera state — bridges the engine CameraManager
 * with the React UI layer.
 */

import { create } from 'zustand';
import type { CameraState, CameraDevice, ResolutionPreset } from '@tryanywhere/engine';

export interface CameraStoreState {
  /** Current camera lifecycle state */
  cameraState: CameraState;
  /** List of available camera devices */
  devices: CameraDevice[];
  /** Currently active device ID */
  activeDeviceId: string | null;
  /** Current resolution preset */
  resolution: ResolutionPreset;
  /** Actual resolved resolution (may differ from preset) */
  actualWidth: number;
  actualHeight: number;
  /** Whether the preview is mirrored */
  mirror: boolean;
  /** FPS cap (0 = uncapped) */
  fpsCap: number;
  /** Frame rate reported by the camera driver (0 = unknown) */
  actualFps: number;
  /** Plain-language reason when the camera is denied / in error */
  errorMessage: string | null;

  // Actions
  setCameraState: (state: CameraState) => void;
  setDevices: (devices: CameraDevice[]) => void;
  setActiveDeviceId: (id: string | null) => void;
  setResolution: (preset: ResolutionPreset) => void;
  setActualResolution: (width: number, height: number) => void;
  setMirror: (mirror: boolean) => void;
  toggleMirror: () => void;
  setFpsCap: (fps: number) => void;
  setActualFps: (fps: number) => void;
  setErrorMessage: (message: string | null) => void;
}

export const useCameraStore = create<CameraStoreState>((set) => ({
  cameraState: 'idle',
  devices: [],
  activeDeviceId: null,
  resolution: '720p',
  actualWidth: 0,
  actualHeight: 0,
  mirror: true,
  fpsCap: 0,
  actualFps: 0,
  errorMessage: null,

  setCameraState: (cameraState) => set({ cameraState }),
  setDevices: (devices) => set({ devices }),
  setActiveDeviceId: (activeDeviceId) => set({ activeDeviceId }),
  setResolution: (resolution) => set({ resolution }),
  setActualResolution: (actualWidth, actualHeight) => set({ actualWidth, actualHeight }),
  setMirror: (mirror) => set({ mirror }),
  toggleMirror: () => set((s) => ({ mirror: !s.mirror })),
  setFpsCap: (fpsCap) => set({ fpsCap }),
  setActualFps: (actualFps) => set({ actualFps }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
}));
