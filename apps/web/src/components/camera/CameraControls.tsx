/**
 * @module components/camera/CameraControls
 *
 * The dock floating at the bottom of the mirror: stop, mirror, the main action
 * (render this moment as a photo) and, when the server enables it, Live AI.
 */

import { Icon } from '../ui/Icon';

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
    <div className="dock" role="toolbar" aria-label="Camera controls">
      <button onClick={onStop} className="dock-btn" data-tone="danger" title="Stop camera" aria-label="Stop camera">
        <Icon name="stop" size={20} />
      </button>

      <button
        onClick={onToggleMirror}
        className="dock-btn"
        aria-pressed={mirror}
        title={mirror ? 'Mirror on (M)' : 'Mirror off (M)'}
        aria-label="Mirror the preview"
      >
        <Icon name="flip" size={20} />
      </button>

      <span className="dock-sep" aria-hidden="true" />

      <button
        onClick={onSnapshot}
        className="btn-primary dock-render"
        title="Make a full-resolution photo of this moment (Space)"
      >
        <Icon name="camera" size={19} />
        Render photo
        <kbd>Space</kbd>
      </button>

      {/* Live AI try-on (optional, third party). Only offered when the server enables it. */}
      {liveAvailable && (
        <>
          <span className="dock-sep" aria-hidden="true" />
          <button
            onClick={onLive}
            className="dock-btn dock-live"
            data-tone={liveActive ? 'danger' : undefined}
            title={liveActive ? 'Stop live AI try-on (L)' : 'Live AI try-on sends your video to a third party (L)'}
            aria-label={liveActive ? 'Stop live AI try-on' : 'Start live AI try-on'}
            aria-pressed={liveActive}
          >
            <Icon name={liveActive ? 'stop' : 'sparkle'} size={18} />
            Live AI
          </button>
        </>
      )}
    </div>
  );
}
