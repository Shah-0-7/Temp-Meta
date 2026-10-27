import { useEffect } from 'react';
import { CameraView } from './components/camera/CameraView';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { GarmentPanel } from './components/garment/GarmentPanel';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { useGarmentStore } from './stores/garmentStore';
import { useCameraStore } from './stores/cameraStore';
import { useRenderStore } from './stores/renderStore';
import { useCamera } from './hooks/useCamera';
import { useRealisticRender } from './hooks/useRealisticRender';

export function App() {
  const { engineReady, error } = useAppStore();
  const { togglePerfHUD, toggleDebugOverlay, toggleSettings, settingsOpen } = useSettingsStore();
  const { toggleGarmentPanel, garmentPanelOpen, selectedGarment } = useGarmentStore();
  const { toggleMirror } = useCamera();
  const { render } = useRealisticRender();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'p':
          togglePerfHUD();
          break;
        case 'd':
          toggleDebugOverlay();
          break;
        case 'g':
          toggleGarmentPanel();
          break;
        case 'm':
          toggleMirror();
          break;
        case ' ':
          if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) break;
          if (useCameraStore.getState().cameraState === 'active' && !useRenderStore.getState().open) {
            e.preventDefault();
            void render();
          }
          break;
        case 'escape':
          if (useRenderStore.getState().open) useRenderStore.getState().close();
          if (settingsOpen) toggleSettings();
          if (garmentPanelOpen) toggleGarmentPanel();
          break;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [togglePerfHUD, toggleDebugOverlay, toggleSettings, toggleGarmentPanel, toggleMirror, render, settingsOpen, garmentPanelOpen]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="glass flex items-center justify-between px-6 py-3 border-b border-[var(--color-glass-border)] z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            Try<span className="text-brand-400">Anywhere</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Garment button */}
          <button
            onClick={toggleGarmentPanel}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              garmentPanelOpen || selectedGarment
                ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                : 'glass text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
            title="Choose garment (G)"
            aria-label="Toggle garment panel"
          >
            {selectedGarment ? (
              <img
                src={selectedGarment.proxyUrl ?? selectedGarment.url}
                alt=""
                className="w-5 h-5 rounded object-cover"
              />
            ) : (
              <span>👕</span>
            )}
            <span>{selectedGarment ? 'Change Garment' : 'Add Garment'}</span>
          </button>

          {/* Engine status */}
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] px-2">
            <div
              className={`w-2 h-2 rounded-full ${
                error
                  ? 'bg-[var(--color-accent-error)]'
                  : engineReady
                    ? 'bg-[var(--color-accent-success)]'
                    : 'bg-[var(--color-accent-warning)] animate-pulse'
              }`}
            />
            {error ? 'Error' : engineReady ? 'Ready' : 'Initializing…'}
          </div>

          {/* Settings button */}
          <button
            onClick={toggleSettings}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              settingsOpen
                ? 'bg-brand-600/20 text-brand-400'
                : 'glass text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
            title="Settings"
            aria-label="Toggle settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 relative flex overflow-hidden">
        {/* Camera viewport */}
        <CameraView />

        {/* Garment panel (overlays on left) */}
        <GarmentPanel />

        {/* Settings panel (overlays on right) */}
        <SettingsPanel />
      </main>

      {/* Status bar */}
      <footer className="px-6 py-2 flex items-center justify-between text-xs text-[var(--color-text-muted)] border-t border-[var(--color-glass-border)]">
        <span>TryAnywhere v0.1 · Meta Global AI Developer Hackathon</span>
        <div className="flex items-center gap-4">
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">G</kbd> Garment</span>
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">P</kbd> Perf HUD</span>
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">D</kbd> Debug</span>
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">Space</kbd> Realistic render</span>
          <span>Live preview: on-device</span>
        </div>
      </footer>
    </div>
  );
}
