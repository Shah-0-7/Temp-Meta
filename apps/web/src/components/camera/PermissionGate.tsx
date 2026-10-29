/**
 * @module components/camera/PermissionGate
 *
 * Handles camera permission states with clear UX:
 * - idle: show "Enable Camera" button
 * - requesting: show loading spinner
 * - denied: show instructions to unblock
 * - error: show error message with retry
 */

import { useCameraStore } from '../../stores/cameraStore';
import { useGarmentStore } from '../../stores/garmentStore';
import { Icon } from '../ui/Icon';
import { PatternArt } from './PatternArt';

interface PermissionGateProps {
  onRequestCamera: () => void;
  /** Render an uploaded photo instead of using the camera. */
  onUploadPhoto?: (file: File) => void;
  children: React.ReactNode;
}

export function PermissionGate({ onRequestCamera, onUploadPhoto, children }: PermissionGateProps) {
  const cameraState = useCameraStore((s) => s.cameraState);
  const errorMessage = useCameraStore((s) => s.errorMessage);

  if (cameraState === 'active') {
    return <>{children}</>;
  }

  if (cameraState === 'requesting') {
    return (
      <div className="state" role="status">
        <div className="w-9 h-9 border-[3px] border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
        <h2 className="state-title">Waiting for the camera</h2>
        <p className="hero-copy">Choose Allow in your browser&apos;s permission prompt.</p>
      </div>
    );
  }

  if (cameraState === 'denied') {
    return (
      <div className="state" role="alert">
        <h2 className="state-title">The camera is blocked</h2>
        <p className="hero-copy">
          {errorMessage ?? 'TryAnywhere needs the camera for the live preview.'} To allow it:
        </p>
        <ol className="state-steps">
          <li>Click the camera icon in your browser&apos;s address bar.</li>
          <li>Choose Allow for the camera.</li>
          <li>Reload this page.</li>
        </ol>
        <button onClick={onRequestCamera} className="btn-primary btn-lg">
          Try again
        </button>
      </div>
    );
  }

  if (cameraState === 'error') {
    return (
      <div className="state" role="alert">
        <h2 className="state-title">The camera didn&apos;t start</h2>
        <p className="hero-copy">
          {errorMessage ?? 'Close any other app that is using the camera, then try again.'}
        </p>
        <button onClick={onRequestCamera} className="btn-primary btn-lg">
          Try again
        </button>
      </div>
    );
  }

  // idle: the first thing anyone sees
  return (
    <div className="hero">
      <div className="hero-text">
        <h2 className="hero-title">Try it on before you buy it.</h2>
        <p className="hero-copy">
          Paste a link from any online store, or upload a photo of a garment. Your camera shows you wearing it.
        </p>

        <div className="hero-actions">
          <button onClick={onRequestCamera} className="btn-primary btn-lg">
            <Icon name="camera" size={20} />
            Turn on camera
          </button>
          <label className="btn-outline btn-lg cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2">
            <Icon name="upload" size={20} />
            Use a photo instead
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadPhoto?.(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <button className="link-quiet" onClick={() => useGarmentStore.getState().setGarmentPanelOpen(true)}>
          Pick a garment first
        </button>

        <p className="hero-note">The live preview runs on your device. Anything sent online asks you first.</p>
      </div>

      <div className="hero-art">
        <PatternArt />
      </div>
    </div>
  );
}
