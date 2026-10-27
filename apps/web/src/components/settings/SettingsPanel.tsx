/**
 * @module components/settings/SettingsPanel
 *
 * Slide-out settings panel with resolution, FPS, tracking,
 * and debug controls.
 */

import { useSettingsStore } from '../../stores/settingsStore';
import { useCamera } from '../../hooks/useCamera';
import type { ResolutionPreset } from '@tryanywhere/engine';

const RESOLUTION_OPTIONS: { value: ResolutionPreset; label: string }[] = [
  { value: '480p', label: '480p (SD)' },
  { value: '720p', label: '720p (HD)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: 'native', label: 'Native (device default)' },
];

const FPS_OPTIONS = [
  { value: 0, label: 'Uncapped' },
  { value: 30, label: '30 FPS' },
  { value: 60, label: '60 FPS' },
];

const TRACKING_RATES = [
  { value: 15, label: '15 fps' },
  { value: 20, label: '20 fps' },
  { value: 30, label: '30 fps' },
];

export function SettingsPanel() {
  const settings = useSettingsStore();
  const { switchResolution, switchDevice, cameraState, devices, activeDeviceId, actualWidth, actualHeight, actualFps } = useCamera();

  const handleResolutionChange = async (preset: ResolutionPreset) => {
    settings.setResolution(preset);
    if (cameraState === 'active') {
      await switchResolution(preset);
    }
  };

  if (!settings.settingsOpen) return null;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 glass rounded-l-2xl border-l border-[var(--color-glass-border)] z-20 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-glass-border)]">
        <h2 className="text-base font-semibold">Settings</h2>
        <button
          onClick={() => settings.setSettingsOpen(false)}
          className="w-7 h-7 rounded-lg glass flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors text-sm"
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>

      <div className="px-5 py-4 flex flex-col gap-6">
        {/* Resolution */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Resolution
          </h3>
          <div className="flex flex-col gap-1.5">
            {RESOLUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleResolutionChange(opt.value)}
                className={`px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  settings.resolution === opt.value
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                    : 'glass text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* FPS Cap */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            FPS Cap
          </h3>
          <div className="flex gap-2">
            {FPS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => settings.setFpsCap(opt.value)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm text-center transition-colors ${
                  settings.fpsCap === opt.value
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                    : 'glass text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Tracking Rate */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Tracking Rate
          </h3>
          <div className="flex gap-2">
            {TRACKING_RATES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => settings.setTrackingRate(opt.value)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm text-center transition-colors ${
                  settings.trackingRate === opt.value
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                    : 'glass text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Camera device + what the browser actually gave us */}
        {cameraState === 'active' && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Camera
            </h3>
            {devices.length > 1 && (
              <select
                value={activeDeviceId ?? ''}
                onChange={(e) => void switchDevice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg glass text-sm text-[var(--color-text-secondary)] mb-2 bg-transparent"
                aria-label="Camera device"
              >
                {activeDeviceId === null && <option value="">Default camera</option>}
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">
              Receiving {actualWidth}×{actualHeight}
              {actualFps ? ` @ ${Math.round(actualFps)} fps` : ''}
            </p>
          </section>
        )}

        {/* Body tracking model */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Body tracking
          </h3>
          <div className="flex gap-2">
            {([
              { value: 'full', label: 'Accurate' },
              { value: 'lite', label: 'Fast' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => settings.setPoseModel(opt.value)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm text-center transition-colors ${
                  settings.poseModel === opt.value
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                    : 'glass text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
            Fast uses a lighter model for older laptops.
          </p>
        </section>

        {/* Garment lighting */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Fabric shading
          </h3>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.garmentShading * 100)}
            onChange={(e) => settings.setGarmentShading(Number(e.target.value) / 100)}
            className="w-full accent-brand-500"
            aria-label="Fabric shading strength"
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            Carries folds and shadows from what you wear now onto the garment. {Math.round(settings.garmentShading * 100)}%
          </p>
        </section>

        {/* Toggles */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Debug
          </h3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between px-3 py-2 rounded-lg glass cursor-pointer">
              <span className="text-sm text-[var(--color-text-secondary)]">Auto-adapt quality</span>
              <input
                type="checkbox"
                checked={settings.autoAdapt}
                onChange={(e) => settings.setAutoAdapt(e.target.checked)}
                className="accent-brand-500 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between px-3 py-2 rounded-lg glass cursor-pointer">
              <span className="text-sm text-[var(--color-text-secondary)]">Performance HUD</span>
              <input
                type="checkbox"
                checked={settings.showPerfHUD}
                onChange={() => settings.togglePerfHUD()}
                className="accent-brand-500 w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between px-3 py-2 rounded-lg glass cursor-pointer">
              <span className="text-sm text-[var(--color-text-secondary)]">Debug overlay</span>
              <input
                type="checkbox"
                checked={settings.showDebugOverlay}
                onChange={() => settings.toggleDebugOverlay()}
                className="accent-brand-500 w-4 h-4"
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
