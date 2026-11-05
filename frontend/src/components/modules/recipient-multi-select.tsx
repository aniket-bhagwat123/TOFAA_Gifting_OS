"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export function RecipientMultiSelect({ options, selectedIds, loading, loadError, error, labelId, onChange }: {
  options: Record<string, unknown>[];
  selectedIds: string[];
  loading: boolean;
  loadError: string | null;
  error?: string;
  labelId: string;
  onChange: (id: string, selected: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);
  const visibleOptions = options.filter((recipient) => `${recipient.name ?? ""} ${recipient.mobileNumber ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const selectedNames = options.filter((recipient) => selectedIds.includes(String(recipient.id ?? ""))).map((recipient) => String(recipient.name ?? "Unnamed recipient"));
  return <div ref={rootRef} className="relative">
    <button type="button" aria-labelledby={labelId} aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white min-h-12 px-4 py-3 text-left text-base ${error ? "border-rose-400" : "border-line"}`}>
      <span className={selectedNames.length && !loading ? "truncate text-ink" : "text-muted"}>{loading ? "Loading recipients…" : selectedNames.length ? `${selectedNames.length} selected${selectedNames.length <= 2 ? `: ${selectedNames.join(", ")}` : `: ${selectedNames.slice(0, 2).join(", ")}…`}` : "Select recipients"}</span>
      <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-white p-2 shadow-lg">
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search recipients..." className="mb-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
      <div className="scroll-clean max-h-56 overflow-y-auto" role="group" aria-labelledby={labelId}>
      {loading ? <p className="p-3 text-sm text-muted">Loading recipients…</p> : loadError ? <p className="p-3 text-sm text-rose-600">{loadError}</p> : visibleOptions.length ? visibleOptions.map((recipient) => {
        const id = String(recipient.id ?? "");
        if (!id) return null;
        return <label key={id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
          <input type="checkbox" name="recipientIds" value={id} checked={selectedIds.includes(id)} onChange={(event) => onChange(id, event.target.checked)} className="h-4 w-4 accent-brand" />
          <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{String(recipient.name ?? "Unnamed recipient")}</span><span className="block text-xs text-muted">{String(recipient.mobileNumber ?? "")}</span></span>
        </label>;
      }) : <p className="p-3 text-sm text-muted">{options.length ? "No recipients match your search." : "No recipients found."}</p>}
      </div>
      {selectedIds.length > 0 && <p className="border-t border-line px-2 pt-2 text-xs text-muted">{selectedIds.length} recipient{selectedIds.length === 1 ? "" : "s"} selected</p>}
    </div>
    }
    {error && <p className="mt-1.5 text-sm text-rose-600">{error}</p>}
  </div>;
}
