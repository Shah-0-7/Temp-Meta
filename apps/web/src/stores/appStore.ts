/**
 * @module stores/appStore
 *
 * Global application state managed by Zustand.
 * Lightweight bridge between React UI and the engine.
 */

import { create } from 'zustand';

export interface RealisticResult {
  image: string;
  previewImage: string;
  metadata?: {
    provider?: string;
    processingTimeMs?: number;
    creditsRemaining?: number;
    [key: string]: unknown;
  };
}

export interface AppState {
  /** Whether the engine has completed initialization */
  engineReady: boolean;
  /** Global error message, if any */
  error: string | null;
  /** Active render tier */
  activeTier: 'a' | 'b' | 'c';
  /** Whether the debug overlay is visible */
  debugOverlay: boolean;

  // Tier B — Realistic Photo Flow (M5)
  isGeneratingRealistic: boolean;
  generationProgress: number;
  generationStep: string;
  realisticResult: RealisticResult | null;
  realisticDialogOpen: boolean;
  consentDialogOpen: boolean;
  sessionConsentAccepted: boolean;
  activeProviderName: string;

  // Actions
  setEngineReady: (ready: boolean) => void;
  setError: (error: string | null) => void;
  setActiveTier: (tier: 'a' | 'b' | 'c') => void;
  toggleDebugOverlay: () => void;

  setConsentDialogOpen: (open: boolean) => void;
  setSessionConsentAccepted: (accepted: boolean) => void;
  setRealisticDialogOpen: (open: boolean) => void;
  setGenerationState: (isGenerating: boolean, progress?: number, step?: string) => void;
  setRealisticResult: (result: RealisticResult | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  engineReady: false,
  error: null,
  activeTier: 'a',
  debugOverlay: false,

  // Tier B state
  isGeneratingRealistic: false,
  generationProgress: 0,
  generationStep: '',
  realisticResult: null,
  realisticDialogOpen: false,
  consentDialogOpen: false,
  sessionConsentAccepted:
    typeof window !== 'undefined' && sessionStorage.getItem('tryanywhere_consent_accepted') === 'true',
  activeProviderName: 'Mock Generator (Default)',

  setEngineReady: (ready) => set({ engineReady: ready }),
  setError: (error) => set({ error }),
  setActiveTier: (tier) => set({ activeTier: tier }),
  toggleDebugOverlay: () => set((s) => ({ debugOverlay: !s.debugOverlay })),

  setConsentDialogOpen: (consentDialogOpen) => set({ consentDialogOpen }),
  setSessionConsentAccepted: (accepted) => {
    if (typeof window !== 'undefined' && accepted) {
      sessionStorage.setItem('tryanywhere_consent_accepted', 'true');
    }
    set({ sessionConsentAccepted: accepted });
  },
  setRealisticDialogOpen: (realisticDialogOpen) => set({ realisticDialogOpen }),
  setGenerationState: (isGeneratingRealistic, progress = 0, step = '') =>
    set({
      isGeneratingRealistic,
      generationProgress: progress,
      generationStep: step,
    }),
  setRealisticResult: (realisticResult) =>
    set({
      realisticResult,
      isGeneratingRealistic: false,
      activeTier: realisticResult ? 'b' : 'a',
    }),
}));
