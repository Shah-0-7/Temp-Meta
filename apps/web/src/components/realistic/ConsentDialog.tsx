/**
 * @module components/realistic/ConsentDialog
 *
 * M5 — User consent dialog for Tier B photo generation.
 * Names active provider, explains data processing, and provides
 * per-session "Don't show again" option.
 */

import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';

interface ConsentDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConsentDialog({ onConfirm, onCancel }: ConsentDialogProps) {
  const { consentDialogOpen, activeProviderName, setSessionConsentAccepted } = useAppStore();
  const [dontShowAgain, setDontShowAgain] = useState(true);

  if (!consentDialogOpen) return null;

  const handleConfirm = () => {
    if (dontShowAgain) {
      setSessionConsentAccepted(true);
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass max-w-lg w-full rounded-2xl border border-[var(--color-glass-border)] p-6 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-brand-500/20">
            ✨
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-white tracking-tight">Realistic Photo Synthesis</h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                Tier B
              </span>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Transform your live preview into a studio-quality photograph with realistic fabric drape, creases, and lighting.
            </p>
          </div>
        </div>

        {/* Provider & Privacy details */}
        <div className="my-5 space-y-3 bg-[var(--color-surface-2)]/60 rounded-xl p-4 border border-[var(--color-glass-border)] text-xs text-[var(--color-text-secondary)]">
          <div className="flex justify-between items-center pb-2 border-b border-[var(--color-glass-border)]">
            <span className="text-[var(--color-text-muted)]">Active Provider:</span>
            <span className="font-medium text-white px-2 py-0.5 rounded bg-[var(--color-surface-1)]">
              {activeProviderName}
            </span>
          </div>

          <div className="flex gap-2.5 items-start">
            <span className="text-base text-brand-400">🔒</span>
            <div>
              <span className="font-semibold text-white block">Strict Privacy Guarantee</span>
              <span>
                Your captured camera frame and garment image are processed strictly in-memory on the server. Images are immediately discarded after synthesis and never saved to disk or logged.
              </span>
            </div>
          </div>
        </div>

        {/* Don't show again checkbox */}
        <label className="flex items-center gap-2.5 text-xs text-[var(--color-text-muted)] hover:text-white cursor-pointer select-none mb-6">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 text-brand-500 focus:ring-brand-400 focus:ring-offset-gray-900 accent-brand-500 cursor-pointer"
          />
          <span>Don&apos;t ask for confirmation again during this session</span>
        </label>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium glass hover:bg-white/10 text-[var(--color-text-secondary)] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white shadow-lg shadow-brand-500/25 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Generate Photo (Tier B)
          </button>
        </div>
      </div>
    </div>
  );
}
