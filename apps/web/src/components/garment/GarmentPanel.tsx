/**
 * @module components/garment/GarmentPanel
 *
 * Slide-in side panel containing the URL input, candidate grid,
 * and the currently selected garment preview with actions.
 */

import { URLInput } from './URLInput';
import { CandidateGrid } from './CandidateGrid';
import { SampleGarments } from './SampleGarments';
import { useGarmentStore } from '../../stores/garmentStore';

export function GarmentPanel() {
  const { garmentPanelOpen, selectedGarment, clearGarment, setGarmentPanelOpen, candidates } =
    useGarmentStore();

  return (
    <>
      {/* Backdrop */}
      {garmentPanelOpen && (
        <div
          className="absolute inset-0 bg-black/20 z-10"
          onClick={() => setGarmentPanelOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={`absolute top-0 bottom-0 left-0 w-80 glass border-r border-[var(--color-glass-border)] z-20 flex flex-col overflow-hidden transition-transform duration-300 ${
          garmentPanelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-glass-border)] shrink-0">
          <div>
            <h2 className="text-base font-semibold">Choose Garment</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Paste a URL or upload an image
            </p>
          </div>
          <button
            onClick={() => setGarmentPanelOpen(false)}
            className="w-7 h-7 rounded-lg glass flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors text-sm"
            aria-label="Close garment panel"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* URL Input */}
          <URLInput />

          {/* First-run friendly samples (no link or server needed) */}
          <SampleGarments />

          {/* Candidate grid */}
          {candidates.length > 0 && <CandidateGrid />}

          {/* Empty state */}
          {candidates.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="text-4xl opacity-50">🔍</div>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                Paste a product URL from any store to discover garment images automatically.
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Works with Amazon, ASOS, Zara, H&M, and more.
              </p>
            </div>
          )}
        </div>

        {/* Selected garment footer */}
        {selectedGarment && (
          <div className="shrink-0 border-t border-[var(--color-glass-border)] p-4 flex items-center gap-3">
            <img
              src={selectedGarment.proxyUrl ?? selectedGarment.url}
              alt={selectedGarment.alt ?? 'Selected garment'}
              className="w-12 h-12 rounded-lg object-cover bg-[var(--color-surface-2)] shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                {selectedGarment.alt ?? selectedGarment.garmentType ?? 'Garment selected'}
              </p>
              {selectedGarment.garmentType && (
                <p className="text-xs text-brand-400 capitalize">{selectedGarment.garmentType}</p>
              )}
            </div>
            <button
              onClick={clearGarment}
              className="w-7 h-7 rounded-lg glass flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent-error)] transition-colors text-sm shrink-0"
              aria-label="Remove selected garment"
              title="Remove garment"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </>
  );
}
