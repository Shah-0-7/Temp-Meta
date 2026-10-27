/**
 * @module stores/garmentStore
 *
 * Zustand store for garment selection state.
 * Tracks URL input, candidates, selection, and loading state.
 */

import { create } from 'zustand';
import type { GarmentCandidate } from '@tryanywhere/engine';

/** Extended candidate with proxy URL for display. */
export interface GarmentCandidateWithProxy extends GarmentCandidate {
  proxyUrl?: string;
  alt?: string;
  width?: number;
  height?: number;
}

/** How the garment image was prepared for rendering. */
export interface GarmentPrepInfo {
  mode: 'existing-alpha' | 'flood-fill' | 'mask' | 'none';
  confidence: number;
  loadError: string | null;
}

export type GarmentInputMode = 'url' | 'upload' | 'none';

export interface GarmentStoreState {
  // Input
  inputMode: GarmentInputMode;
  urlInput: string;

  // Resolution
  resolving: boolean;
  resolveError: string | null;
  pageTitle: string | null;
  candidates: GarmentCandidateWithProxy[];

  // Selection
  selectedIndex: number | null;
  selectedGarment: GarmentCandidateWithProxy | null;
  garmentPanelOpen: boolean;
  prep: GarmentPrepInfo | null;

  // Actions
  setInputMode: (mode: GarmentInputMode) => void;
  setUrlInput: (url: string) => void;
  setResolving: (resolving: boolean) => void;
  setResolveError: (error: string | null) => void;
  setCandidates: (candidates: GarmentCandidateWithProxy[], pageTitle?: string) => void;
  selectCandidate: (index: number) => void;
  clearGarment: () => void;
  setGarmentPanelOpen: (open: boolean) => void;
  toggleGarmentPanel: () => void;
  setPrep: (prep: GarmentPrepInfo | null) => void;
}

export const useGarmentStore = create<GarmentStoreState>((set) => ({
  inputMode: 'none',
  urlInput: '',
  resolving: false,
  resolveError: null,
  pageTitle: null,
  candidates: [],
  selectedIndex: null,
  selectedGarment: null,
  garmentPanelOpen: false,
  prep: null,

  setInputMode: (inputMode) => set({ inputMode, resolveError: null }),
  setUrlInput: (urlInput) => set({ urlInput, resolveError: null }),
  setResolving: (resolving) => set({ resolving }),
  setResolveError: (resolveError) => set({ resolveError, resolving: false }),
  setCandidates: (candidates, pageTitle) =>
    set({ candidates, pageTitle: pageTitle ?? null, resolving: false, resolveError: null }),
  selectCandidate: (index) =>
    set((s) => ({
      selectedIndex: index,
      selectedGarment: s.candidates[index] ?? null,
    })),
  clearGarment: () =>
    set({ selectedIndex: null, selectedGarment: null, candidates: [], urlInput: '', inputMode: 'none', pageTitle: null, prep: null }),
  setGarmentPanelOpen: (garmentPanelOpen) => set({ garmentPanelOpen }),
  toggleGarmentPanel: () => set((s) => ({ garmentPanelOpen: !s.garmentPanelOpen })),
  setPrep: (prep) => set({ prep }),
}));
