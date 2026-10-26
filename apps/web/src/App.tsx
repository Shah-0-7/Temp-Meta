import { useEffect } from 'react';
import { CameraView } from './components/camera/CameraView';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { GarmentPanel } from './components/garment/GarmentPanel';
import { ConsentDialog } from './components/realistic/ConsentDialog';
import { RealisticDialog } from './components/realistic/RealisticDialog';
import { useRealisticPhoto } from './hooks/useRealisticPhoto';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { useGarmentStore } from './stores/garmentStore';

export function App() {
  const {
    engineReady,
    error,
    setError,
    activeTier,
    setActiveTier,
    realisticDialogOpen,
    setRealisticDialogOpen,
    consentDialogOpen,
    setConsentDialogOpen,
  } = useAppStore();
  const { togglePerfHUD, toggleDebugOverlay, toggleSettings, settingsOpen } = useSettingsStore();
  const { toggleGarmentPanel, garmentPanelOpen, selectedGarment } = useGarmentStore();

  const {
    triggerRealisticPhoto,
    cancelGeneration,
    onConfirmConsent,
    onCancelConsent,
    regenerate,
  } = useRealisticPhoto();

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
        case 'r':
          triggerRealisticPhoto();
          break;
        case 'escape':
          if (settingsOpen) toggleSettings();
          if (garmentPanelOpen) toggleGarmentPanel();
          if (consentDialogOpen) setConsentDialogOpen(false);
          if (realisticDialogOpen) setRealisticDialogOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [
    togglePerfHUD,
    toggleDebugOverlay,
    toggleSettings,
    toggleGarmentPanel,
    triggerRealisticPhoto,
    settingsOpen,
    garmentPanelOpen,
    consentDialogOpen,
    realisticDialogOpen,
    setConsentDialogOpen,
    setRealisticDialogOpen,
  ]);

  // Auto-dismiss errors after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error, setError]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Toast Notification */}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 glass border border-[var(--color-accent-error)]/40 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in text-xs sm:text-sm max-w-lg bg-[var(--color-surface-1)]/90 backdrop-blur-md">
          <span className="text-base text-[var(--color-accent-error)]">⚠️</span>
          <span className="text-white flex-1 leading-snug">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-[var(--color-text-muted)] hover:text-white p-1 rounded transition-colors"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <header className="glass flex items-center justify-between px-6 py-3 border-b border-[var(--color-glass-border)] z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <h1 className="text-lg font-semibold tracking-tight">
              Try<span className="text-brand-400">Anywhere</span>
            </h1>
          </div>

          {/* Tier Switch (M5) */}
          <div className="flex p-0.5 rounded-lg glass border border-[var(--color-glass-border)]">
            <button
              onClick={() => setActiveTier('a')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTier === 'a'
                  ? 'bg-brand-500/25 text-brand-300 shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
              title="Real-time WebGL warp preview (Tier A)"
            >
              ⚡ Fast Preview
            </button>
            <button
              onClick={() => triggerRealisticPhoto()}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTier === 'b'
                  ? 'bg-brand-500/25 text-brand-300 shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
              title="Generate photorealistic try-on (Tier B)"
            >
              <span>✨</span>
              <span>Realistic Photo</span>
            </button>
          </div>
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
        {/* Camera viewport with Tier B trigger */}
        <CameraView onRealisticPhoto={triggerRealisticPhoto} />

        {/* Garment panel (overlays on left) */}
        <GarmentPanel />

        {/* Settings panel (overlays on right) */}
        <SettingsPanel />

        {/* M5 Consent Dialog */}
        <ConsentDialog onConfirm={onConfirmConsent} onCancel={onCancelConsent} />

        {/* M5 Realistic Result / Progress Dialog */}
        <RealisticDialog onCancelGeneration={cancelGeneration} onRegenerate={regenerate} />
      </main>

      {/* Status bar */}
      <footer className="px-6 py-2 flex items-center justify-between text-xs text-[var(--color-text-muted)] border-t border-[var(--color-glass-border)]">
        <span>TryAnywhere v0.1 · Meta Global AI Developer Hackathon</span>
        <div className="flex items-center gap-4">
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">G</kbd> Garment</span>
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">R</kbd> Realistic Photo</span>
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">P</kbd> Perf HUD</span>
          <span><kbd className="px-1 py-0.5 rounded text-[10px] glass">D</kbd> Debug</span>
          <span className="font-semibold text-brand-400">
            {activeTier === 'b' ? 'Tier B: Realistic Photo' : 'Tier A: Fast Preview'}
          </span>
        </div>
      </footer>
    </div>
  );
}
