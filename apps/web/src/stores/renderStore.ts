/**
 * @module stores/renderStore
 *
 * State of the "Realistic render" flow (snapshot -> render -> compare -> download).
 */

import { create } from 'zustand';

export type RenderStatus = 'idle' | 'capturing' | 'rendering' | 'done' | 'error';

export interface RenderState {
  open: boolean;
  status: RenderStatus;
  /** Camera frame as captured (un-mirrored). Object URL. */
  beforeUrl: string | null;
  /** The captured frame itself, kept so the result can be saved to the gallery. */
  beforeBlob: Blob | null;
  /** Rendered result. Object URL. */
  afterUrl: string | null;
  afterBlob: Blob | null;
  /** Mirror the "before" image in the compare view so it matches the render. */
  mirrorBefore: boolean;
  provider: string | null;
  note: string | null;
  elapsedMs: number | null;
  error: string | null;

  begin: (mirrorBefore: boolean) => void;
  setCaptured: (beforeUrl: string, beforeBlob: Blob) => void;
  /** Re-open a saved snapshot in the compare view (fresh object URLs). */
  showSnapshot: (s: { beforeBlob: Blob; afterBlob: Blob; mirrorBefore: boolean; provider: string; note: string | null }) => void;
  setDone: (r: { afterBlob: Blob; provider: string; note: string | null; elapsedMs: number }) => void;
  setError: (message: string) => void;
  close: () => void;
}

function revoke(url: string | null): void {
  if (url) URL.revokeObjectURL(url);
}

export const useRenderStore = create<RenderState>((set, get) => ({
  open: false,
  status: 'idle',
  beforeUrl: null,
  beforeBlob: null,
  afterUrl: null,
  afterBlob: null,
  mirrorBefore: true,
  provider: null,
  note: null,
  elapsedMs: null,
  error: null,

  begin: (mirrorBefore) => {
    const { beforeUrl, afterUrl } = get();
    revoke(beforeUrl);
    revoke(afterUrl);
    set({
      open: true,
      status: 'capturing',
      beforeUrl: null,
      beforeBlob: null,
      afterUrl: null,
      afterBlob: null,
      mirrorBefore,
      provider: null,
      note: null,
      elapsedMs: null,
      error: null,
    });
  },
  setCaptured: (beforeUrl, beforeBlob) => set({ beforeUrl, beforeBlob, status: 'rendering' }),
  showSnapshot: ({ beforeBlob, afterBlob, mirrorBefore, provider, note }) => {
    const { beforeUrl, afterUrl } = get();
    revoke(beforeUrl);
    revoke(afterUrl);
    set({
      open: true,
      status: 'done',
      beforeBlob,
      beforeUrl: URL.createObjectURL(beforeBlob),
      afterBlob,
      afterUrl: URL.createObjectURL(afterBlob),
      mirrorBefore,
      provider,
      note,
      elapsedMs: null,
      error: null,
    });
  },
  setDone: ({ afterBlob, provider, note, elapsedMs }) =>
    set({ afterBlob, afterUrl: URL.createObjectURL(afterBlob), provider, note, elapsedMs, status: 'done' }),
  setError: (error) => set({ error, status: 'error' }),
  close: () => {
    const { beforeUrl, afterUrl } = get();
    revoke(beforeUrl);
    revoke(afterUrl);
    set({ open: false, status: 'idle', beforeUrl: null, beforeBlob: null, afterUrl: null, afterBlob: null, error: null });
  },
}));
