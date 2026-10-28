/**
 * @module components/settings/Notice
 *
 * Small auto-dismissing message, announced to screen readers. Used when the app
 * changes something on its own (for example Auto-adapt lowering quality).
 */

import { useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';

const SHOW_MS = 6000;

export function Notice() {
  const notice = useAppStore((s) => s.notice);
  const clear = useAppStore((s) => s.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clear, SHOW_MS);
    return () => clearTimeout(t);
  }, [notice, clear]);

  if (!notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-14 left-1/2 -translate-x-1/2 z-40 glass rounded-xl px-4 py-2 text-sm max-w-[90%] flex items-center gap-3"
    >
      <span className="text-[var(--color-text-secondary)]">{notice.text}</span>
      <button onClick={clear} className="px-2 py-1 rounded-lg glass text-xs" aria-label="Dismiss message">
        OK
      </button>
    </div>
  );
}
