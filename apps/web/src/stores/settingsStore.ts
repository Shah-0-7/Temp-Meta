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

  // Actions
  setResolution: (r: ResolutionPreset) => void;
  setFpsCap: (fps: number) => void;
  setTrackingRate: (rate: number) => void;
  setAutoAdapt: (enabled: boolean) => void;
  togglePerfHUD: () => void;
  toggleDebugOverlay: () => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  resolution: '720p',
  fpsCap: 0,
  trackingRate: 30,
  autoAdapt: true,
  showPerfHUD: false,
  showDebugOverlay: false,
  settingsOpen: false,

  setResolution: (resolution) => set({ resolution }),
  setFpsCap: (fpsCap) => set({ fpsCap }),
  setTrackingRate: (trackingRate) => set({ trackingRate }),
  setAutoAdapt: (autoAdapt) => set({ autoAdapt }),
  togglePerfHUD: () => set((s) => ({ showPerfHUD: !s.showPerfHUD })),
  toggleDebugOverlay: () => set((s) => ({ showDebugOverlay: !s.showDebugOverlay })),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
