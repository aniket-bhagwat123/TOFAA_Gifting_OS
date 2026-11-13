"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// Count how many Sheet instances are open so scroll is only restored when the last one closes.
let _openSheets = 0;

/**
 * Modal sheet: dims the background (modal task), animates in with Apple's sheet curve,
 * and closes on Escape or scrim tap. Always centred on screen.
 */
export function Sheet({ open, onClose, labelledBy, children, className, locked = false, zIndex = "z-[80]" }: {
  open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; className?: string; locked?: boolean; zIndex?: string;
}) {
  useEffect(() => {
    if (!open) return;
    _openSheets++;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !locked) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      _openSheets--;
      if (_openSheets === 0) document.body.style.overflow = "";
    };
  }, [open, onClose, locked]);
  // Rendered on <body> so the dialog centres on the whole screen, never inside the page content area.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;
  return createPortal(<div className={cn("fixed inset-0 flex items-center justify-center bg-slate-950/40 p-4 animate-fade-in sm:p-6", zIndex)} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !locked) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={cn("scroll-clean max-h-[90vh] w-full overflow-y-auto overscroll-contain rounded-3xl bg-white p-6 shadow-float animate-sheet-in sm:p-8", className ?? "max-w-lg")}>
      {children}
    </section>
  </div>, document.body);
}
