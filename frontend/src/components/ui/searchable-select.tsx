"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export function SearchableSelect({ name, labelId, options, value, loading, loadError, placeholder, error, required = false, onChange }: {
  name: string;
  labelId: string;
  options: Array<{ id: string; label: string; searchText?: string }>;
  value: string;
  loading: boolean;
  loadError: string | null;
  placeholder: string;
  error?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);
  const selected = options.find((option) => option.id === value);
  const filteredOptions = options.filter((option) => `${option.label} ${option.searchText ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div ref={rootRef} className="relative">
    <input type="hidden" name={name} value={value} />
    <button type="button" aria-labelledby={labelId} aria-haspopup="listbox" aria-expanded={open} aria-invalid={!!error} disabled={loading || !!loadError} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white min-h-12 px-4 py-3 text-left text-base disabled:bg-slate-50 ${error ? "border-rose-400" : "border-line"}`}>
      <span className={selected ? "truncate text-ink" : "text-muted"}>{selected?.label ?? (loadError ? "Unable to load options" : loading ? "Loading options…" : placeholder)}</span>
      <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-white p-2 shadow-lg">
      <div className="relative mb-2"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${placeholder.toLowerCase()}...`} className="w-full rounded-lg border border-line py-2 pl-9 pr-3 text-sm outline-none focus:border-brand" /></div>
      {loading ? <p className="p-3 text-sm text-muted">Loading options…</p> : loadError ? <p className="p-3 text-sm text-rose-600">{loadError}</p> : <div role="listbox" aria-labelledby={labelId} className="scroll-clean max-h-56 overflow-y-auto">
        {!required && <button type="button" role="option" aria-selected={!value} onClick={() => { onChange(""); setOpen(false); setSearch(""); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-slate-50">Clear selection</button>}
        {filteredOptions.map((option) => <button key={option.id} type="button" role="option" aria-selected={option.id === value} onClick={() => { onChange(option.id); setOpen(false); setSearch(""); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-slate-50">{option.label}</button>)}
        {!filteredOptions.length && <p className="p-3 text-sm text-muted">No matching options.</p>}
      </div>}
    </div>}
  </div>;
}
