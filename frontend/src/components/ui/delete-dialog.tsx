"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

/** The one delete confirmation: same look as the logout dialog, with a bin icon. */
export function DeleteDialog({ open, title = "Delete", message, confirmLabel = "Yes, Delete", busy = false, onConfirm, onClose }: {
  open: boolean; title?: string; message: React.ReactNode; confirmLabel?: string; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-desc" className="w-full max-w-sm animate-rise-in rounded-2xl bg-white px-6 pb-6 pt-7 text-center shadow-xl">
      <span aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600"><Trash2 size={26} /></span>
      <h2 id="delete-dialog-title" className="mt-4 text-lg font-semibold text-ink">{title}</h2>
      <p id="delete-dialog-desc" className="mt-1.5 text-sm text-muted">{message}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" autoFocus disabled={busy} onClick={onClose} className="press min-h-10 rounded-lg border border-line bg-white px-5 text-sm font-medium text-ink hover:bg-slate-50 disabled:opacity-60">No</button>
        <button type="button" disabled={busy} onClick={onConfirm} className="press min-h-10 rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">{busy ? (title === "Delete" ? "Deleting…" : "Working…") : confirmLabel}</button>
      </div>
    </div>
  </div>, document.body);
}
