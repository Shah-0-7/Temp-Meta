import { useEffect } from 'react';
import { CameraView } from './components/camera/CameraView';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { GarmentPanel } from './components/garment/GarmentPanel';
import { TopBar } from './components/layout/TopBar';
import { FootBar } from './components/layout/FootBar';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { useGarmentStore } from './stores/garmentStore';
import { useCameraStore } from './stores/cameraStore';
import { useRenderStore } from './stores/renderStore';
import { useSnapshotStore } from './stores/snapshotStore';
import { GalleryPanel } from './components/gallery/GalleryPanel';
import { HelpDialog } from './components/help/HelpDialog';
import { ConsentDialog } from './components/consent/ConsentDialog';
import { Notice } from './components/settings/Notice';
import { useRealtimeLifecycle, startRealtime, stopRealtime } from './hooks/useRealtimeTryOn';
import { useRealtimeStore } from './stores/realtimeStore';
import { useConsentStore } from './stores/consentStore';
import { findShortcut } from './lib/shortcuts';
import { useCamera } from './hooks/useCamera';
import { useRealisticRender } from './hooks/useRealisticRender';

export function App() {
  const { togglePerfHUD, toggleDebugOverlay, toggleSettings, settingsOpen } = useSettingsStore();
  const { toggleGarmentPanel, garmentPanelOpen } = useGarmentStore();
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
      <TopBar />

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
      <Notice />

      <FootBar />
    </div>
  );
}
