/**
 * @module components/consent/ConsentDialog
 *
 * Asked before anything leaves the device. Names the provider and says exactly
 * what is sent. Consent lasts for this tab session only.
 */

import { useRef } from 'react';
import { useConsentStore } from '../../stores/consentStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export function ConsentDialog() {
  const pending = useConsentStore((s) => s.pending);
  const answer = useConsentStore((s) => s.answer);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(!!pending, ref);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        aria-describedby="consent-body"
        className="sheet sheet-modal w-full max-w-md p-6 flex flex-col gap-4 outline-none"
      >
        <h2 id="consent-title" className="sheet-title !text-[1.5rem]">
          {pending.title}
        </h2>
        <div id="consent-body" className="flex flex-col gap-3 text-sm text-[var(--color-text-secondary)]">
          <div>
            <p className="font-medium text-[var(--color-text-primary)]">What is sent to {pending.provider}</p>
            <ul className="list-disc pl-5 mt-1 flex flex-col gap-1">
              {pending.sends.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            {pending.notes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => answer(false)} className="glass px-4 py-2 rounded-full text-sm font-semibold">
            Cancel
          </button>
          <button
            onClick={() => answer(true)}
            className="btn-primary px-5 py-2 rounded-full text-sm"
          >
            Allow for this session
          </button>
        </div>
      </div>
    </div>
  );
}
