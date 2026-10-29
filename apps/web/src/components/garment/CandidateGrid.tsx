/**
 * @module components/garment/CandidateGrid
 *
 * Responsive grid of image candidates returned by the resolver.
 * Shows each candidate with a preview, score badge, and garment type tag.
 * Selected candidate gets a highlighted ring.
 */

import { useGarmentStore } from '../../stores/garmentStore';
import { Icon } from '../ui/Icon';

export function CandidateGrid() {
  const { candidates, selectedIndex, selectCandidate, pageTitle } = useGarmentStore();

  if (candidates.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {pageTitle && (
        <p className="text-xs text-[var(--color-text-muted)] truncate" title={pageTitle}>
          {pageTitle}
        </p>
      )}

      <p className="field-title !mb-0">
        {candidates.length} image{candidates.length !== 1 ? 's' : ''} found. Pick one.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {candidates.slice(0, 9).map((candidate, index) => {
          const isSelected = selectedIndex === index;
          const displayUrl = candidate.proxyUrl ?? candidate.url;

          return (
            <button
              key={`${candidate.url}-${index}`}
              onClick={() => selectCandidate(index)}
              className={`relative aspect-square rounded-lg overflow-hidden transition-all duration-150 group focus:outline-none ${
                isSelected
                  ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-[var(--color-surface-2)]'
                  : 'hover:ring-1 hover:ring-brand-500/50 ring-offset-1 ring-offset-[var(--color-surface-2)]'
              }`}
              aria-label={`Select image ${index + 1}: ${candidate.alt ?? 'No description'}`}
              aria-pressed={isSelected}
            >
              {/* Candidate image */}
              <img
                src={displayUrl}
                alt={candidate.alt ?? `Candidate ${index + 1}`}
                className="w-full h-full object-cover bg-[var(--color-surface-2)]"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23333'/%3E%3Ctext x='50' y='55' text-anchor='middle' fill='%23666' font-size='12'%3E?%3C/text%3E%3C/svg%3E";
                }}
              />

              {/* Selected check */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-white">
                  <Icon name="check" size={12} strokeWidth={3} />
                </div>
              )}

              {/* Score badge */}
              {typeof candidate.score === 'number' && (
                <div className="absolute bottom-1 left-1 px-1 py-0.5 rounded text-[10px] tabular-nums bg-black/65 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  {(candidate.score * 100).toFixed(0)}%
                </div>
              )}

              {/* Garment type tag */}
              {candidate.garmentType && (
                <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[10px] bg-brand-600 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  {candidate.garmentType}
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-brand-400/0 group-hover:bg-brand-400/5 transition-colors" />
            </button>
          );
        })}
      </div>

      {candidates.length > 9 && (
        <p className="text-xs text-[var(--color-text-muted)] text-center">
          Showing the top 9 of {candidates.length} images.
        </p>
      )}
    </div>
  );
}
