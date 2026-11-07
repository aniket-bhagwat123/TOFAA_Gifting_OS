"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Cake, CalendarDays, ChevronRight, Gift, Heart } from "lucide-react";
import { getModuleRecords } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { day, inr, num, relativeTime, shortDay, useTenantId } from "@/components/gift-requests/shared";
import { EventSendSheet } from "./event-send-sheet";
import { type UpcomingEvent, type UpcomingOccasion, countdown } from "./shared";

type Activity = { requestId?: string | null; title: string; recipientName?: string | null; sourceName?: string | null; budget?: number | string | null; credits?: number | null; status: string; happenedAt: string };
type ActivityData = { pending: Activity[]; approved: Activity[]; delivered: Activity[] };
type Tile = { kind: "occasion"; date: string; occasion: UpcomingOccasion } | { kind: "event"; date: string; event: UpcomingEvent };

const LOOKAHEAD_DAYS = 120;
const eventIcon = { BIRTHDAY: <Cake size={18} />, ANNIVERSARY: <Heart size={18} />, EVENT: <CalendarDays size={18} /> };
const eventTint = { BIRTHDAY: "bg-rose-50 text-rose-600", ANNIVERSARY: "bg-violet-50 text-violet-600", EVENT: "bg-brand-soft text-brand" };
const SECTIONS = [["approved", "Approved budget"], ["delivered", "Delivered recently"], ["pending", "Waiting on TOFAA"]] as const;
const sectionEmpty = { approved: "No approved budgets yet. Once TOFAA's proposal is approved, it shows here.", delivered: "Nothing delivered in the last 30 days.", pending: "Nothing waiting. Gifts you send show here until they are approved." };

/** Client home for Occasions: cards for what is coming up (occasions tall, events short), plus what happened after sending. */
export function OccasionsHome() {
  const { tenantId, isClient } = useTenantId();
  const [tab, setTab] = useState<"upcoming" | "activity">("upcoming");
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>("approved");
  const [occasions, setOccasions] = useState<UpcomingOccasion[] | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<UpcomingEvent | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [occasionRows, eventRows, activityData] = await Promise.all([
        getModuleRecords(`/tenants/${tenantId}/occasions/upcoming`, { days: LOOKAHEAD_DAYS }),
        getModuleRecords(`/tenants/${tenantId}/gift-requests/upcoming`, { days: LOOKAHEAD_DAYS }),
        getModuleRecords(`/tenants/${tenantId}/gift-requests/activity`, {}),
      ]);
      setOccasions((occasionRows as UpcomingOccasion[]) ?? []);
      setEvents((eventRows as UpcomingEvent[]) ?? []);
      setActivity(activityData as ActivityData);
      setError(null);
    } catch (err) { setError(getApiErrorMessage(err)); setOccasions([]); setEvents([]); setActivity({ pending: [], approved: [], delivered: [] }); }
  }, [tenantId]);
  useEffect(() => { setOccasions(null); setEvents(null); void load(); }, [load]);

  // One list, nearest first. Anything already sent leaves it and moves to the other tab.
  const cards: Tile[] | null = useMemo(() => {
    if (!occasions || !events) return null;
    return [
      ...occasions.filter((occasion) => occasion.requestsSent === 0).map((occasion): Tile => ({ kind: "occasion", date: occasion.occasionDate, occasion })),
      ...events.filter((event) => !event.requestId).map((event): Tile => ({ kind: "event", date: event.date, event })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "occasion" ? -1 : 1));
  }, [occasions, events]);

  const byMonth = (cards ?? []).reduce<[string, Tile[]][]>((groups, card) => {
    const label = new Date(`${card.date}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const last = groups[groups.length - 1];
    if (last?.[0] === label) last[1].push(card); else groups.push([label, [card]]);
    return groups;
  }, []);

  const renderCards = (list: Tile[]) => <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((card) => card.kind === "occasion"
          ? <Link key={`o-${card.occasion.id}`} href={`/occasions/${card.occasion.id}`} className="group block">
            <Card className="flex min-h-72 flex-col gap-4 p-6 transition-shadow group-hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand text-white">
                  <span className="text-2xl font-bold leading-none">{new Date(`${card.occasion.occasionDate}T00:00:00`).getDate()}</span>
                  <span className="mt-1 text-[0.7rem] font-semibold uppercase tracking-wide opacity-90">{new Date(`${card.occasion.occasionDate}T00:00:00`).toLocaleDateString("en-GB", { month: "short" })}</span>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${card.occasion.daysAway <= 7 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{countdown(card.occasion.daysAway)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-bold capitalize text-ink">{card.occasion.occasionName}</h3>
                <p className="mt-1 text-sm text-muted">{day(card.occasion.occasionDate)}</p>
                {card.occasion.description && <p className="mt-3 line-clamp-3 text-sm text-ink/80">{card.occasion.description}</p>}
              </div>
              <span className="inline-flex items-center justify-center gap-1 rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand">Plan gifts <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" /></span>
            </Card>
          </Link>
          : <Card key={`e-${card.event.recipientId}-${card.event.date}-${card.event.title}`} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand text-white">
                <span className="text-lg font-bold leading-none">{new Date(`${card.event.date}T00:00:00`).getDate()}</span>
                <span className="mt-0.5 text-[0.6rem] font-semibold uppercase tracking-wide opacity-90">{new Date(`${card.event.date}T00:00:00`).toLocaleDateString("en-GB", { month: "short" })}</span>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${card.event.daysAway <= 7 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{countdown(card.event.daysAway)}</span>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate font-bold text-ink"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${eventTint[card.event.kind]}`}>{eventIcon[card.event.kind]}</span><span className="truncate">{card.event.recipientName ?? "Someone"}</span></p>
              <p className="mt-0.5 truncate text-sm text-muted">{card.event.title} · {day(card.event.date)}</p>
            </div>
            <button type="button" onClick={() => setSending(card.event)} className="inline-flex items-center justify-center gap-1 rounded-xl bg-brand-soft px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/15">Send gift <ChevronRight size={16} /></button>
          </Card>)}
  </div>;

  if (!tenantId) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">{isClient ? "Your account isn't linked to an organisation yet. Please contact TOFAA." : "Choose a client from the “Viewing” menu at the top first."}</div>;

  const list = activity?.[section] ?? [];
  const count = (key: (typeof SECTIONS)[number][0]) => activity?.[key].length ?? 0;

  return <div className="space-y-6">
    <div role="tablist" className="inline-flex gap-1 rounded-2xl bg-slate-100 p-1.5 text-sm">
      {([["upcoming", "Upcoming"], ["activity", "Approved & delivered"]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-10 rounded-xl px-5 font-semibold ${tab === key ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{label}</button>)}
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

    {tab === "upcoming" ? <>
      {cards === null ? <Card className="flex h-56 items-center justify-center"><Spinner /></Card> : !cards.length ? <Card className="px-6 py-14 text-center">
        <CalendarDays size={30} className="mx-auto text-slate-400" />
        <p className="mt-3 text-lg font-semibold text-ink">You're all caught up</p>
        <p className="mt-1 text-sm text-muted">Nothing upcoming right now. New occasions and events show up here as they get close.</p>
      </Card> : byMonth.slice(0, 1).map(([month, group]) => <section key={month} className="space-y-3">
        <h2 className="text-base font-bold text-ink">{month}</h2>
        {renderCards(group)}
      </section>)}
    </> : <>
      <div role="tablist" aria-label="Status" className="flex flex-wrap gap-2">
        {SECTIONS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={section === key} onClick={() => setSection(key)} className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${section === key ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-ink"}`}>{label}{count(key) > 0 && <span className="ml-2 text-xs">{count(key)}</span>}</button>)}
      </div>
      {activity === null ? <Card className="flex h-56 items-center justify-center"><Spinner /></Card> : !list.length ? <Card className="px-6 py-14 text-center text-sm text-muted">{sectionEmpty[section]}</Card> : <div className="grid items-start gap-4 sm:grid-cols-2">
        {list.map((item, index) => {
          const body = <Card className="flex min-h-20 items-center gap-3.5 px-4 py-3 transition-shadow hover:shadow-md">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Gift size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink capitalize">{item.recipientName ?? item.title}</p>
              <p className="truncate text-sm text-muted">{item.sourceName ?? item.title} · {relativeTime(item.happenedAt)}</p>
            </div>
            <div className="shrink-0 text-right">
              {item.budget ? <p className="font-semibold tabular-nums text-ink">{inr(item.budget)}</p> : null}
              {item.credits ? <p className="text-xs text-muted">{num(item.credits)} credits</p> : null}
            </div>
          </Card>;
          return item.requestId ? <Link key={`${item.requestId}-${index}`} href={`/requests/${item.requestId}`}>{body}</Link> : <div key={index}>{body}</div>;
        })}
      </div>}
    </>}

    <EventSendSheet item={sending} onClose={() => setSending(null)} onSent={() => { setSending(null); void load(); }} />
  </div>;
}
