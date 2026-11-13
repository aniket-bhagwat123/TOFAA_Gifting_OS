"use client";

import { useCallback, useEffect, useRef, useState, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A horizontally scrolling strip with a custom slim scrollbar.
 * The native bar is hidden (so it never reserves space under the content); a thin thumb floats
 * over the bottom edge and only shows while hovering, and only when the content overflows.
 */
export function HoverScrollX({ className, wrapperClassName, children, ...props }: HTMLAttributes<HTMLDivElement> & { wrapperClassName?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ width: number; left: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return setThumb(null);
    const ratio = el.clientWidth / el.scrollWidth;
    setThumb({ width: ratio * 100, left: (el.scrollLeft / el.scrollWidth) * 100 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [measure, children]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startScroll = el.scrollLeft;
    setDragging(true);
    const move = (e: PointerEvent) => { el.scrollLeft = startScroll + ((e.clientX - startX) / el.clientWidth) * el.scrollWidth; };
    const up = () => { setDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return <div className={cn("group relative", wrapperClassName)}>
    <div ref={scroller} onScroll={measure} className={cn("overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)} {...props}>{children}</div>
    {thumb && <div aria-hidden className={cn("pointer-events-none absolute inset-x-3 bottom-[3px] h-1 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100", dragging && "opacity-100")}>
      <div onPointerDown={startDrag} style={{ width: `${thumb.width}%`, left: `${thumb.left}%` }} className="pointer-events-auto absolute inset-y-0 cursor-grab rounded-full bg-slate-300 hover:bg-slate-400 active:cursor-grabbing" />
    </div>}
  </div>;
}
