"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { getModuleRecords } from "@/features/modules/module.service";
import { rowsOf } from "@/features/modules/module-utils";
import { control } from "@/components/ui/table-styles";
import { cn } from "@/lib/utils";
import type { PersonRef } from "./wizard-types";

/** Search the client's existing recipients by name and pick one. Searching happens on the server, so large lists stay fast. */
export function PersonPicker({ endpoint, placeholder = "Search recipients…", onPick, exclude = [], label }: {
  endpoint: string; placeholder?: string; onPick: (person: PersonRef) => void; exclude?: string[]; label: string;
}) {
  const [term, setTerm] = useState("");
  const [options, setOptions] = useState<Array<PersonRef & { hint: string }>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !endpoint) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      getModuleRecords(endpoint, { page: 1, limit: 8, search: term.trim() || undefined, status: "ACTIVE", sort: "name", order: "asc" })
        .then((data) => { if (!cancelled) setOptions(rowsOf(data).map((row) => ({ id: String(row.id), name: String(row.name ?? "Unnamed"), hint: String(row.city ?? (row.address as { city?: string } | undefined)?.city ?? row.mobileNumber ?? "") }))); })
        .catch(() => { if (!cancelled) setOptions([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [term, open, endpoint]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const shown = options.filter((option) => !exclude.includes(option.id));
  return <div ref={root} className="relative">
    <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input type="search" value={term} onChange={(event) => { setTerm(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} aria-label={label} className={cn(control, "w-full pl-9")} />
    {open && <div role="listbox" aria-label={label} className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-white p-1.5 shadow-lg">
      {loading && !shown.length ? <p className="p-3 text-sm text-muted">Searching…</p>
        : shown.length ? shown.map((option) => <button key={option.id} type="button" role="option" aria-selected={false} onClick={() => { onPick({ id: option.id, name: option.name }); setTerm(""); setOpen(false); }} className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm text-ink hover:bg-slate-50">
          <span className="truncate font-medium capitalize">{option.name}</span><span className="shrink-0 text-xs text-muted">{option.hint}</span>
        </button>) : <p className="p-3 text-sm text-muted">No matching recipients.</p>}
    </div>}
  </div>;
}

/** A person already chosen, with a button to remove them. */
export function PersonChip({ person, onRemove }: { person: PersonRef; onRemove: () => void }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft py-1 pl-3 pr-1.5 text-sm font-medium capitalize text-brand">
    {person.name}
    <button type="button" aria-label={`Remove ${person.name}`} onClick={onRemove} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand/10"><X size={13} /></button>
  </span>;
}
