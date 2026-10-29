/**
 * @module components/garment/URLInput
 *
 * Product URL input with instant paste handling, validation feedback,
 * and drag-and-drop for image files.
 */

import { useState, useRef, useCallback } from 'react';
import { useGarmentStore } from '../../stores/garmentStore';
import { useGarmentResolver } from '../../hooks/useGarmentResolver';
import { Icon } from '../ui/Icon';

export function URLInput() {
  const { urlInput, setUrlInput, resolving, resolveError } = useGarmentStore();
  const { resolveUrl, resolveFile } = useGarmentResolver();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || resolving) return;
    await resolveUrl(urlInput.trim());
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim();
    if (!text.startsWith('http')) return;
    // Auto-submit on paste of URL
    setUrlInput(text);
    setTimeout(() => resolveUrl(text), 50);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      // File drop
      const file = e.dataTransfer.files?.[0];
      if (file?.type.startsWith('image/')) {
        resolveFile(file);
        return;
      }

      // URL drop (from browser address bar or link)
      const text = e.dataTransfer.getData('text/plain').trim();
      if (text.startsWith('http')) {
        setUrlInput(text);
        resolveUrl(text);
      }
    },
    [resolveFile, resolveUrl, setUrlInput],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) resolveFile(file);
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`transition-all duration-200 ${isDragging ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-[var(--color-surface-1)] rounded-xl' : ''}`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none">
              <Icon name="link" size={17} />
            </div>
            <input
              ref={inputRef}
              type="url"
              id="garment-url-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onPaste={handlePaste}
              placeholder="Paste a product link…"
              className={`w-full pl-9 pr-3 py-2.5 rounded-xl border border-[var(--color-glass-border)] bg-[var(--color-surface-0)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 transition-all ${
                resolveError
                  ? 'focus:ring-[var(--color-accent-error)]/40 ring-1 ring-[var(--color-accent-error)]/30'
                  : 'focus:ring-brand-500/40'
              }`}
              autoComplete="off"
              spellCheck={false}
              disabled={resolving}
            />
          </div>

          <button
            type="submit"
            disabled={!urlInput.trim() || resolving}
            className="btn-primary px-4 py-2.5 rounded-xl text-sm whitespace-nowrap"
          >
            {resolving ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-[var(--color-ink)]/30 border-t-[var(--color-ink)] rounded-full animate-spin" />
                Finding…
              </span>
            ) : (
              'Find images'
            )}
          </button>
        </div>

        {/* Upload alternative */}
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="link-quiet !text-[13px]"
          >
            Upload an image
          </button>
          <span>or drop a garment photo here.</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Error message */}
        {resolveError && (
          <div className="flex gap-2 p-2.5 rounded-lg bg-[var(--color-accent-error)]/10 border border-[var(--color-accent-error)]/20">
            <span className="text-[var(--color-accent-error)] shrink-0 mt-px"><Icon name="alert" size={16} /></span>
            <p className="text-xs text-[var(--color-accent-error)] leading-relaxed">
              {resolveError}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
