"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Cake, Gift } from "lucide-react";
import { toast } from "sonner";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { shortDay, useTenantId } from "./shared";

type Upcoming = { kind: "BIRTHDAY" | "EVENT"; recipientId: string; recipientName?: string | null; title: string; date: string; daysAway: number; eventId?: string | null; requestId?: string | null };

const when = (days: number) => (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`);

/** Birthdays and events coming up, each with a one-click way to start a gift request. */
export function UpcomingPanel() {
  const { tenantId } = useTenantId();
  const router = useRouter();
  const [items, setItems] = useState<Upcoming[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    getModuleRecords(`/tenants/${tenantId}/gift-requests/upcoming`, { days: 60 })
      .then((data) => { if (!cancelled) setItems((data as Upcoming[]) ?? []); })
      .catch((err) => { if (!cancelled) { setError(getApiErrorMessage(err)); setItems([]); } });
    return () => { cancelled = true; };
  }, [tenantId]);

  const sendGift = async (item: Upcoming) => {
    const key = `${item.recipientId}-${item.date}-${item.title}`;
    setBusy(key);
    try {
      let eventId = item.eventId;
      if (!eventId) {
        // A birthday has no event record yet: create it so the request can point at it.
        const created = await mutateModule("post", `/tenants/${tenantId}/recipients/${item.recipientId}/events`, { eventName: item.title, eventDate: item.date }) as { id: string };
        eventId = created.id;
      }
      router.push(`/requests/new?recipientId=${item.recipientId}&eventId=${eventId}`);
    } catch (err) { toast.error(getApiErrorMessage(err)); setBusy(null); }
  };

  return <Card className="overflow-hidden">
    <div className="border-b border-line/70 px-5 py-4">
      <h3 className="font-semibold text-ink">Upcoming</h3>
      <p className="text-sm text-muted">Birthdays and events in the next 60 days</p>
    </div>
    {items === null ? <div className="flex h-48 items-center justify-center"><Spinner /></div>
      : error ? <p role="alert" className="p-5 text-sm text-rose-700">{error}</p>
      : !items.length ? <div className="px-5 py-10 text-center"><CalendarDays size={26} className="mx-auto text-slate-400" /><p className="mt-2 text-sm text-muted">Nothing coming up. Add birthdays and events to your recipients and they'll show here.</p></div>
      : <><ul className="divide-y divide-line/70">
        {(all ? items : items.slice(0, 5)).map((item) => {
          const key = `${item.recipientId}-${item.date}-${item.title}`;
          return <li key={key} className="flex items-center gap-3 px-5 py-3.5">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.kind === "BIRTHDAY" ? "bg-rose-50 text-rose-600" : "bg-brand-soft text-brand"}`}>{item.kind === "BIRTHDAY" ? <Cake size={18} /> : <CalendarDays size={18} />}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{item.recipientName ?? "Someone"}</p>
              <p className="truncate text-xs text-muted">{item.title} · {shortDay(item.date)} · <span className={item.daysAway <= 7 ? "font-medium text-amber-700" : ""}>{when(item.daysAway)}</span></p>
            </div>
            {item.requestId
              ? <Link href={`/requests/${item.requestId}`} className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">Requested</Link>
              : <Button size="sm" className="shrink-0" disabled={busy === key} onClick={() => void sendGift(item)}><Gift size={14} /> {busy === key ? "…" : "Send gift"}</Button>}
          </li>;
        })}
      </ul>
      {items.length > 5 && <button type="button" onClick={() => setAll((value) => !value)} className="w-full border-t border-line/70 px-5 py-3 text-sm font-semibold text-brand hover:bg-slate-50">{all ? "Show less" : `Show all ${items.length}`}</button>}</>}
  </Card>;
}
