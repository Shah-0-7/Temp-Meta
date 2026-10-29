/**
 * @module components/camera/RenderPanel
 *
 * Result of a "Realistic render": before/after compare slider, PNG download.
 */

import { useRef, useState } from 'react';
import { useRenderStore } from '../../stores/renderStore';
import { useRealisticRender } from '../../hooks/useRealisticRender';
import { useGarmentStore } from '../../stores/garmentStore';
import { useSnapshotStore } from '../../stores/snapshotStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Icon } from '../ui/Icon';

export function RenderPanel() {
  const s = useRenderStore();
  const { render } = useRealisticRender();
  const [split, setSplit] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const hasGarment = useGarmentStore((st) => !!st.selectedGarment);
  const savedCount = useSnapshotStore((st) => st.snapshots.length);
  useFocusTrap(s.open, ref);

  if (!s.open) return null;

  const busy = s.status === 'capturing' || s.status === 'rendering';

  const download = () => {
    if (!s.afterUrl) return;
    const a = document.createElement('a');
    a.href = s.afterUrl;
    a.download = `tryanywhere-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Realistic render"
        className="panel-dark rounded-[22px] max-w-4xl w-full max-h-full overflow-auto p-5 flex flex-col gap-4 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="sheet-title">Your photo</h2>
          <button onClick={s.close} className="tool icon-btn" aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        {s.status === 'error' && (
          <div role="alert" className="rounded-xl p-4 text-sm bg-black/30 flex flex-col gap-3">
            <p className="text-[var(--color-accent-error)]">{s.error}</p>
            <div className="flex gap-2">
              {!hasGarment && (
                <button
                  onClick={() => {
                    s.close();
                    useGarmentStore.getState().setGarmentPanelOpen(true);
                  }}
                  className="btn-primary px-3.5 py-2 rounded-xl text-sm"
                >
                  Choose a garment
                </button>
              )}
              <button onClick={() => void render()} className="glass px-3.5 py-2 rounded-xl text-sm font-medium">
                Try again
              </button>
            </div>
          </div>
        )}

        {s.beforeUrl && s.status !== 'error' && (
          <div
            className="relative w-full select-none overflow-hidden rounded-xl bg-black"
            style={{ touchAction: 'none' }}
          >
            {/* "after" fills the box and defines its size */}
            {s.afterUrl ? (
              <img src={s.afterUrl} alt="Rendered try-on" className="w-full h-auto block" draggable={false} />
            ) : (
              <img
                src={s.beforeUrl}
                alt="Captured frame"
                className="w-full h-auto block opacity-60"
                style={{ transform: s.mirrorBefore ? 'scaleX(-1)' : undefined }}
                draggable={false}
              />
            )}
            {s.afterUrl && (
              <>
                <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
                  <img
                    src={s.beforeUrl}
                    alt="Original frame"
                    className="w-full h-full object-cover"
                    style={{ transform: s.mirrorBefore ? 'scaleX(-1)' : undefined }}
                    draggable={false}
                  />
                </div>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white/90 pointer-events-none"
                  style={{ left: `${split}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  onChange={(e) => setSplit(Number(e.target.value))}
                  className="absolute inset-x-0 bottom-3 mx-6 accent-brand-500"
                  aria-label="Compare before and after"
                  aria-valuetext={`${split}% before, ${100 - split}% after`}
                />
                <span className="absolute top-2 left-2 text-xs glass rounded px-2 py-0.5">Before</span>
                <span className="absolute top-2 right-2 text-xs glass rounded px-2 py-0.5">After</span>
              </>
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="glass rounded-xl px-4 py-2 text-sm flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
                  {s.status === 'capturing' ? 'Capturing…' : 'Rendering…'}
                </div>
              </div>
            )}
          </div>
        )}

        {s.status === 'done' && (
          <div className="text-sm text-[var(--color-text-secondary)] flex flex-col gap-1">
            {/* A note explains anything the person could not see for themselves (for example, why the
                on-device render was used). Without one, a local render never left the device. */}
            <p className="m-0">
              {s.note
                ? s.note
                : s.provider === 'local'
                  ? 'Made on your device. Nothing was uploaded.'
                  : `Made by ${s.provider}.`}
              {s.elapsedMs !== null && ` Took ${(s.elapsedMs / 1000).toFixed(1)} s.`}
            </p>
            {s.provider === 'local' && (
              <p className="m-0 text-[var(--color-text-muted)]">
                The on-device render redraws your frame at full resolution. It cannot repaint clothes you are already
                wearing. Turn on the AI render on the server for a generated image.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end items-center">
          {s.status === 'done' && savedCount > 0 && (
            <button
              onClick={() => {
                s.close();
                useSnapshotStore.getState().setOpen(true);
              }}
              className="glass mr-auto px-4 py-2 rounded-xl text-sm font-medium"
            >
              Open gallery ({savedCount})
            </button>
          )}
          <button
            onClick={() => void render()}
            disabled={busy}
            className="glass px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            Retake
          </button>
          <button
            onClick={download}
            disabled={!s.afterUrl}
            className="btn-primary px-4 py-2 rounded-xl text-sm"
          >
            Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}
