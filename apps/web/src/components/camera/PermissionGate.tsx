import { useRef } from 'react';
import { useCameraStore } from '../../stores/cameraStore';

interface PermissionGateProps {
  onRequestCamera: () => void;
  onStartDemo?: () => void;
  onUploadPhoto?: (file: File) => void;
}

export function PermissionGate({
  onRequestCamera,
  onStartDemo,
  onUploadPhoto,
}: PermissionGateProps) {
  const cameraState = useCameraStore((s) => s.cameraState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (cameraState === 'active') {
    return null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadPhoto) {
      onUploadPhoto(file);
    }
  };

  if (cameraState === 'requesting') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 border-3 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
        <p className="text-[var(--color-text-secondary)] animate-pulse">
          Starting camera feed…
        </p>
      </div>
    );
  }

  if (cameraState === 'denied' || cameraState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 max-w-md mx-auto px-6 text-center">
        <div className="text-5xl">{cameraState === 'denied' ? '🚫' : '⚠️'}</div>
        <h3 className="text-xl font-semibold text-[var(--color-accent-warning)]">
          {cameraState === 'denied' ? 'Camera access blocked' : 'Camera unavailable'}
        </h3>
        <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
          {cameraState === 'denied'
            ? 'Camera permission was denied in your browser settings. You can still test virtual try-on with a demo model or upload a photo:'
            : 'Your webcam is in use by another app, covered, or unavailable. You can still test all virtual try-on features:'}
        </p>

        <div className="flex flex-col gap-2.5 w-full max-w-xs mt-2">
          {onStartDemo && (
            <button
              onClick={onStartDemo}
              className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-sm transition-all shadow-lg shadow-brand-500/25"
            >
              🎥 Try Demo Model (Instant)
            </button>
          )}
          {onUploadPhoto && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-xl glass text-sm font-medium hover:text-white transition-colors"
              >
                🖼️ Upload a Photo
              </button>
            </>
          )}
          <button
            onClick={onRequestCamera}
            className="px-4 py-2 rounded-xl text-xs text-[var(--color-text-muted)] hover:text-white transition-colors"
          >
            Retry Webcam Access
          </button>
        </div>
      </div>
    );
  }

  // idle state — show call-to-action
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 max-w-lg mx-auto px-6 text-center">
      <div className="text-6xl">👕</div>
      <h2 className="text-2xl font-bold tracking-tight">
        Try on clothes from{' '}
        <span className="bg-gradient-to-r from-brand-400 to-brand-300 bg-clip-text text-transparent">
          any store
        </span>
      </h2>
      <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed max-w-md">
        Select a garment, then see yourself wearing it live through your webcam, a demo model, or an uploaded photo.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md justify-center">
        <button
          onClick={onRequestCamera}
          className="px-5 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-brand-500/25 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <span>📸</span>
          <span>Enable Webcam</span>
        </button>

        {onStartDemo && (
          <button
            onClick={onStartDemo}
            className="px-5 py-3 rounded-xl glass hover:bg-white/10 text-white font-semibold text-sm transition-all duration-200 border border-brand-500/30 flex items-center justify-center gap-2"
            title="Test immediately with a realistic demo video model"
          >
            <span>🎥</span>
            <span>Demo Model</span>
          </button>
        )}

        {onUploadPhoto && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-3 rounded-xl glass text-[var(--color-text-secondary)] hover:text-white font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2"
            >
              <span>🖼️</span>
              <span>Upload Photo</span>
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-[var(--color-text-muted)] mt-1">
        🔒 Fast Preview is processed 100% on-device. Camera frames never leave your computer.
      </p>
    </div>
  );
}
