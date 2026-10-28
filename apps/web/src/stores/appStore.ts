/**
 * @module stores/appStore
 *
 * Global application state managed by Zustand.
 * Lightweight bridge between React UI and the engine.
 */

import { create } from 'zustand';
import type { PoseStatus } from '@tryanywhere/engine';

export interface AppState {
  /** Whether the engine has completed initialization */
  engineReady: boolean;
  /** Global error message, if any */
  error: string | null;
  /** Active render tier */
  activeTier: 'a' | 'b' | 'c';
  /** Whether the debug overlay is visible */
  debugOverlay: boolean;
  /** Latest fit guidance from the tracker (null until tracking runs) */
  poseStatus: PoseStatus | null;
  /** Where the tracking models came from, for the HUD/diagnostics */
  trackingSource: 'local' | 'cdn' | null;
  /** Set when tracking could not start; the camera preview still works */
  trackingError: string | null;
  /** Help / onboarding dialog */
  helpOpen: boolean;

  // Actions
  setEngineReady: (ready: boolean) => void;
  setError: (error: string | null) => void;
  setActiveTier: (tier: 'a' | 'b' | 'c') => void;
  toggleDebugOverlay: () => void;
  setPoseStatus: (s: PoseStatus | null) => void;
  setTrackingSource: (s: 'local' | 'cdn' | null) => void;
  setTrackingError: (e: string | null) => void;
  setHelpOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  engineReady: false,
  error: null,
  activeTier: 'a',
  debugOverlay: false,
  poseStatus: null,
  trackingSource: null,
  trackingError: null,
  helpOpen: false,

  setEngineReady: (ready) => set({ engineReady: ready }),
  setError: (error) => set({ error }),
  setActiveTier: (tier) => set({ activeTier: tier }),
  toggleDebugOverlay: () => set((s) => ({ debugOverlay: !s.debugOverlay })),
  setPoseStatus: (poseStatus) => set({ poseStatus }),
  setTrackingSource: (trackingSource) => set({ trackingSource }),
  setTrackingError: (trackingError) => set({ trackingError }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}));
