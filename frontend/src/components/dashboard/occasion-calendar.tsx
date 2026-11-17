"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Gem, Gift, Star } from "lucide-react";
import { type CalendarFilter, type CalendarItem, dashboardService } from "@/features/dashboard/dashboard.service";
import { cn } from "@/lib/utils";
import { useAsync } from "./use-async";

const FILTERS: Array<{ id: CalendarFilter; label: string }> = [{ id: "ALL", label: "All" }, { id: "EXTERNAL", label: "External" }, { id: "INTERNAL", label: "Internal" }, { id: "COMPANY", label: "Company Events" }];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 1;

const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;
const shiftMonth = (key: string, step: number) => { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + step, 1); return monthKey(d.getFullYear(), d.getMonth()); };
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

function chipStyle(item: CalendarItem) {
  if (item.kind === "BIRTHDAY") return { tone: "bg-emerald-100/70 text-emerald-900", icon: <Gift size={13} /> };
  if (item.kind === "ANNIVERSARY" || item.kind === "WORK_ANNIVERSARY") return { tone: "bg-amber-100/80 text-amber-900", icon: <Gem size={13} /> };
  if (item.category === "COMPANY") return { tone: "bg-indigo-100/70 text-indigo-900", icon: <CalendarDays size={13} /> };
  return { tone: "bg-violet-100/70 text-violet-900", icon: <Star size={13} /> };
}

function Chip({ item }: { item: CalendarItem }) {
  const { tone, icon } = chipStyle(item);
  const person = item.category !== "COMPANY" && !!item.recipientId;
  return <Link href="/occasions" title={`${item.title} · ${item.label}`} className={cn("flex min-h-6 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-95", tone)}>
    <span aria-hidden className="shrink-0">{icon}</span>
    <span className="min-w-0 truncate font-medium">{person ? `${item.title} ${item.label}` : item.title}</span>
  </Link>;
}

export function OccasionCalendar({ tenantId }: { tenantId: string }) {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const thisMonth = monthKey(now.getFullYear(), now.getMonth());
  const [month, setMonth] = useState(thisMonth);
  const [filter, setFilter] = useState<CalendarFilter>("ALL");
  const { data, loading, failed } = useAsync(() => dashboardService.calendar(tenantId, month, filter), `${tenantId}|${month}|${filter}`);

  const [year, monthIndex] = [Number(month.slice(0, 4)), Number(month.slice(5)) - 1];
  const cells = useMemo(() => {
    const lead = new Date(year, monthIndex, 1).getDay();
    const days = new Date(year, monthIndex + 1, 0).getDate();
    const total = Math.ceil((lead + days) / 7) * 7;
    return Array.from({ length: total }, (_, i) => (i < lead || i >= lead + days ? null : i - lead + 1));
  }, [year, monthIndex]);
  const byDay = useMemo(() => {
    const map = new Map<number, CalendarItem[]>();
    for (const item of data?.items ?? []) { const day = Number(item.date.slice(8, 10)); map.set(day, [...(map.get(day) ?? []), item]); }
    return map;
  }, [data]);
  const monthOptions = Array.from({ length: 19 }, (_, i) => shiftMonth(thisMonth, i - 6));
  if (!monthOptions.includes(month)) monthOptions.push(month);

  return <section aria-label="Occasion calendar" className="overflow-hidden rounded-xl border border-line bg-white">
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-2">
      <h2 className="flex items-center gap-3 text-base font-semibold text-ink"><span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-brand"><CalendarDays size={18} /></span>Occasion Calendar</h2>
      <div role="tablist" aria-label="Calendar filter" className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-white p-1 shadow-sm">
        {FILTERS.map((item) => <button key={item.id} role="tab" type="button" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}
          className={cn("min-h-7 rounded-full px-3.5 text-xs font-medium transition", filter === item.id ? "bg-brand text-white" : "text-ink hover:bg-slate-50")}>{item.label}</button>)}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-brand shadow-sm hover:bg-slate-50"><ChevronLeft size={16} /></button>
        <label className="relative">
          <span className="sr-only">Month</span>
          <select value={month} onChange={(event) => setMonth(event.target.value)} className="h-8 min-w-[10.5rem] appearance-none rounded-full border border-line bg-white pl-4 pr-9 text-sm font-medium text-ink shadow-sm outline-none focus:border-brand">
            {monthOptions.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
          </select>
          <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
        </label>
        <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-brand shadow-sm hover:bg-slate-50"><ChevronRight size={16} /></button>
      </div>
    </header>
    {failed && <p role="alert" className="mx-4 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">We couldn&apos;t load the calendar. Try another month or refresh.</p>}
    <div className="overflow-x-auto px-3 pb-2">
      <div className={cn("min-w-[44rem] overflow-hidden rounded-lg border border-line/70", loading && "opacity-60 transition-opacity")} aria-busy={loading}>
        <div className="grid grid-cols-7 bg-slate-50/70 text-center text-xs text-muted">{WEEKDAYS.map((day) => <div key={day} className="border-r border-line/60 py-1 last:border-r-0">{day}</div>)}</div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            const items = day ? byDay.get(day) ?? [] : [];
            const iso = day ? `${month}-${String(day).padStart(2, "0")}` : "";
            return <div key={index} className="h-[3.6rem] min-w-0 overflow-hidden border-b border-r border-line/60 p-1 [&:nth-child(7n)]:border-r-0">
              {day && <>
                <div className="mb-0.5 flex items-center justify-between gap-1"><span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs tabular-nums text-ink", iso === todayIso && "bg-brand font-semibold text-white")}>{day}</span>
                  {items.length > MAX_CHIPS && <Link href="/occasions" className="rounded px-1 text-[11px] font-semibold text-brand hover:underline">+{items.length - MAX_CHIPS} more</Link>}
                </div>
                {items.slice(0, MAX_CHIPS).map((item) => <Chip key={item.key} item={item} />)}
              </>}
            </div>;
          })}
        </div>
      </div>
    </div>
  </section>;
}
