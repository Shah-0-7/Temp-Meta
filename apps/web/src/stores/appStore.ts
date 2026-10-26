/**
 * @module stores/appStore
 *
 * Global application state managed by Zustand.
 * Lightweight bridge between React UI and the engine.
 */

import { create } from 'zustand';

export interface AppState {
  /** Whether the engine has completed initialization */
  engineReady: boolean;
  /** Global error message, if any */
  error: string | null;
  /** Active render tier */
  activeTier: 'a' | 'b' | 'c';
  /** Whether the debug overlay is visible */
  debugOverlay: boolean;

  // Actions
  setEngineReady: (ready: boolean) => void;
  setError: (error: string | null) => void;
  setActiveTier: (tier: 'a' | 'b' | 'c') => void;
  toggleDebugOverlay: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  engineReady: false,
  error: null,
  activeTier: 'a',
  debugOverlay: false,

  setEngineReady: (ready) => set({ engineReady: ready }),
  setError: (error) => set({ error }),
  setActiveTier: (tier) => set({ activeTier: tier }),
  toggleDebugOverlay: () => set((s) => ({ debugOverlay: !s.debugOverlay })),
}));
