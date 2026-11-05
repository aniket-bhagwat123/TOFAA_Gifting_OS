"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cake, CalendarDays, Gift, Heart } from "lucide-react";
import { getModuleRecords } from "@/features/modules/module.service";
import { Button } from "@/components/ui/button";
import { shortDay } from "@/components/gift-requests/shared";

export type UpcomingOccasion = { id: string; occasionName: string; occasionDate: string; description?: string | null; daysAway: number; isGlobal: boolean; requestsSent: number };
export type UpcomingEvent = { kind: "BIRTHDAY" | "ANNIVERSARY" | "EVENT"; recipientId: string; recipientName?: string | null; title: string; date: string; daysAway: number; eventId?: string | null; requestId?: string | null };

export const countdown = (days: number) => (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`);

/** Price per credit and the credits the client can still use, to turn a rupee budget into credits and warn early. */
export function useBudgetInfo(tenantId?: string | null) {
  const [info, setInfo] = useState<{ unitPriceMinor: number | null; available: number | null }>({ unitPriceMinor: null, available: null });
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    Promise.all([
      getModuleRecords(`/tenants/${tenantId}/credits/pricing`, {}, { ttl: 60_000 }).catch(() => null),
      getModuleRecords(`/tenants/${tenantId}/credits/balance`, {}).catch(() => null),
    ]).then(([pricing, balance]) => {
      if (!cancelled) setInfo({ unitPriceMinor: (pricing as { unitPriceMinor?: number } | null)?.unitPriceMinor ?? null, available: (balance as { availableCredits?: number } | null)?.availableCredits ?? null });
    });
    return () => { cancelled = true; };
  }, [tenantId]);
  return info;
}

const icon = { BIRTHDAY: <Cake size={18} />, ANNIVERSARY: <Heart size={18} />, EVENT: <CalendarDays size={18} /> };
const tint = { BIRTHDAY: "bg-rose-50 text-rose-600", ANNIVERSARY: "bg-violet-50 text-violet-600", EVENT: "bg-brand-soft text-brand" };

/** Birthdays, anniversaries and other recipient events, each with a Send button. */
export function EventList({ items, busyKey, onSend }: { items: UpcomingEvent[]; busyKey?: string | null; onSend: (item: UpcomingEvent) => void }) {
  return <ul className="divide-y divide-line/70">
    {items.map((item) => {
      const key = `${item.recipientId}-${item.date}-${item.title}`;
      return <li key={key} className="flex items-center gap-4 px-5 py-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint[item.kind]}`}>{icon[item.kind]}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{item.recipientName ?? "Someone"}</p>
          <p className="truncate text-sm text-muted">{item.title} · {shortDay(item.date)} · <span className={item.daysAway <= 7 ? "font-medium text-amber-700" : ""}>{countdown(item.daysAway)}</span></p>
        </div>
        {item.requestId
          ? <Link href={`/requests/${item.requestId}`} className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">Sent</Link>
          : <Button size="sm" className="shrink-0" disabled={busyKey === key} onClick={() => onSend(item)}><Gift size={15} /> Send gift</Button>}
      </li>;
    })}
  </ul>;
}
