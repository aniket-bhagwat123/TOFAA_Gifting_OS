"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = [0, 15, 30, 45];
const pad = (n: number) => String(n).padStart(2, "0");

/** "14:30" -> { hour: 2, minute: 30, pm: true } */
export function parseTime(value: string) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: Number(m[2]), pm: h >= 12 };
}
const build = (hour: number, minute: number, pm: boolean) => `${pad((hour % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
export const formatTime = (value: string) => { const t = parseTime(value); return t ? `${t.hour}:${pad(t.minute)} ${t.pm ? "PM" : "AM"}` : ""; };

const column = "max-h-48 w-16 overflow-y-auto py-1";
const cell = (on: boolean) => cn("flex min-h-9 w-full items-center justify-center rounded-lg text-sm tabular-nums", on ? "bg-brand font-semibold text-white" : "text-ink hover:bg-brand-soft");

/** The hour, minute (every 15 minutes) and AM/PM lists. Values are 24-hour `HH:MM`. Picking one part first starts from 9:00 AM. */
export function TimeLists({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const current = parseTime(value);
  const pick = (patch: Partial<{ hour: number; minute: number; pm: boolean }>) => {
    const base = current ?? { hour: 9, minute: 0, pm: false };
    const next = { ...base, ...patch };
    onChange(build(next.hour, next.minute, next.pm));
  };
  return (
    <div className="flex gap-1 p-2" role="group" aria-label="Choose a time">
          <div className={column} role="listbox" aria-label="Hour">{HOURS.map((h) => <button key={h} type="button" role="option" aria-selected={current?.hour === h} onClick={() => pick({ hour: h })} className={cell(current?.hour === h)}>{h}</button>)}</div>
          <div className={column} role="listbox" aria-label="Minute">{MINUTES.map((m) => <button key={m} type="button" role="option" aria-selected={current?.minute === m} onClick={() => pick({ minute: m })} className={cell(current?.minute === m)}>{pad(m)}</button>)}</div>
          <div className="w-16 py-1" role="listbox" aria-label="AM or PM">{(["AM", "PM"] as const).map((half) => <button key={half} type="button" role="option" aria-selected={current?.pm === (half === "PM")} onClick={() => pick({ pm: half === "PM" })} className={cell(!!current && current.pm === (half === "PM"))}>{half}</button>)}</div>
        </div>
  );
}

/** A time picker with hour, minute and AM/PM lists. Values are 24-hour `HH:MM`, or empty when no time is chosen. */
export function TimePickerField({ id, label: fieldLabel, value, onChange, placeholder = "Select time", optional = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; optional?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = parseTime(value);
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-ink">{fieldLabel}{optional && <span className="font-normal text-muted"> (optional)</span>}</label>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className={cn("flex min-h-10 w-full items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-left text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 data-[state=open]:border-brand", current ? "text-ink" : "text-slate-400")}>
          <Clock size={18} className="shrink-0 text-muted" aria-hidden />
          <span className="truncate">{current ? formatTime(value) : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <TimeLists value={value} onChange={onChange} />
        <div className="flex items-center justify-between gap-2 border-t border-line p-2">
          <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="press min-h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">Clear</button>
          <button type="button" disabled={!current} onClick={() => setOpen(false)} className="press min-h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">Done</button>
        </div>
      </PopoverContent>
    </Popover>
  </div>;
}
