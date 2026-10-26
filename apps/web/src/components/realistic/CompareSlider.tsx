/**
 * @module components/realistic/CompareSlider
 *
 * M5 — Interactive before/after split slider comparing:
 * - Left: Fast Preview (Tier A live WebGL composite)
 * - Right: Realistic Photo (Tier B photorealistic synthesis)
 *
 * Supports mouse drag, touch drag, and toggle between Split & Side-by-Side.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface CompareSliderProps {
  previewImage: string;
  realisticImage: string;
  className?: string;
}

export function CompareSlider({
  previewImage,
  realisticImage,
  className = '',
}: CompareSliderProps) {
  const [sliderPosition, setSliderPosition] = useState<number>(50); // percentage 0..100
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'split' | 'side-by-side'>('split');
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(pct);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    if (e.touches[0]) updatePosition(e.touches[0].clientX);
  }, [updatePosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updatePosition(e.clientX);
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) updatePosition(e.touches[0].clientX);
    };
    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, updatePosition]);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Top mode switch bar */}
      <div className="flex items-center justify-between text-xs px-2">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">Comparison Mode:</span>
          <div className="flex p-0.5 rounded-lg glass">
            <button
              onClick={() => setViewMode('split')}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                viewMode === 'split'
                  ? 'bg-brand-500/20 text-brand-300 shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              Split Slider
            </button>
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                viewMode === 'side-by-side'
                  ? 'bg-brand-500/20 text-brand-300 shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              Side-by-Side
            </button>
          </div>
        </div>

        {viewMode === 'split' && (
          <span className="text-[var(--color-text-muted)] text-[11px] hidden sm:inline">
            Drag divider left/right to compare
          </span>
        )}
      </div>

      {/* Main View Area */}
      {viewMode === 'split' ? (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className="relative w-full aspect-video max-h-[65vh] rounded-xl overflow-hidden select-none cursor-ew-resize bg-black border border-[var(--color-glass-border)] shadow-xl"
        >
          {/* Base image (Right side: Realistic Render) */}
          <img
            src={realisticImage}
            alt="Realistic Render (Tier B)"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            draggable={false}
          />

          {/* Overlaid image (Left side: Fast Preview), clipped by slider position */}
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none"
            style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          >
            <img
              src={previewImage}
              alt="Fast Preview (Tier A)"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          </div>

          {/* Draggable Divider Line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)] pointer-events-none z-20"
            style={{ left: `${sliderPosition}%` }}
          >
            {/* Center Thumb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/80 border-2 border-white backdrop-blur-md flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-black/50">
              ↔
            </div>
          </div>

          {/* Labels */}
          <div className="absolute top-3 left-3 z-10 glass px-2.5 py-1 rounded-md text-xs font-semibold text-white/90 border border-white/20 pointer-events-none shadow">
            ⚡ Fast Preview (Tier A)
          </div>
          <div className="absolute top-3 right-3 z-10 glass px-2.5 py-1 rounded-md text-xs font-semibold text-brand-300 border border-brand-500/30 pointer-events-none shadow">
            ✨ Realistic Photo (Tier B)
          </div>
        </div>
      ) : (
        /* Side by Side Mode */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-h-[65vh]">
          <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-[var(--color-glass-border)]">
            <div className="absolute top-3 left-3 z-10 glass px-2.5 py-1 rounded-md text-xs font-semibold text-white/90 border border-white/20">
              ⚡ Fast Preview (Tier A)
            </div>
            <img
              src={previewImage}
              alt="Fast Preview"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-brand-500/30">
            <div className="absolute top-3 right-3 z-10 glass px-2.5 py-1 rounded-md text-xs font-semibold text-brand-300 border border-brand-500/30">
              ✨ Realistic Photo (Tier B)
            </div>
            <img
              src={realisticImage}
              alt="Realistic Photo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
