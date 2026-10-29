/**
 * @module components/camera/PoseHint
 *
 * Tells the user what to change when tracking cannot fit the garment well
 * ("step back", "face the camera"...), instead of leaving a broken overlay.
 */

import { useAppStore } from '../../stores/appStore';
import { useGarmentStore } from '../../stores/garmentStore';

interface PoseHintProps {
  trackingReady: boolean;
}

export function PoseHint({ trackingReady }: PoseHintProps) {
  const status = useAppStore((s) => s.poseStatus);
  const trackingError = useAppStore((s) => s.trackingError);
  const garment = useGarmentStore((s) => s.selectedGarment);
  const prep = useGarmentStore((s) => s.prep);

  let text: string | null = null;
  let offerGarment = false;
  let tone: 'info' | 'warn' | 'error' = 'info';

  if (trackingError) {
    text = trackingError;
    tone = 'error';
  } else if (prep?.loadError) {
    text = prep.loadError;
    tone = 'error';
  } else if (trackingReady && status && status.message) {
    text = status.message;
    tone = status.ok ? 'info' : 'warn';
  } else if (trackingReady && status?.ok && !garment) {
    text = 'Body found. Pick a garment (G) to try it on.';
    offerGarment = true;
  } else if (garment && prep && prep.mode === 'none' && !prep.loadError) {
    text = 'Could not remove the photo background, so the full image is shown. Try a photo on a plain background.';
    tone = 'warn';
  }

  if (!text) return null;

  const color =
    tone === 'error'
      ? 'text-[var(--color-accent-error)]'
      : tone === 'warn'
        ? 'text-[var(--color-accent-warning)]'
        : 'text-[var(--color-text-secondary)]';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`absolute top-4 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2 text-sm max-w-[90%] text-center z-10 ${color}`}
    >
      {text}
      {offerGarment && (
        <button
          onClick={() => useGarmentStore.getState().setGarmentPanelOpen(true)}
          className="btn-primary ml-3 px-3 py-1 rounded-full text-xs"
        >
          Choose garment
        </button>
      )}
    </div>
  );
}
