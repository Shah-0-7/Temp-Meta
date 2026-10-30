/**
 * @module components/garment/RecentGarments
 *
 * The garments tried earlier in this session, one tap to try one again. Memory only: it is
 * gone on reload, like the gallery.
 */

import { useGarmentStore } from '../../stores/garmentStore';

export function RecentGarments() {
  const recents = useGarmentStore((s) => s.recents);
  const selectedUrl = useGarmentStore((s) => s.selectedGarment?.url);
  const pickRecent = useGarmentStore((s) => s.pickRecent);

  // With one entry it is just the garment already chosen.
  if (recents.length < 2) return null;

  return (
    <div>
      <p className="field-title">Tried earlier</p>
      <ul className="recent-row">
        {recents.map((r) => (
          <li key={r.url}>
            <button
              type="button"
              className="recent-chip"
              aria-pressed={r.url === selectedUrl}
              aria-label={`Try again: ${r.alt?.trim() || 'garment'}`}
              title={r.alt}
              onClick={() => pickRecent(r)}
            >
              <img src={r.proxyUrl ?? r.url} alt="" draggable={false} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
