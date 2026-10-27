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
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 border-3 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
        <p className="text-[var(--color-text-secondary)] animate-pulse">
          Requesting camera access…
        </p>
      </div>
    );
  }

  if (cameraState === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 max-w-md mx-auto px-6">
        <div className="text-5xl">🚫</div>
        <h3 className="text-xl font-semibold text-[var(--color-accent-error)]">
          Camera access denied
        </h3>
        <p className="text-[var(--color-text-secondary)] text-center text-sm leading-relaxed">
          {errorMessage ?? 'TryAnywhere needs camera access for the live try-on preview.'} To enable it:
        </p>
        <ol className="text-sm text-[var(--color-text-secondary)] space-y-2 text-left">
          <li className="flex gap-2">
            <span className="text-brand-400 font-semibold shrink-0">1.</span>
            Click the camera icon in your browser's address bar
          </li>
          <li className="flex gap-2">
            <span className="text-brand-400 font-semibold shrink-0">2.</span>
            Select "Allow" for camera access
          </li>
          <li className="flex gap-2">
            <span className="text-brand-400 font-semibold shrink-0">3.</span>
            Reload this page
          </li>
        </ol>
        <button
          onClick={onRequestCamera}
          className="mt-2 px-5 py-2.5 rounded-xl glass text-sm font-medium hover:text-[var(--color-text-primary)] transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (cameraState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 max-w-md mx-auto px-6">
        <div className="text-5xl">⚠️</div>
        <h3 className="text-xl font-semibold text-[var(--color-accent-warning)]">
          Camera error
        </h3>
        <p className="text-[var(--color-text-secondary)] text-center text-sm">
          {errorMessage ?? 'Could not access your camera. Make sure no other app is using it and try again.'}
        </p>
        <button
          onClick={onRequestCamera}
          className="mt-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // idle state — show call-to-action
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 max-w-lg mx-auto px-6">
      <div className="text-7xl">👕</div>
      <h2 className="text-2xl font-bold text-center">
        Try on clothes from{' '}
        <span className="bg-gradient-to-r from-brand-400 to-brand-300 bg-clip-text text-transparent">
          any store
        </span>
      </h2>
      <p className="text-[var(--color-text-secondary)] text-center leading-relaxed">
        Paste a product URL, upload a garment image, or drag & drop — then see yourself
        wearing it live through your webcam.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onRequestCamera}
          className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium transition-all duration-200 hover:shadow-[var(--shadow-glow)] active:scale-[0.98]"
        >
          📸 Enable Camera
        </button>
        <label className="px-6 py-3 rounded-xl glass text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] font-medium transition-all duration-200 text-center cursor-pointer">
          🖼️ Upload a Photo Instead
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
      <p className="text-xs text-[var(--color-text-muted)]">
        Your camera feed never leaves your device in Fast Preview mode.
      </p>
    </div>
  );
}
