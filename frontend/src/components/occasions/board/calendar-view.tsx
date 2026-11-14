"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { HoverScrollX } from "@/components/ui/hover-scroll-x";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { KIND_META, isoOf, parseIso, type OverviewItem } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHOWN = 2;

function Chip({ item, onSelect }: { item: OverviewItem; onSelect: (item: OverviewItem) => void }) {
  const company = item.sourceType === "COMPANY";
  const { icon: Icon } = KIND_META[item.kind];
  const when = parseIso(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(item); }} title={`${item.name} · ${item.label}`} className={cn("press flex w-full items-center gap-1.5 rounded-xl px-1.5 py-1 text-left", company ? "bg-violet-100 text-violet-950 hover:bg-violet-200" : "bg-emerald-100 text-emerald-950 hover:bg-emerald-200")}>
    {company ? <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-200 text-violet-700"><Icon size={14} /></span> : <Avatar name={item.name} src={item.recipientAvatarUrl} className="h-6 w-6 text-[0.6rem]" />}
    <span className="min-w-0"><span className="block truncate text-xs font-semibold capitalize leading-tight">{item.name}</span><span className="block truncate text-[0.65rem] leading-tight opacity-75">{item.label} • {when}</span></span>
  </button>;
}

/** A month grid (Sunday first) like a calendar app: each day lists what falls on it; tap one to open it. */
export function CalendarView({ month, items, loading, onSelect, onDateClick }: { month: Date; items: OverviewItem[]; loading: boolean; onSelect: (item: OverviewItem) => void; onDateClick?: (iso: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const todayIso = isoOf(new Date());
  const byDay = useMemo(() => {
    const map = new Map<string, OverviewItem[]>();
    for (const item of items) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  }, [items]);
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - new Date(month.getFullYear(), month.getMonth(), 1).getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const weeks = days[35].getMonth() === month.getMonth() ? 6 : 5; // drop a trailing week that is entirely next month

  return <Card className="overflow-hidden">
    <HoverScrollX>
      <div className="min-w-[44rem]" role="grid" aria-label={month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}>
        <div role="row" className="grid grid-cols-7 bg-brand-soft/60 text-center text-sm font-semibold text-slate-700">{WEEKDAYS.map((name) => <div key={name} role="columnheader" className="py-3">{name}</div>)}</div>
        {loading ? <div className="flex h-72 items-center justify-center"><Spinner /></div> : <div className="grid grid-cols-7">
          {days.slice(0, weeks * 7).map((date) => {
            const iso = isoOf(date);
            const here = byDay.get(iso) ?? [];
            const outside = date.getMonth() !== month.getMonth();
            const isPast = iso < todayIso;
            const open = expanded === iso;
            const visible = open ? here : here.slice(0, SHOWN);
            const clickable = onDateClick && !outside && !isPast;
            return <div key={iso} role="gridcell" className={cn("group min-h-28 border-b border-r border-line/50 p-1.5", outside && "bg-slate-50/60", isPast && "opacity-60", clickable && "cursor-pointer hover:bg-brand-soft/20")} onClick={clickable ? () => onDateClick(iso) : undefined}>
              <p className={cn("mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm", iso === todayIso ? "bg-brand font-semibold text-white" : outside ? "text-slate-300" : "text-ink")}>{date.getDate()}</p>
              <div className="space-y-1">
                {visible.map((item) => <Chip key={item.key} item={item} onSelect={onSelect} />)}
                {here.length > SHOWN && <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded(open ? null : iso); }} className="w-full rounded-lg px-1.5 py-0.5 text-left text-xs font-semibold text-brand hover:bg-brand-soft">{open ? "Show less" : `+${here.length - SHOWN} more`}</button>}
              </div>
            </div>;
          })}
        </div>}
      </div>
    </HoverScrollX>
  </Card>;
}
