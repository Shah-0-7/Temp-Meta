/**
 * @module components/garment/GarmentKind
 *
 * Lets the person say what the selected garment is (Top or Jacket) when the guess is wrong,
 * and says plainly when it is a kind this release cannot fit.
 */

import { useGarmentStore, SUPPORTED_GARMENT_TYPES } from '../../stores/garmentStore';

const OPTIONS = [
  { type: 'top', label: 'Top' },
  { type: 'outerwear', label: 'Jacket' },
] as const;

export function GarmentKind() {
  const garment = useGarmentStore((s) => s.selectedGarment);
  const setGarmentType = useGarmentStore((s) => s.setGarmentType);
  if (!garment) return null;

  const kind = garment.garmentType;
  const supported = SUPPORTED_GARMENT_TYPES.includes(kind);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span id="garment-kind-label" className="text-[13px] font-semibold text-[var(--color-text-secondary)]">
          This is a
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="garment-kind-label">
          {OPTIONS.map((o) => (
            <button
              key={o.type}
              type="button"
              role="radio"
              aria-checked={kind === o.type}
              onClick={() => setGarmentType(o.type)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {!supported && (
        <p className="text-xs leading-relaxed text-[var(--color-accent-warning)] m-0" role="status">
          This looks like a {kind}. Only tops and jackets are fitted in this version, so it will be drawn as a top
          and may not sit right. Choose Top or Jacket to confirm.
        </p>
      )}
    </div>
  );
}
