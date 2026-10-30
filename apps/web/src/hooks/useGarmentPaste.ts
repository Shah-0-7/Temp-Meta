/**
 * @module hooks/useGarmentPaste
 *
 * Paste a garment from anywhere in the app: an image copied from a shop or a screenshot, or a
 * product link. Ignored while typing in a field (the link box handles its own paste).
 */

import { useEffect } from 'react';
import { useGarmentStore } from '../stores/garmentStore';
import { useConsentStore } from '../stores/consentStore';
import { useGarmentResolver } from './useGarmentResolver';

export function useGarmentPaste(): void {
  const { resolveFile, resolveUrl } = useGarmentResolver();

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)) {
        return;
      }
      // Never act behind a dialog that is waiting for an answer.
      if (useConsentStore.getState().pending) return;

      const data = e.clipboardData;
      if (!data) return;

      const image = Array.from(data.files).find((f) => f.type.startsWith('image/'));
      if (image) {
        e.preventDefault();
        useGarmentStore.getState().setGarmentPanelOpen(true);
        resolveFile(image, 'Pasted image');
        return;
      }

      const text = data.getData('text').trim();
      if (/^https?:\/\/\S+$/i.test(text)) {
        e.preventDefault();
        const store = useGarmentStore.getState();
        store.setGarmentPanelOpen(true);
        store.setUrlInput(text);
        void resolveUrl(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [resolveFile, resolveUrl]);
}
