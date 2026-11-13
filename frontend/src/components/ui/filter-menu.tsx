"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; hint?: string };

/** A compact filter button that opens a short list of options (with a search box when there are many). */
export function FilterMenu({ icon, label, value, options, onChange, searchable, width = "w-60", triggerClassName }: {
  icon: ReactNode; label: string; value: string; options: FilterOption[]; onChange: (value: string) => void; searchable?: boolean; width?: string; triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selected = options.find((option) => option.value === value);
  const shown = options.filter((option) => `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()));
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTerm(""); }}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} aria-haspopup="listbox" className={cn("flex h-10 w-full items-center gap-2 rounded-[9px] border border-line bg-white px-3 text-sm text-ink outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand/25 data-[state=open]:border-brand sm:w-auto sm:min-w-[9.5rem]", triggerClassName)}>
        <span className="text-muted">{icon}</span><span className="max-w-[9rem] flex-1 truncate text-left font-medium">{selected?.label ?? label}</span><ChevronDown size={14} className="shrink-0 text-muted" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className={cn("p-2", width)}>
      {searchable && <div className="relative mb-2"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input autoFocus type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search by name" aria-label={`Search ${label}`} className="h-9 w-full rounded-lg border border-line pl-9 pr-3 text-sm outline-none focus:border-brand" /></div>}
      <div role="listbox" aria-label={label} className="scroll-clean max-h-64 overflow-y-auto">
        {shown.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }} className={cn("flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-sm text-ink hover:bg-slate-50", option.value === value && "bg-brand-soft/60 font-medium")}>
          <span className="min-w-0"><span className="block truncate">{option.label}</span>{option.hint && <span className="block truncate text-xs text-muted">{option.hint}</span>}</span>
          {option.value === value && <Check size={15} className="shrink-0 text-brand" />}
        </button>)}
        {!shown.length && <p className="p-3 text-sm text-muted">No matches.</p>}
      </div>
    </PopoverContent>
  </Popover>;
}
