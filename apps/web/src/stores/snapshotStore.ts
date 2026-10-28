/**
 * @module stores/snapshotStore
 *
 * In-memory gallery of rendered try-ons for the current session. Never written
 * to disk or sent anywhere: snapshots contain the user's face, so they vanish on reload.
 */

import { create } from 'zustand';
import {
  addSnapshot,
  removeSnapshot,
  toggleCompare,
  pruneSelection,
} from '../lib/snapshotList';

export interface Snapshot {
  id: string;
  createdAt: number;
  beforeBlob: Blob;
  afterBlob: Blob;
  /** Object URLs owned by this snapshot; revoked when it is removed. */
  beforeUrl: string;
  afterUrl: string;
  mirrorBefore: boolean;
  provider: string;
  note: string | null;
  garmentLabel: string;
  garmentThumb: string | null;
}

export type GalleryView = 'grid' | 'compare';

export interface SnapshotState {
  snapshots: Snapshot[];
  open: boolean;
  view: GalleryView;
  /** Ids chosen for outfit comparison (max 2). */
  selected: string[];

  add: (s: Omit<Snapshot, 'id' | 'createdAt' | 'beforeUrl' | 'afterUrl'>) => string;
  remove: (id: string) => void;
  clear: () => void;
  toggleSelected: (id: string) => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setView: (view: GalleryView) => void;
}

function release(s: Snapshot): void {
  URL.revokeObjectURL(s.beforeUrl);
  URL.revokeObjectURL(s.afterUrl);
}

let counter = 0;

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: [],
  open: false,
  view: 'grid',
  selected: [],

  add: (input) => {
    const id = `snap-${Date.now().toString(36)}-${counter++}`;
    const snap: Snapshot = {
      ...input,
      id,
      createdAt: Date.now(),
      beforeUrl: URL.createObjectURL(input.beforeBlob),
      afterUrl: URL.createObjectURL(input.afterBlob),
    };
    const { list, evicted } = addSnapshot(get().snapshots, snap);
    evicted.forEach(release);
    set((s) => ({ snapshots: list, selected: pruneSelection(s.selected, list) }));
    return id;
  },

  remove: (id) => {
    const { list, removed } = removeSnapshot(get().snapshots, id);
    if (removed) release(removed);
    set((s) => {
      const selected = pruneSelection(s.selected, list);
      return { snapshots: list, selected, view: selected.length < 2 ? 'grid' : s.view };
    });
  },

  clear: () => {
    get().snapshots.forEach(release);
    set({ snapshots: [], selected: [], view: 'grid' });
  },

  toggleSelected: (id) => set((s) => ({ selected: toggleCompare(s.selected, id) })),
  setOpen: (open) => set(open ? { open } : { open, view: 'grid' }),
  toggleOpen: () => get().setOpen(!get().open),
  setView: (view) => set({ view }),
}));
