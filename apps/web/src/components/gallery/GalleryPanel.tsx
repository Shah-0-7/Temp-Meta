/**
 * @module components/gallery/GalleryPanel
 *
 * Session gallery of rendered try-ons: re-open, download, delete, and compare
 * two outfits side by side. Memory only (see snapshotStore).
 */

import { useRef } from 'react';
import { useSnapshotStore, type Snapshot } from '../../stores/snapshotStore';
import { useRenderStore } from '../../stores/renderStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';

function download(url: string, name: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

function fileName(s: Snapshot): string {
  return `tryanywhere-${new Date(s.createdAt).toISOString().replace(/[:.]/g, '-')}.png`;
}

function time(s: Snapshot): string {
  return new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function GalleryPanel() {
  const { open, snapshots, selected, view, setOpen, setView, toggleSelected, remove, clear } = useSnapshotStore();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);

  if (!open) return null;

  const picked = selected
    .map((id) => snapshots.find((s) => s.id === id))
    .filter((s): s is Snapshot => !!s);
  const canCompare = picked.length === 2;

  const openOne = (s: Snapshot) => {
    useRenderStore.getState().showSnapshot(s);
    setOpen(false);
  };

  return (
    <div
      className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-title"
        className="glass rounded-2xl max-w-5xl w-full max-h-full overflow-auto p-4 flex flex-col gap-3 outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="gallery-title" className="text-base font-semibold">
            {view === 'compare' ? 'Compare outfits' : `Gallery (${snapshots.length})`}
          </h2>
          <div className="flex items-center gap-2">
            {view === 'compare' ? (
              <button onClick={() => setView('grid')} className="px-3 py-1.5 rounded-lg glass text-sm">
                Back to gallery
              </button>
            ) : (
              <>
                <button
                  onClick={() => setView('compare')}
                  disabled={!canCompare}
                  className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  title={canCompare ? 'Compare the two selected outfits' : 'Tick two snapshots to compare'}
                >
                  Compare{selected.length ? ` (${selected.length}/2)` : ''}
                </button>
                {snapshots.length > 0 && (
                  <button onClick={clear} className="px-3 py-1.5 rounded-lg glass text-sm">
                    Delete all
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-lg glass text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              aria-label="Close gallery"
            >
              ✕
            </button>
          </div>
        </div>

        {snapshots.length === 0 && (
          <div className="rounded-xl p-8 text-center text-sm text-[var(--color-text-secondary)] bg-black/20">
            <p className="font-medium text-[var(--color-text-primary)]">No snapshots yet</p>
            <p className="mt-1">
              Press <kbd className="px-1.5 py-0.5 rounded glass text-xs">Space</kbd> while the camera is on to make a
              realistic render. Each render is saved here for this session.
            </p>
          </div>
        )}

        {view === 'compare' && canCompare && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {picked.map((s) => (
              <figure key={s.id} className="flex flex-col gap-2 m-0">
                <img src={s.afterUrl} alt={`Try-on: ${s.garmentLabel}`} className="w-full rounded-xl bg-black" />
                <figcaption className="text-sm text-[var(--color-text-secondary)]">
                  {s.garmentLabel} · {time(s)}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {view === 'grid' && snapshots.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 list-none p-0 m-0">
            {snapshots.map((s) => {
              const isSelected = selected.includes(s.id);
              return (
                <li
                  key={s.id}
                  className={`rounded-xl overflow-hidden glass flex flex-col ${isSelected ? 'ring-2 ring-brand-400' : ''}`}
                >
                  <button
                    onClick={() => openOne(s)}
                    className="block text-left"
                    aria-label={`Open ${s.garmentLabel} render from ${time(s)}`}
                  >
                    <img src={s.afterUrl} alt="" className="w-full aspect-[4/3] object-cover bg-black" />
                  </button>
                  <div className="p-2 flex flex-col gap-2">
                    <p className="text-xs text-[var(--color-text-secondary)] truncate" title={s.garmentLabel}>
                      {s.garmentLabel} · {time(s)}
                    </p>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(s.id)}
                        className="accent-brand-500"
                      />
                      Compare
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => download(s.afterUrl, fileName(s))}
                        className="flex-1 px-2 py-1 rounded-lg glass text-xs"
                        aria-label={`Download ${s.garmentLabel} render`}
                      >
                        Download
                      </button>
                      <button
                        onClick={() => remove(s.id)}
                        className="px-2 py-1 rounded-lg glass text-xs hover:text-[var(--color-accent-error)]"
                        aria-label={`Delete ${s.garmentLabel} render`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-[var(--color-text-muted)]">
          Snapshots stay in this browser tab&apos;s memory only. They are never uploaded or saved, and disappear when you reload.
        </p>
      </div>
    </div>
  );
}
