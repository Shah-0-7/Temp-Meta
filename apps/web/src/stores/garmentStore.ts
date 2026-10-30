/**
 * @module stores/garmentStore
 *
 * Zustand store for garment selection state.
 * Tracks URL input, candidates, selection, and loading state.
 */

import { create } from 'zustand';
import type { GarmentCandidate, GarmentType } from '@tryanywhere/engine';
import { blobUrlsInUse, pushRecent } from '../lib/garmentList';

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

/** Garment kinds the renderer can actually fit today. */
export const SUPPORTED_GARMENT_TYPES: readonly GarmentType[] = ['top', 'outerwear'];

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
  /** Garments used earlier this session, newest first. Memory only. */
  recents: GarmentCandidateWithProxy[];

  // Actions
  setInputMode: (mode: GarmentInputMode) => void;
  setUrlInput: (url: string) => void;
  setResolving: (resolving: boolean) => void;
  setResolveError: (error: string | null) => void;
  setCandidates: (candidates: GarmentCandidateWithProxy[], pageTitle?: string) => void;
  selectCandidate: (index: number) => void;
  clearGarment: () => void;
  /** Overrides the detected kind of the selected garment (top / jacket). */
  setGarmentType: (type: GarmentType) => void;
  /** Re-selects a garment used earlier this session. */
  pickRecent: (candidate: GarmentCandidateWithProxy) => void;
  setGarmentPanelOpen: (open: boolean) => void;
  toggleGarmentPanel: () => void;
  setPrep: (prep: GarmentPrepInfo | null) => void;
}

export const useGarmentStore = create<GarmentStoreState>((set, get) => {
  /** Applies a change, then revokes any blob URL that nothing references any more. */
  const apply = (patch: Partial<GarmentStoreState> | ((s: GarmentStoreState) => Partial<GarmentStoreState>)) => {
    const before = blobUrlsInUse(get());
    set(patch as Partial<GarmentStoreState>);
    const after = blobUrlsInUse(get());
    for (const url of before) if (!after.has(url)) URL.revokeObjectURL(url);
  };

  return {
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
    recents: [],

    setInputMode: (inputMode) => set({ inputMode, resolveError: null }),
    setUrlInput: (urlInput) => set({ urlInput, resolveError: null }),
    setResolving: (resolving) => set({ resolving }),
    setResolveError: (resolveError) => set({ resolveError, resolving: false }),
    setCandidates: (candidates, pageTitle) =>
      apply({ candidates, pageTitle: pageTitle ?? null, resolving: false, resolveError: null }),
    selectCandidate: (index) =>
      apply((s) => {
        const chosen = s.candidates[index] ?? null;
        return {
          selectedIndex: index,
          selectedGarment: chosen,
          recents: chosen ? pushRecent(s.recents, chosen) : s.recents,
        };
      }),
    clearGarment: () =>
      apply({ selectedIndex: null, selectedGarment: null, candidates: [], urlInput: '', inputMode: 'none', pageTitle: null, prep: null }),
    setGarmentType: (garmentType) =>
      apply((s) => {
        if (!s.selectedGarment) return {};
        const updated = { ...s.selectedGarment, garmentType };
        return {
          selectedGarment: updated,
          candidates: s.candidates.map((c, i) => (i === s.selectedIndex ? updated : c)),
          recents: s.recents.map((r) => (r.url === updated.url ? updated : r)),
        };
      }),
    pickRecent: (candidate) =>
      apply((s) => {
        const at = s.candidates.findIndex((c) => c.url === candidate.url);
        const candidates = at >= 0 ? s.candidates : [candidate];
        return {
          candidates,
          selectedIndex: at >= 0 ? at : 0,
          selectedGarment: candidates[at >= 0 ? at : 0],
          recents: pushRecent(s.recents, candidate),
          resolveError: null,
        };
      }),
    setGarmentPanelOpen: (garmentPanelOpen) => set({ garmentPanelOpen }),
    toggleGarmentPanel: () => set((s) => ({ garmentPanelOpen: !s.garmentPanelOpen })),
    setPrep: (prep) => set({ prep }),
  };
});
