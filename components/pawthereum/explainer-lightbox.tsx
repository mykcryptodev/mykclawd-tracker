"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { XIcon, ZoomInIcon } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/**
 * Tappable explainer image that opens a full-screen lightbox with
 * scroll-wheel / pinch zoom and drag panning.
 */
export function ExplainerLightbox({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  // Active pointers for drag + pinch tracking.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // Refs so event handlers always see the latest values without re-binding.
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  scaleRef.current = scale;
  offsetRef.current = offset;

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const applyZoom = useCallback((next: number, cx?: number, cy?: number) => {
    const prev = scaleRef.current;
    const clamped = clampScale(next);
    if (clamped === prev) return;
    // Zoom around the given viewport point (defaults to center).
    const vp = viewportRef.current?.getBoundingClientRect();
    const px = cx !== undefined && vp ? cx - (vp.left + vp.width / 2) : 0;
    const py = cy !== undefined && vp ? cy - (vp.top + vp.height / 2) : 0;
    const ratio = clamped / prev;
    setOffset((o) => ({
      x: px - (px - o.x) * ratio,
      y: py - (py - o.y) * ratio,
    }));
    setScale(clamped);
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  // Lock body scroll + Esc to close while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Wheel zoom needs a non-passive listener to preventDefault.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!open || !vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      applyZoom(scaleRef.current * factor, e.clientX, e.clientY);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [open, applyZoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: scaleRef.current,
      };
      dragStart.current = null;
    } else if (pointers.current.size === 1) {
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        ox: offsetRef.current.x,
        oy: offsetRef.current.y,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.dist > 0) {
        applyZoom(
          pinchStart.current.scale * (dist / pinchStart.current.dist),
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
        );
      }
    } else if (pointers.current.size === 1 && dragStart.current && scaleRef.current > 1) {
      setOffset({
        x: dragStart.current.ox + (e.clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.clientY - dragStart.current.y),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (scaleRef.current > 1) {
      reset();
    } else {
      applyZoom(2.5, e.clientX, e.clientY);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in"
        aria-label="Open explainer image fullscreen"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static explainer asset */}
        <img src={src} alt={alt} className="h-auto w-full" loading="lazy" />
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomInIcon className="size-3" /> Tap to zoom
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={viewportRef}
            className="relative h-full w-full overflow-hidden touch-none"
            style={{ cursor: scale > 1 ? "grab" : "zoom-in" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static explainer asset */}
            <img
              src={src}
              alt={alt}
              draggable={false}
              className="absolute left-1/2 top-1/2 max-h-full max-w-full select-none"
              style={{
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                transition: pointers.current.size > 0 ? "none" : "transform 120ms ease-out",
              }}
            />
          </div>

          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </button>
          {scale > 1 && (
            <button
              type="button"
              onClick={reset}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              Reset zoom
            </button>
          )}
        </div>
      )}
    </>
  );
}
