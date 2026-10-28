/**
 * @module stores/realtimeStore
 *
 * State of the optional live AI try-on (Tier C).
 */

import { create } from 'zustand';
import type { RealtimeState } from '@tryanywhere/engine';

export type RealtimeStatus = 'off' | 'starting' | 'live' | 'error';

export interface RealtimeStoreState {
  /** The server says live AI try-on is enabled and configured. */
  available: boolean;
  status: RealtimeStatus;
  connection: RealtimeState | null;
  /** Transformed video from the provider. */
  remoteStream: MediaStream | null;
  error: string | null;
  elapsedSeconds: number;
  maxSeconds: number;
  billedSeconds: number;

  setAvailable: (available: boolean, maxSeconds?: number) => void;
  setStatus: (status: RealtimeStatus) => void;
  setConnection: (c: RealtimeState | null) => void;
  setRemoteStream: (s: MediaStream | null) => void;
  setError: (message: string | null) => void;
  setElapsed: (s: number) => void;
  setBilled: (s: number) => void;
  reset: () => void;
}

export const useRealtimeStore = create<RealtimeStoreState>((set) => ({
  available: false,
  status: 'off',
  connection: null,
  remoteStream: null,
  error: null,
  elapsedSeconds: 0,
  maxSeconds: 300,
  billedSeconds: 0,

  setAvailable: (available, maxSeconds) => set((s) => ({ available, maxSeconds: maxSeconds ?? s.maxSeconds })),
  setStatus: (status) => set({ status }),
  setConnection: (connection) => set({ connection }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setError: (error) => set(error ? { error, status: 'error' } : { error: null }),
  setElapsed: (elapsedSeconds) => set({ elapsedSeconds }),
  setBilled: (billedSeconds) => set({ billedSeconds }),
  reset: () => set({ status: 'off', connection: null, remoteStream: null, elapsedSeconds: 0, billedSeconds: 0 }),
}));
