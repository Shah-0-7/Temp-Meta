/**
 * @module components/help/HelpDialog
 *
 * First-run onboarding plus a permanent help/shortcuts dialog. Opens by itself
 * on the first visit (remembered in localStorage when available) and any time
 * via the header button or `?`.
 */

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { SHORTCUTS } from '../../lib/shortcuts';
import { Icon } from '../ui/Icon';

const SEEN_KEY = 'tryanywhere.onboarded.v1';

function hasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage can be blocked; the dialog then simply shows again next visit */
  }
}

const STEPS = [
  {
    title: 'Turn on your camera',
    body: 'Allow camera access. The live preview runs on your device, and anything sent online asks you first. No camera? Upload a photo instead.',
  },
  {
    title: 'Stand so we can see you',
    body: 'Step back until your head, shoulders and hips are in view, face the camera, and keep your arms a little away from your body. A plain, fitted top works best. We will tell you if something needs adjusting.',
  },
  {
    title: 'Pick any garment',
    body: 'Press G, then paste a product page link or upload a garment photo. If the automatic pick is wrong, choose another image from the list.',
  },
  {
    title: 'Make it realistic',
    body: 'Press Space for a full-resolution render of this moment. Compare before and after, download it, and find all your renders in the gallery (V) to compare outfits.',
  },
] as const;

export function HelpDialog() {
  const open = useAppStore((s) => s.helpOpen);
  const setOpen = useAppStore((s) => s.setHelpOpen);
  const [tab, setTab] = useState<'start' | 'keys'>('start');
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);

  // First visit: show the walkthrough once.
  useEffect(() => {
    if (!hasSeen()) setOpen(true);
  }, [setOpen]);

  const close = () => {
    setOpen(false);
    setStep(0);
    setTab('start');
  };

  // Esc is handled globally in App; remember the walkthrough was seen whenever it closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) markSeen();
    wasOpen.current = open;
  }, [open]);

  if (!open) return null;

  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="sheet sheet-modal w-full max-w-lg p-6 flex flex-col gap-4 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 id="help-title" className="sheet-title !text-[1.6rem]">
            Welcome to TryAnywhere
          </h2>
          <button onClick={close} className="tool icon-btn" aria-label="Close help">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div role="tablist" aria-label="Help sections" className="flex gap-2">
          {(['start', 'keys'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold ${
                tab === t ? 'bg-brand-600/15 text-brand-300 border border-brand-500/40' : 'glass'
              }`}
            >
              {t === 'start' ? 'Getting started' : 'Keyboard shortcuts'}
            </button>
          ))}
        </div>

        {tab === 'start' ? (
          <div role="tabpanel" className="flex flex-col gap-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              Step {step + 1} of {STEPS.length}
            </p>
            <div>
              <h3 className="font-display text-xl leading-snug">{STEPS[step].title}</h3>
              <p className="text-[15px] leading-relaxed text-[var(--color-text-secondary)] mt-1.5 mb-0">{STEPS[step].body}</p>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={close} className="glass px-4 py-2 rounded-full text-sm font-semibold">
                {last ? 'Close' : 'Skip'}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  className="glass px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  onClick={() => (last ? close() : setStep((s) => s + 1))}
                  className="btn-primary px-5 py-2 rounded-full text-sm"
                >
                  {last ? 'Start' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <dl role="tabpanel" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm m-0">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="contents">
                <dt>
                  <kbd>{s.label}</kbd>
                </dt>
                <dd className="m-0 text-[var(--color-text-secondary)]">{s.description}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
