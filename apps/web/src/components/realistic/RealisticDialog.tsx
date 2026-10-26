/**
 * @module components/realistic/RealisticDialog
 *
 * M5 — Dialog for Tier B Realistic Photo flow:
 * - Progress/loading state with animated indicator and cancel option
 * - Compare view (CompareSlider)
 * - Metadata (provider, latency, rate limits)
 * - Download PNG button
 */

import { useAppStore } from '../../stores/appStore';
import { CompareSlider } from './CompareSlider';

interface RealisticDialogProps {
  onCancelGeneration?: () => void;
  onRegenerate?: () => void;
}

export function RealisticDialog({
  onCancelGeneration,
  onRegenerate,
}: RealisticDialogProps) {
  const {
    realisticDialogOpen,
    setRealisticDialogOpen,
    isGeneratingRealistic,
    generationProgress,
    generationStep,
    realisticResult,
    setRealisticResult,
  } = useAppStore();

  if (!realisticDialogOpen) return null;

  const handleClose = () => {
    if (isGeneratingRealistic && onCancelGeneration) {
      onCancelGeneration();
    }
    setRealisticDialogOpen(false);
  };

  const handleDownload = () => {
    if (!realisticResult?.image) return;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `tryanywhere-realistic-${timestamp}.png`;

    const a = document.createElement('a');
    a.href = realisticResult.image;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="glass max-w-4xl w-full rounded-2xl border border-[var(--color-glass-border)] p-4 sm:p-6 shadow-2xl flex flex-col max-h-[95vh] overflow-hidden relative">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--color-glass-border)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-lg shadow-md shadow-brand-500/20">
              ✨
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Realistic Photo Synthesis
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  Tier B
                </span>
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {isGeneratingRealistic
                  ? 'Generating high-resolution photorealistic render…'
                  : 'Compare your live preview against the synthesized result.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg glass flex items-center justify-center text-[var(--color-text-muted)] hover:text-white transition-colors text-lg"
            aria-label="Close dialog"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 flex flex-col items-center justify-center min-h-[300px]">
          {isGeneratingRealistic ? (
            /* Progress State */
            <div className="w-full max-w-md flex flex-col items-center text-center p-6 space-y-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-brand-500/20 border-t-brand-400 animate-spin flex items-center justify-center" />
                <div className="absolute inset-0 flex items-center justify-center text-2xl animate-pulse">
                  ✨
                </div>
              </div>

              <div className="space-y-2 w-full">
                <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                  <span>{generationStep || 'Synthesizing photorealistic render…'}</span>
                  <span className="font-mono text-brand-300">{Math.round(generationProgress)}%</span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden border border-[var(--color-glass-border)]">
                  <div
                    className="h-full bg-gradient-to-r from-brand-500 to-brand-300 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ width: `${Math.max(5, generationProgress)}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-muted)] max-w-xs">
                Analyzing pose, transferring garment fabric texture, and applying realistic drape & ambient illumination.
              </p>

              <button
                onClick={handleClose}
                className="px-4 py-1.5 rounded-xl text-xs glass text-[var(--color-text-secondary)] hover:text-white transition-colors"
              >
                Cancel Generation
              </button>
            </div>
          ) : realisticResult ? (
            /* Result State */
            <div className="w-full flex flex-col gap-4">
              <CompareSlider
                previewImage={realisticResult.previewImage}
                realisticImage={realisticResult.image}
              />

              {/* Metadata pill */}
              <div className="flex flex-wrap items-center justify-between text-xs text-[var(--color-text-muted)] px-2 py-1 bg-[var(--color-surface-2)]/50 rounded-lg border border-[var(--color-glass-border)]">
                <div className="flex items-center gap-4">
                  <span>
                    Provider: <strong className="text-white">{String(realisticResult.metadata?.provider ?? 'mock')}</strong>
                  </span>
                  {realisticResult.metadata?.processingTimeMs !== undefined && (
                    <span>
                      Latency: <strong className="text-white">{(Number(realisticResult.metadata.processingTimeMs) / 1000).toFixed(1)}s</strong>
                    </span>
                  )}
                </div>
                {realisticResult.metadata?.creditsRemaining !== undefined && (
                  <span>
                    Remaining Credits: <strong className="text-brand-300">{String(realisticResult.metadata.creditsRemaining)}</strong>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">No photo generated yet.</div>
          )}
        </div>

        {/* Bottom Actions Footer */}
        {!isGeneratingRealistic && realisticResult && (
          <div className="pt-3 border-t border-[var(--color-glass-border)] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <button
              onClick={() => {
                setRealisticResult(null);
                setRealisticDialogOpen(false);
              }}
              className="px-4 py-2 rounded-xl text-sm font-medium glass hover:bg-white/10 text-[var(--color-text-secondary)] hover:text-white transition-colors"
            >
              Back to Live Camera
            </button>

            <div className="flex items-center gap-2">
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="px-4 py-2 rounded-xl text-sm font-medium glass hover:bg-white/10 text-white transition-colors flex items-center gap-2"
                >
                  <span>🔄</span>
                  <span>Regenerate</span>
                </button>
              )}
              <button
                onClick={handleDownload}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white shadow-lg shadow-brand-500/25 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
              >
                <span>📥</span>
                <span>Download Photo</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
