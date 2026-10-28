import { useEffect } from 'react';
import { CameraView } from './components/camera/CameraView';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { GarmentPanel } from './components/garment/GarmentPanel';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { useGarmentStore } from './stores/garmentStore';
import { useCameraStore } from './stores/cameraStore';
import { useRenderStore } from './stores/renderStore';
import { useSnapshotStore } from './stores/snapshotStore';
import { GalleryPanel } from './components/gallery/GalleryPanel';
import { HelpDialog } from './components/help/HelpDialog';
import { ConsentDialog } from './components/consent/ConsentDialog';
import { useRealtimeLifecycle, startRealtime, stopRealtime } from './hooks/useRealtimeTryOn';
import { useRealtimeStore } from './stores/realtimeStore';
import { useConsentStore } from './stores/consentStore';
import { findShortcut } from './lib/shortcuts';
import { useCamera } from './hooks/useCamera';
import { useRealisticRender } from './hooks/useRealisticRender';

export function App() {
  const { engineReady, error, setHelpOpen } = useAppStore();
  const snapshotCount = useSnapshotStore((s) => s.snapshots.length);
  const galleryOpen = useSnapshotStore((s) => s.open);
  const { togglePerfHUD, toggleDebugOverlay, toggleSettings, settingsOpen } = useSettingsStore();
  const { toggleGarmentPanel, garmentPanelOpen, selectedGarment } = useGarmentStore();
  const { toggleMirror } = useCamera();
  const { render } = useRealisticRender();
  useRealtimeLifecycle();

  // Keyboard shortcuts (the list lives in lib/shortcuts.ts, shared with the help dialog)
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const shortcut = findShortcut(e.key);
      if (!shortcut) return;

      const app = useAppStore.getState();
      const gallery = useSnapshotStore.getState();
      const rendering = useRenderStore.getState();

      // Esc closes the top-most layer first.
      if (shortcut.key === 'escape') {
        if (useConsentStore.getState().pending) useConsentStore.getState().answer(false);
        else if (app.helpOpen) app.setHelpOpen(false);
        else if (gallery.open) gallery.setOpen(false);
        else if (rendering.open) rendering.close();
        else if (settingsOpen) toggleSettings();
        else if (garmentPanelOpen) toggleGarmentPanel();
        return;
      }

      // While a dialog is open, only Esc and ? act.
      const dialogOpen =
        app.helpOpen || gallery.open || rendering.open || !!useConsentStore.getState().pending;
      if (dialogOpen && shortcut.key !== '?') return;

      switch (shortcut.key) {
        case 'p':
          togglePerfHUD();
          break;
        case 'd':
          toggleDebugOverlay();
          break;
        case 'g':
          toggleGarmentPanel();
          break;
        case 'v':
          gallery.toggleOpen();
          break;
        case 'l': {
          const live = useRealtimeStore.getState();
          if (!live.available) break;
          if (live.status === 'live' || live.status === 'starting') void stopRealtime();
          else if (useCameraStore.getState().cameraState === 'active') void startRealtime();
          break;
        }
        case 'm':
          toggleMirror();
          break;
        case '?':
          app.setHelpOpen(!app.helpOpen);
          break;
        case ' ':
          // Space on a focused button should press it, not start a render.
          if (e.target instanceof HTMLButtonElement) break;
          if (useCameraStore.getState().cameraState === 'active') {
            e.preventDefault();
            void render();
          }
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
            aria-pressed={garmentPanelOpen}
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

          {/* Gallery button */}
          <button
            onClick={() => useSnapshotStore.getState().toggleOpen()}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              galleryOpen
                ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                : 'glass text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
            title="Snapshot gallery (V)"
            aria-label={`Snapshot gallery, ${snapshotCount} saved`}
            aria-pressed={galleryOpen}
          >
            Gallery{snapshotCount > 0 ? ` (${snapshotCount})` : ''}
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
            aria-pressed={settingsOpen}
          >
            ⚙
          </button>

          {/* Help */}
          <button
            onClick={() => setHelpOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center glass text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            title="Help and shortcuts (?)"
            aria-label="Help and keyboard shortcuts"
          >
            ?
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

        {/* Snapshot gallery + outfit compare */}
        <GalleryPanel />
      </main>

      <HelpDialog />
      <ConsentDialog />

      {/* Status bar */}
      <footer className="px-6 py-2 flex items-center justify-between text-xs text-[var(--color-text-muted)] border-t border-[var(--color-glass-border)]">
        <span>TryAnywhere v0.1 · Meta Global AI Developer Hackathon</span>
        <div className="flex items-center gap-4">
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">G</kbd> Garment</span>
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">V</kbd> Gallery</span>
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">Space</kbd> Realistic render</span>
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">?</kbd> Help</span>
          <span>Live preview: on-device</span>
        </div>
      </footer>
    </div>
  );
}
