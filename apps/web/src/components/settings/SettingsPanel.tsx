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
  const { switchResolution, switchDevice, devices, activeDeviceId, cameraState } = useCamera();

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
        {/* Camera Devices */}
        {devices.length > 1 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Camera Device
            </h3>
            <div className="flex flex-col gap-1.5">
              {devices.map((device) => (
                <button
                  key={device.deviceId}
                  onClick={() => switchDevice(device.deviceId)}
                  className={`px-3 py-2 rounded-lg text-sm text-left transition-colors truncate ${
                    activeDeviceId === device.deviceId
                      ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                      : 'glass text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                  title={device.label}
                >
                  📹 {device.label || `Camera ${device.deviceId.slice(0, 5)}...`}
                </button>
              ))}
            </div>
          </section>
        )}
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
