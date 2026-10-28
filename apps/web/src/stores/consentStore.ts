/**
 * @module stores/consentStore
 *
 * Per-session consent before anything leaves the device. Consent is remembered for
 * the tab session only (memory), never persisted, and is asked per provider.
 */

import { create } from 'zustand';

export interface ConsentRequest {
  /** Stable provider key, e.g. "decart". */
  key: string;
  /** Provider name shown to the user. */
  provider: string;
  title: string;
  /** What exactly is sent, as short sentences. */
  sends: string[];
  /** Cost / limit notes. */
  notes: string[];
}

export interface ConsentState {
  granted: Record<string, boolean>;
  pending: ConsentRequest | null;
  /** Resolves true immediately if already granted this session, else opens the dialog. */
  ask: (request: ConsentRequest) => Promise<boolean>;
  answer: (accepted: boolean) => void;
  revoke: (key: string) => void;
}

let resolver: ((accepted: boolean) => void) | null = null;

export const useConsentStore = create<ConsentState>((set, get) => ({
  granted: {},
  pending: null,

  ask: (request) => {
    if (get().granted[request.key]) return Promise.resolve(true);
    // A new question supersedes an unanswered one (counts as "no" for the old one).
    resolver?.(false);
    return new Promise<boolean>((resolve) => {
      resolver = resolve;
      set({ pending: request });
    });
  },

  answer: (accepted) => {
    const req = get().pending;
    if (req && accepted) set((s) => ({ granted: { ...s.granted, [req.key]: true } }));
    set({ pending: null });
    const r = resolver;
    resolver = null;
    r?.(accepted);
  },

  revoke: (key) => set((s) => ({ granted: { ...s.granted, [key]: false } })),
}));
