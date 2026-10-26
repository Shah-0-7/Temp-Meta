/**
 * @module components/garment/GarmentPanel
 *
 * Slide-in side panel containing the URL input, candidate grid,
 * and the currently selected garment preview with actions.
 */

import { URLInput } from './URLInput';
import { CandidateGrid } from './CandidateGrid';
import { useGarmentStore } from '../../stores/garmentStore';

const SAMPLE_GARMENTS = [
  {
    url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=80',
    alt: 'White Crewneck Tee',
    garmentType: 'top' as const,
    score: 0.95,
    attributes: { color: 'white', category: 't-shirt' },
  },
  {
    url: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=500&auto=format&fit=crop&q=80',
    alt: 'Vintage Denim Jacket',
    garmentType: 'outerwear' as const,
    score: 0.92,
    attributes: { color: 'blue', category: 'jacket' },
  },
  {
    url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=500&auto=format&fit=crop&q=80',
    alt: 'Casual Grey Hoodie',
    garmentType: 'top' as const,
    score: 0.88,
    attributes: { color: 'grey', category: 'hoodie' },
  },
  {
    url: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=500&auto=format&fit=crop&q=80',
    alt: 'Emerald Knit Sweater',
    garmentType: 'top' as const,
    score: 0.86,
    attributes: { color: 'green', category: 'sweater' },
  },
];

export function GarmentPanel() {
  const {
    garmentPanelOpen,
    selectedGarment,
    clearGarment,
    setGarmentPanelOpen,
    candidates,
    setCandidates,
    selectCandidate,
  } = useGarmentStore();

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
              Paste a URL or try sample garments
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

          {/* Candidate grid */}
          {candidates.length > 0 && <CandidateGrid />}

          {/* Empty state & Quick demo samples */}
          {candidates.length === 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <div className="text-3xl opacity-50">🔍</div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  Paste any product URL, or select a demo garment below to test instantly:
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Demo Garment Presets
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {SAMPLE_GARMENTS.map((garment, idx) => (
                    <button
                      key={garment.url}
                      onClick={() => {
                        setCandidates(SAMPLE_GARMENTS, 'Sample Garments');
                        selectCandidate(idx);
                      }}
                      className="flex flex-col items-center p-2 rounded-xl glass hover:bg-white/10 transition-all border border-[var(--color-glass-border)] group text-left cursor-pointer"
                    >
                      <img
                        src={garment.url}
                        alt={garment.alt}
                        className="w-full aspect-square rounded-lg object-cover bg-black/40 mb-1.5 group-hover:scale-105 transition-transform"
                      />
                      <span className="text-xs font-medium text-white line-clamp-1 w-full text-center">
                        {garment.alt}
                      </span>
                      <span className="text-[10px] text-brand-400 capitalize">
                        {garment.garmentType}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
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
