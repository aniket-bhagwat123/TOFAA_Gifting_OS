"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTime } from "@/components/ui/time-picker-field";
import { cn } from "@/lib/utils";

const parseDate = (value: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Delivery slots every 15 minutes, from 7:00 AM to 9:00 PM.
const SLOTS = Array.from({ length: (21 - 7) * 4 + 1 }, (_, i) => { const mins = 7 * 60 + i * 15; return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`; });
const slotLabel = (value: string) => { const t = formatTime(value); return t.replace(/^(\d):/, "0$1:"); };
const shown = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** One field for a date and, optionally, a time: a calendar with the time lists beside it. Date is `YYYY-MM-DD`, time is 24-hour `HH:MM` or empty. */
export function DateTimePickerField({ id, label, date, time, onDate, onTime, minDate, required = false, placeholder = "Select date and time" }: {
  id: string; label: string; date: string; time: string; onDate: (value: string) => void; onTime: (value: string) => void; minDate?: Date; required?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(date);
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-ink">{label}{required ? <span className="text-rose-600"> *</span> : null}</label>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button" className={cn("flex min-h-10 w-full items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-left text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 data-[state=open]:border-brand", selected ? "text-ink" : "text-slate-400")}>
          <CalendarDays size={18} className="shrink-0 text-muted" aria-hidden />
          <span className="truncate">{selected ? `${shown.format(selected)}${time ? `, ${formatTime(time)}` : ""}` : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <div className="flex flex-col sm:flex-row">
          <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={(d) => { if (d) onDate(ymd(d)); }} captionLayout="dropdown"
            startMonth={new Date()} endMonth={new Date(new Date().getFullYear() + 5, 11)} disabled={minDate ? [{ before: minDate }] : undefined} autoFocus />
          <div className="flex w-full flex-col border-t border-line sm:w-44 sm:border-l sm:border-t-0">
            <p className="px-3 pb-2 pt-3 text-center text-sm font-semibold text-ink">Available Times</p>
            <ul className="max-h-64 space-y-2 overflow-y-auto px-3 pb-3" aria-label="Available times">
              {SLOTS.map((slot) => {
                const passed = date === ymd(new Date()) && slot <= `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
                const on = time === slot;
                return <li key={slot}><button type="button" disabled={passed} aria-pressed={on} onClick={() => onTime(on ? "" : slot)}
                  className={cn("flex min-h-9 w-full items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition", on ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand/50 hover:bg-brand-soft", passed && "cursor-not-allowed opacity-40 hover:border-line hover:bg-transparent")}>{slotLabel(slot)}</button></li>;
              })}
            </ul>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line p-2">
          <button type="button" onClick={() => onTime("")} disabled={!time} className="press min-h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40">Clear time</button>
          <button type="button" onClick={() => setOpen(false)} className="press min-h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">Done</button>
        </div>
      </PopoverContent>
    </Popover>
  </div>;
}
