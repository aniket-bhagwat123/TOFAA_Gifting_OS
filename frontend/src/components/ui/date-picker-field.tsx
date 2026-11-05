"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { RequiredMark } from "@/components/ui/required-mark";

function parseDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

const display = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** shadcn/ui date picker: a button that opens a calendar with month and year dropdowns. Values are `YYYY-MM-DD`. */
export function DatePickerField({
  label,
  id,
  name,
  value,
  onChange,
  onBlur,
  error,
  required,
  maxDate
}: {
  label: string;
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
  /** Latest date that can be picked, e.g. today for a birthday. */
  maxDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  const endMonth = maxDate ?? new Date(new Date().getFullYear() + 10, 11);

  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-ink"><span>{label}{required && <RequiredMark />}</span></label>
    {name && <input type="hidden" name={name} value={value} />}
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) onBlur?.(); }}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "flex min-h-12 w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left text-base outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15 data-[state=open]:border-brand",
            selected ? "text-ink" : "text-slate-400",
            error ? "border-rose-400" : "border-line"
          )}
        >
          <CalendarDays size={18} className="shrink-0 text-muted" aria-hidden />
          <span className="truncate">{selected ? display.format(selected) : "Pick a date"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate}
          onSelect={(date) => {
            if (!date && required) return;
            onChange(date ? formatDate(date) : "");
            setOpen(false);
          }}
          captionLayout="dropdown"
          startMonth={new Date(1920, 0)}
          endMonth={endMonth}
          disabled={maxDate ? { after: maxDate } : undefined}
          autoFocus
        />
        {!required && selected && <div className="border-t border-line p-2">
          <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="press min-h-9 w-full rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">Clear date</button>
        </div>}
      </PopoverContent>
    </Popover>
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-rose-600">{error}</p>}
  </div>;
}
