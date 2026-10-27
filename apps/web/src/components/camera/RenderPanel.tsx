/**
 * @module components/camera/RenderPanel
 *
 * Result of a "Realistic render": before/after compare slider, PNG download.
 */

import { useState } from 'react';
import { useRenderStore } from '../../stores/renderStore';
import { useRealisticRender } from '../../hooks/useRealisticRender';

export function RenderPanel() {
  const s = useRenderStore();
  const { render } = useRealisticRender();
  const [split, setSplit] = useState(50);

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
    <div
      className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Realistic render"
    >
      <div className="glass rounded-2xl max-w-4xl w-full max-h-full overflow-auto p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Realistic render</h2>
          <button
            onClick={s.close}
            className="w-8 h-8 rounded-lg glass text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {s.status === 'error' && (
          <div className="rounded-xl p-4 text-sm text-[var(--color-accent-error)] bg-black/30">{s.error}</div>
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
                />
                <span className="absolute top-2 left-2 text-xs glass rounded px-2 py-0.5">Before</span>
                <span className="absolute top-2 right-2 text-xs glass rounded px-2 py-0.5">After</span>
              </>
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="glass rounded-xl px-4 py-2 text-sm flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
                  {s.status === 'capturing' ? 'Capturing…' : 'Rendering on your device…'}
                </div>
              </div>
            )}
          </div>
        )}

        {s.status === 'done' && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {s.provider === 'local' ? 'Rendered on your device. Nothing was uploaded.' : `Rendered by ${s.provider}.`}
            {s.elapsedMs !== null && ` ${(s.elapsedMs / 1000).toFixed(1)} s.`}
            {s.provider === 'local' &&
              ' It re-renders your frame at full resolution; it cannot repaint clothes you are already wearing. Connect the Meta Model API for AI photorealism.'}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => void render()}
            disabled={busy}
            className="px-4 py-2 rounded-xl glass text-sm disabled:opacity-50"
          >
            Retake
          </button>
          <button
            onClick={download}
            disabled={!s.afterUrl}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium disabled:opacity-50"
          >
            Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}
