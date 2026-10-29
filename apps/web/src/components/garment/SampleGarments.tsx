/**
 * @module components/garment/SampleGarments
 *
 * One-click sample garments, so a first run needs no product link or server.
 */

import { useGarmentStore } from '../../stores/garmentStore';
import { SAMPLE_GARMENTS, sampleToCandidate } from '../../lib/sampleGarments';

export function SampleGarments() {
  const pickSample = (index: number) => {
    const s = useGarmentStore.getState();
    s.setCandidates([sampleToCandidate(SAMPLE_GARMENTS[index], import.meta.env.BASE_URL)]);
    s.selectCandidate(0);
    s.setInputMode('upload');
  };

  return (
    <div>
      <p className="field-title">No link handy? Try a sample.</p>
      <ul className="flex gap-2 list-none p-0 m-0">
        {SAMPLE_GARMENTS.map((s, i) => (
          <li key={s.id} className="flex-1">
            <button
              onClick={() => pickSample(i)}
              className="glass w-full rounded-xl overflow-hidden flex flex-col items-center gap-1.5 p-1.5 hover:ring-2 hover:ring-brand-400/60 transition"
              aria-label={`Try sample: ${s.label}`}
            >
              <img
                src={`${import.meta.env.BASE_URL}${s.file}`}
                alt=""
                className="w-full aspect-square object-contain rounded-lg bg-white"
                draggable={false}
              />
              <span className="text-[11px] leading-tight font-medium text-[var(--color-text-secondary)] text-center">{s.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
