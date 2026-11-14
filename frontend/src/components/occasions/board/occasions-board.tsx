"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Info, List as ListIcon, MoreVertical, Plus, Search } from "lucide-react";
import { control, iconButton, table } from "@/components/ui/table-styles";
import { Tab as TabItem, TabBar } from "@/components/ui/tab-bar";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { HoverScrollX } from "@/components/ui/hover-scroll-x";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { STATUS_META as REQUEST_STATUS, day, inr, useTenantId } from "@/components/gift-requests/shared";
import { EventSendSheet } from "../event-send-sheet";
import type { UpcomingEvent } from "../shared";
import { AddOccasionPanel } from "./add-occasion-panel";
import { CalendarView } from "./calendar-view";
import { OccasionDetails } from "./occasion-details";
import { StatusPill, Subject } from "./parts";
import { useOverview } from "./use-overview";
import { KIND_META, RANGES, SORTS, TABS, actionFor, countdownText, isoOf, type ActionKind, type OverviewItem, type Sort, type Tab } from "./types";

const PAGE_SIZE = 10;
const VIEW_KEY = "tofaa-occasions-view";

const toSendItem = (item: OverviewItem): UpcomingEvent => ({
  kind: item.kind === "BIRTHDAY" ? "BIRTHDAY" : item.kind === "EVENT" ? "EVENT" : "ANNIVERSARY",
  recipientId: item.recipientId ?? "", recipientName: item.name, title: item.label, date: item.date, daysAway: item.daysAway, eventId: item.eventId, requestId: item.requestId,
});

/** Client home for Occasions: a calendar or a table of every important date, with what to do next for each. */
export function OccasionsBoard() {
  const router = useRouter();
  const { user, tenantId, isClient } = useTenantId();
  const canPlan = user?.platformRole !== "SUPER_ADMIN";

  const [view, setView] = useState<"list" | "calendar">("list");
  const [range, setRange] = useState("90");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("ALL");
  const [sort, setSort] = useState<Sort>("soonest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<OverviewItem | null>(null);
  const [form, setForm] = useState<{ item: OverviewItem | null; date?: string } | null>(null);
  const [sending, setSending] = useState<UpcomingEvent | null>(null);
  const [warn, setWarn] = useState<{ item: OverviewItem; kind: ActionKind } | null>(null);

  useEffect(() => { try { const saved = window.localStorage.getItem(VIEW_KEY); if (saved === "calendar" || saved === "list") setView(saved); } catch { /* the page works without it */ } }, []);
  useEffect(() => { try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ } }, [view]);
  useEffect(() => { const timer = setTimeout(() => { setQ(text.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [text]);

  // The calendar shows six whole weeks around the month; the list shows the chosen range.
  const gridStart = useMemo(() => new Date(month.getFullYear(), month.getMonth(), 1 - new Date(month.getFullYear(), month.getMonth(), 1).getDay()), [month]);
  const gridEnd = useMemo(() => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 41), [gridStart]);
  const customReady = range !== "custom" || (!!from && !!to && to >= from);
  const params = useMemo(() => view === "calendar"
    ? { dateFrom: isoOf(gridStart), dateTo: isoOf(gridEnd), limit: 500, ...(q && { q }) }
    : { ...(range === "custom" ? { dateFrom: from, dateTo: to } : { days: Number(range) }), tab, sort, page, limit: PAGE_SIZE, ...(q && { q }) },
  [view, gridStart, gridEnd, range, from, to, tab, sort, page, q]);
  const { data, error, loading, reload } = useOverview(tenantId, params, view === "calendar" || customReady);

  const count = (key: Tab) => data?.counts?.[key] ?? 0;
  const total = data?.pagination.totalRecords ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const proceed = (item: OverviewItem, kind: ActionKind) => {
    if (kind === "plan" || kind === "create") {
      if (item.sourceType === "COMPANY") router.push(`/occasions/${item.occasionId}`);
      else if (kind === "create" && item.eventId) router.push(`/requests/new?recipientId=${item.recipientId}&eventId=${item.eventId}`);
      else setSending(toSendItem(item));
    } else if (item.requestId && (kind === "request" || kind === "track")) router.push(`/requests/${item.requestId}`);
    else setSelected(item);
  };
  const act = (item: OverviewItem, kind: ActionKind = actionFor(item).kind) => {
    if ((kind === "plan" || kind === "create") && item.requests.length) setWarn({ item, kind }); // warn before a second request for the same date
    else proceed(item, kind);
  };

  if (!tenantId) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{isClient ? "Your account isn't linked to an organisation yet. Please contact TOFAA." : "Choose a client from the “Viewing” menu at the top first."}</div>;

  const months = Array.from({ length: 24 }, (_, i) => new Date(new Date().getFullYear(), new Date().getMonth() - 6 + i, 1));
  const controlClass = control;
  const selectIcon = <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand" aria-hidden />;
  const chevron = <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <TabBar label="View">
        {([["calendar", "Calendar", CalendarDays], ["list", "List", ListIcon]] as const).map(([key, label, Icon]) => <TabItem key={key} variant="solid" active={view === key} onClick={() => setView(key)} icon={<Icon size={16} />}>{label}</TabItem>)}
      </TabBar>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
        <SearchInput value={text} onChange={setText} placeholder="Search recipient or occasion…" />
        {view === "calendar"
          ? <label className="relative"><span className="sr-only">Month</span>{selectIcon}
            <select value={`${month.getFullYear()}-${month.getMonth()}`} onChange={(event) => { const [y, m] = event.target.value.split("-").map(Number); setMonth(new Date(y, m, 1)); }} className={cn(controlClass, "appearance-none pl-9 pr-8 font-medium")}>
              {months.map((value) => <option key={`${value.getFullYear()}-${value.getMonth()}`} value={`${value.getFullYear()}-${value.getMonth()}`}>{value.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</option>)}
            </select>{chevron}</label>
          : <label className="relative"><span className="sr-only">Date range</span>{selectIcon}
            <select value={range} onChange={(event) => { setRange(event.target.value); setPage(1); }} className={cn(controlClass, "appearance-none pl-9 pr-8 font-medium")}>
              {RANGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>{chevron}</label>}
        {canPlan && <Button size="lg" onClick={() => setForm({ item: null })}><Plus size={16} /> Add Occasion</Button>}
      </div>
    </div>

    {view === "list" && range === "custom" && <div className="flex flex-wrap items-start gap-3">
      <DatePickerField compact id="occ-from" label="From date" value={from} onChange={(value) => { setFrom(value); setPage(1); }} placeholder="From date" />
      <DatePickerField compact id="occ-to" label="To date" value={to} onChange={(value) => { setTo(value); setPage(1); }} minDate={from ? new Date(`${from}T00:00:00`) : undefined} placeholder="To date" />
      {!customReady && <p className="self-center text-sm text-muted">Pick both dates to see occasions.</p>}
    </div>}
    {view === "calendar" && <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm text-slate-700"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" />Recipient</span><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-violet-400" />Company Event</span></div>
        <div className="flex items-center gap-3 text-sm font-semibold text-ink">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="press flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white"><ChevronLeft size={16} /></button>
          <span className="min-w-36 text-center">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
          <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="press flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white"><ChevronRight size={16} /></button>
        </div>
    </div>}

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

    {view === "calendar"
      ? <CalendarView month={month} items={data?.items ?? []} loading={loading && !data} onSelect={setSelected} onDateClick={canPlan ? (iso) => setForm({ item: null, date: iso }) : undefined} />
      : <>
        <div className="flex items-center gap-2 rounded-xl bg-white p-1.5 ring-1 ring-line/70">
        <TabBar bare label="Status" wrapperClassName="min-w-0 flex-1">
          {TABS.map(({ key, label }) => <TabItem key={key} active={tab === key} count={count(key)} onClick={() => { setTab(key); setPage(1); }}>{label}</TabItem>)}
        </TabBar>
        <div className="flex shrink-0 items-center gap-2 border-l border-line/70 pl-2 pr-0.5 text-sm text-muted">
          <label htmlFor="occ-sort" className="hidden 2xl:block">Sort by:</label>
          <select id="occ-sort" value={sort} onChange={(event) => { setSort(event.target.value as Sort); setPage(1); }} aria-label="Sort by" className={cn(control, "h-9 px-2.5 font-medium")}>{SORTS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
        </div>
        </div>

        <Card className="overflow-hidden">
          <HoverScrollX>
            <table className={cn(table.root, "min-w-[56rem]")}>
              <thead className={table.head}><tr className={table.headRow}>{["Recipient / Event", "Occasion", "Date & Countdown", "Status", "Budget", "Action"].map((heading) => <th key={heading} scope="col" className={table.th}>{heading}</th>)}</tr></thead>
              <tbody>
                {loading && !data ? <tr><td colSpan={6} className="px-5 py-16"><div className="flex justify-center"><Spinner /></div></td></tr>
                  : !data?.items.length ? <tr><td colSpan={6} className="px-5 py-16 text-center"><CalendarDays size={28} className="mx-auto text-slate-400" /><p className="mt-3 text-base font-semibold text-ink">{q || tab !== "ALL" ? "Nothing matches" : "No occasions in this range"}</p><p className="mt-1 text-sm text-muted">{q || tab !== "ALL" ? "Try another search or status." : "Add an occasion, or choose a longer range."}</p></td></tr>
                  : data.items.map((item) => {
                    const action = actionFor(item);
                    const { icon: KindIcon, tint } = KIND_META[item.kind];
                    const primary = action.kind === "plan";
                    return <tr key={item.key} tabIndex={0} onClick={() => setSelected(item)} onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) setSelected(item); }} className={cn(table.row, "cursor-pointer focus-visible:bg-slate-50 focus-visible:outline-none", loading && "opacity-60")}>
                      <td className={table.td}><div className="flex items-center gap-3"><Subject item={item} /><div className="min-w-0"><p className="truncate font-semibold capitalize text-ink">{item.name}</p><p className="truncate text-xs text-muted">{item.sourceType === "COMPANY" ? "Company Event" : item.relationship ?? ""}</p></div></div></td>
                      <td className={table.td}><span className="flex items-center gap-3 text-sm font-medium text-ink"><span aria-hidden className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tint)}><KindIcon size={20} /></span>{item.label}</span></td>
                      <td className={table.td}><p className="text-sm font-semibold tabular-nums text-ink">{day(item.date)}</p><p className={cn("text-xs", item.daysAway >= 0 && item.daysAway <= 7 ? "font-medium text-amber-700" : "text-muted")}>{countdownText(item.daysAway)}</p></td>
                      <td className={table.td}><StatusPill status={item.status} /></td>
                      <td className="px-5 py-3.5 font-semibold tabular-nums text-ink">{item.budget ? inr(item.budget) : "—"}</td>
                      <td className={table.td}><div className="flex items-center gap-1.5">
                        <button type="button" disabled={(action.kind === "plan" || action.kind === "create") && !canPlan} onClick={(event) => { event.stopPropagation(); act(item); }} className={cn("press inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold disabled:opacity-50", primary ? "border-brand bg-brand text-white hover:bg-brand-dark" : "border-brand/60 bg-white text-brand hover:bg-brand-soft")}>{action.label}<ArrowRight size={15} aria-hidden /></button>
                        <button type="button" aria-label={`More for ${item.name}`} onClick={(event) => { event.stopPropagation(); setSelected(item); }} className={iconButton}><MoreVertical size={16} /></button>
                      </div></td>
                    </tr>;
                  })}
              </tbody>
            </table>
          </HoverScrollX>
          <div className={cn(table.footer, "text-sm text-muted")}>
            <p className="flex items-center gap-2"><Info size={16} aria-hidden />{total ? `Showing ${(page - 1) * PAGE_SIZE + 1} – ${Math.min(page * PAGE_SIZE, total)} of ${total} occasions` : "No occasions to show"}</p>
            {pages > 1 && <nav aria-label="Pages" className="flex items-center gap-1.5">
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className="press flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white disabled:opacity-40"><ChevronLeft size={16} /></button>
              {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1).map((n, i, list) => <span key={n} className="flex items-center gap-1.5">{i > 0 && n - list[i - 1] > 1 && <span aria-hidden>…</span>}<button type="button" aria-current={n === page ? "page" : undefined} onClick={() => setPage(n)} className={cn("press h-9 min-w-9 rounded-lg px-2 text-sm font-semibold tabular-nums", n === page ? "bg-brand text-white" : "border border-line bg-white text-slate-700")}>{n}</button></span>)}
              <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)} className="press flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white disabled:opacity-40"><ChevronRight size={16} /></button>
            </nav>}
          </div>
        </Card>
      </>}

    <OccasionDetails item={selected} canPlan={canPlan} tenantId={tenantId} onClose={() => setSelected(null)}
      onAct={(item, kind) => { setSelected(null); act(item, kind); }}
      onEdit={(item) => { setSelected(null); setForm({ item }); }}
      onDeleted={() => { setSelected(null); reload(); }} />
    <AddOccasionPanel open={!!form} editing={form?.item ?? null} prefilledDate={form?.date} tenantId={tenantId} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />
    <EventSendSheet item={sending} onClose={() => setSending(null)} onSent={() => { setSending(null); reload(); }} />

    <Sheet open={!!warn} labelledBy="occ-dup-title" className="max-w-md" onClose={() => setWarn(null)}>
      {warn && <div className="space-y-4">
        <h2 id="occ-dup-title" className="text-xl font-semibold text-ink">A request already exists</h2>
        <p className="text-sm text-muted">{warn.item.name} · {warn.item.label} · {day(warn.item.date)} already has {warn.item.requests.length === 1 ? "a gift request" : `${warn.item.requests.length} gift requests`}. {warn.kind === "create" ? "Creating another may duplicate it." : "Open it instead of sending a second one."}</p>
        <ul className="divide-y divide-line/60 rounded-xl border border-line/70">
          {warn.item.requests.map((request) => {
            const meta = REQUEST_STATUS[request.status as keyof typeof REQUEST_STATUS];
            return <li key={request.id}><a href={`/requests/${request.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"><span className="font-semibold text-ink">{request.requestCode ?? "Request"}</span><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", meta?.chip ?? "bg-slate-100 text-slate-700")}>{meta?.label ?? request.status}</span></a></li>;
          })}
        </ul>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          {warn.kind === "create" && <Button variant="secondary" onClick={() => { const { item, kind } = warn; setWarn(null); proceed(item, kind); }}>Create anyway</Button>}
          <Button onClick={() => { const id = warn.item.requestId ?? warn.item.requests[0].id; setWarn(null); router.push(`/requests/${id}`); }}>Open existing request</Button>
        </div>
      </div>}
    </Sheet>
  </div>;
}
