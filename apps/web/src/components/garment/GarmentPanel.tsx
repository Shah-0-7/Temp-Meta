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
import { Icon } from '../ui/Icon';

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
        // Closed: slid off-screen, no shadow leaking onto the mirror, and out of the tab order.
        inert={!garmentPanelOpen}
        aria-hidden={!garmentPanelOpen}
        className={`sheet sheet-left absolute top-0 bottom-0 left-0 w-[22rem] max-w-[92vw] z-20 flex flex-col overflow-hidden transition-transform duration-300 ${
          garmentPanelOpen ? 'translate-x-0' : '-translate-x-full shadow-none'
        }`}
      >
        {/* Header */}
        <div className="sheet-head shrink-0">
          <div>
            <h2 className="sheet-title">Choose a garment</h2>
            <p className="sheet-sub">Paste a product link or upload a photo.</p>
          </div>
          <button
            onClick={() => setGarmentPanelOpen(false)}
            className="tool icon-btn"
            aria-label="Close garment panel"
          >
            <Icon name="close" size={18} />
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
            <div className="flex flex-col items-start gap-2 py-4">
              <span className="text-[var(--color-text-muted)]">
                <Icon name="search" size={22} />
              </span>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed m-0">
                Paste a product link and the garment photos on that page appear here. Pick the one that shows the
                garment on its own.
              </p>
            </div>
          )}
        </div>

        {/* Selected garment footer */}
        {selectedGarment && (
          <div className="shrink-0 border-t border-[var(--color-glass-border)] p-4 flex items-center gap-3 bg-[var(--color-surface-2)]">
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
                <p className="text-xs text-brand-400 font-medium capitalize">{selectedGarment.garmentType}</p>
              )}
            </div>
            <button
              onClick={clearGarment}
              className="tool icon-btn shrink-0"
              aria-label="Remove selected garment"
              title="Remove garment"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
