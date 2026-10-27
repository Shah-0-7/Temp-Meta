/**
 * @module stores/settingsStore
 *
 * Zustand store for app settings — resolution, FPS, tracking rate,
 * auto-adapt, and other tunable parameters.
 */

import { create } from 'zustand';
import type { ResolutionPreset } from '@tryanywhere/engine';

export interface SettingsStoreState {
  /** Output resolution preset */
  resolution: ResolutionPreset;
  /** Target FPS cap (0 = uncapped) */
  fpsCap: number;
  /** Tracking inference rate (fps) */
  trackingRate: number;
  /** Whether auto-adapt (step down quality under load) is enabled */
  autoAdapt: boolean;
  /** Whether the perf HUD overlay is visible */
  showPerfHUD: boolean;
  /** Whether the debug overlay (skeleton, masks) is visible */
  showDebugOverlay: boolean;
  /** Settings panel open/closed */
  settingsOpen: boolean;
  /** Body model: 'full' is more accurate, 'lite' is lighter on weak machines. Applied on the next tracking start. */
  poseModel: 'lite' | 'full';
  /** Lighting transfer from your own clothes onto the garment, 0..1 */
  garmentShading: number;

  // Actions
  setResolution: (r: ResolutionPreset) => void;
  setFpsCap: (fps: number) => void;
  setTrackingRate: (rate: number) => void;
  setAutoAdapt: (enabled: boolean) => void;
  togglePerfHUD: () => void;
  toggleDebugOverlay: () => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
  setPoseModel: (m: 'lite' | 'full') => void;
  setGarmentShading: (v: number) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  resolution: '720p',
  fpsCap: 0,
  trackingRate: 30,
  autoAdapt: true,
  showPerfHUD: false,
  showDebugOverlay: false,
  settingsOpen: false,
  poseModel: 'full',
  garmentShading: 0.5,

  setResolution: (resolution) => set({ resolution }),
  setFpsCap: (fpsCap) => set({ fpsCap }),
  setTrackingRate: (trackingRate) => set({ trackingRate }),
  setAutoAdapt: (autoAdapt) => set({ autoAdapt }),
  togglePerfHUD: () => set((s) => ({ showPerfHUD: !s.showPerfHUD })),
  toggleDebugOverlay: () => set((s) => ({ showDebugOverlay: !s.showDebugOverlay })),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPoseModel: (poseModel) => set({ poseModel }),
  setGarmentShading: (garmentShading) => set({ garmentShading }),
}));
