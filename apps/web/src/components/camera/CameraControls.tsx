/**
 * @module components/camera/CameraControls
 *
 * Floating controls overlaid on the camera view:
 * - Stop camera
 * - Toggle mirror
 * - Realistic render of the current frame
 */

interface CameraControlsProps {
  onStop: () => void;
  onToggleMirror: () => void;
  onSnapshot: () => void;
  mirror: boolean;
  /** Live AI try-on is enabled on the server. The button is hidden otherwise. */
  liveAvailable?: boolean;
  liveActive?: boolean;
  onLive?: () => void;
}

export function CameraControls({
  onStop,
  onToggleMirror,
  onSnapshot,
  mirror,
  liveAvailable = false,
  liveActive = false,
  onLive,
}: CameraControlsProps) {
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

      {/* Snapshot -> realistic render */}
      <button
        onClick={onSnapshot}
        className="w-10 h-10 rounded-full glass flex items-center justify-center text-[var(--color-text-secondary)] hover:text-white transition-colors text-lg"
        title="Realistic render of this moment (Space)"
        aria-label="Realistic render"
      >
        📷
      </button>

      {/* Live AI try-on (optional, third party). Only offered when the server enables it. */}
      {liveAvailable && (
        <button
          onClick={onLive}
          className={`h-10 px-3 rounded-full glass flex items-center justify-center text-sm font-medium transition-colors ${
            liveActive ? 'text-[var(--color-accent-error)]' : 'text-[var(--color-text-secondary)] hover:text-white'
          }`}
          title={liveActive ? 'Stop live AI try-on (L)' : 'Live AI try-on, sends video to a third party (L)'}
          aria-label={liveActive ? 'Stop live AI try-on' : 'Start live AI try-on'}
          aria-pressed={liveActive}
        >
          {liveActive ? '■ Live AI' : '✨ Live AI'}
        </button>
      )}
    </div>
  );
}
