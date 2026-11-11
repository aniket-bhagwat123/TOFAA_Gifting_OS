"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** A panel that slides in from the right edge over a dimmed page. Closes on Escape or a tap on the dimmed area. */
export function SidePanel({ open, onClose, labelledBy, children, className, locked = false }: {
  open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; className?: string; locked?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !locked) onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [open, onClose, locked]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;
  return createPortal(<div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/30 animate-fade-in" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !locked) onClose(); }}>
    <aside role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={cn("scroll-clean h-full w-full max-w-md overflow-y-auto overscroll-contain bg-white p-6 shadow-float sm:rounded-l-3xl sm:p-7", className)}>
      {children}
    </aside>
  </div>, document.body);
}
