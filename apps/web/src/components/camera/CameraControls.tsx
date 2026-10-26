/**
 * @module components/camera/CameraControls
 *
 * Floating controls overlaid on the camera view:
 * - Stop camera
 * - Toggle mirror
 * - Snapshot (future)
 */

interface CameraControlsProps {
  onStop: () => void;
  onToggleMirror: () => void;
  mirror: boolean;
}

export function CameraControls({ onStop, onToggleMirror, mirror }: CameraControlsProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
      {/* Stop camera */}
      <button
        onClick={onStop}
        className="w-10 h-10 rounded-full glass flex items-center justify-center hover:bg-[var(--color-accent-error)]/20 transition-colors group"
        title="Stop camera"
        aria-label="Stop camera"
      >
        <div className="w-3.5 h-3.5 rounded-sm bg-[var(--color-accent-error)] group-hover:scale-110 transition-transform" />
      </button>

      {/* Mirror toggle */}
      <button
        onClick={onToggleMirror}
        className={`w-10 h-10 rounded-full glass flex items-center justify-center transition-colors text-lg ${
          mirror ? 'text-brand-400' : 'text-[var(--color-text-muted)]'
        }`}
        title={mirror ? 'Mirror on (M)' : 'Mirror off (M)'}
        aria-label="Toggle mirror"
      >
        ↔
      </button>

      {/* Snapshot (placeholder for M7) */}
      <button
        className="w-10 h-10 rounded-full glass flex items-center justify-center text-[var(--color-text-secondary)] hover:text-white transition-colors text-lg"
        title="Take snapshot (Space)"
        aria-label="Take snapshot"
      >
        📷
      </button>
    </div>
  );
}
