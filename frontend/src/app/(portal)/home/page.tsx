"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, BarChart3, Building2, Cake, CalendarCheck, CalendarDays, CalendarRange, CheckCircle2, ChevronRight, ClipboardList, Gift, Info, Sparkles, Star, UserPlus, Users, Wallet, X, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadModule } from "@/features/modules/modules.slice";
import { moduleConfig } from "@/features/modules/module-config";
import { getModuleRecords } from "@/features/modules/module.service";
import { displayName } from "@/lib/utils";
import { type GiftRequest, type GiftStatus, STATUS_META, num, relativeTime, shortDay, useTenantId } from "@/components/gift-requests/shared";
import { type UpcomingEvent, type UpcomingOccasion, countdown } from "@/components/occasions/shared";
import { useAvailableCredits } from "@/components/occasions/available-credits";

type Role = "CLIENT" | "TOFAA_TEAM" | "SUPER_ADMIN";
type Action = { title: string; href: string; icon: LucideIcon };

// Which numbers each role sees on top. Each key is a module, so the numbers follow that module's own API and permissions.
const statsForRole: Record<Role, string[]> = { CLIENT: [], TOFAA_TEAM: ["requests", "gifts", "events"], SUPER_ADMIN: ["clients", "requests", "gifts", "credits"] };

const statMeta: Record<string, { label: string; icon: LucideIcon; tint: string }> = {
  requests: { label: "Gift requests", icon: ClipboardList, tint: "bg-rose-500" },
  gifts: { label: "Gifts", icon: Gift, tint: "bg-violet-500" },
  credits: { label: "Credit requests", icon: Wallet, tint: "bg-emerald-500" },
  clients: { label: "Clients", icon: Building2, tint: "bg-indigo-500" },
  events: { label: "Events", icon: CalendarRange, tint: "bg-amber-500" }
};

const heroActions: Record<Role, Action[]> = {
  CLIENT: [{ title: "View Upcoming Occasions", href: "/occasions", icon: CalendarDays }, { title: "Add a Person", href: "/recipients?new=1", icon: UserPlus }],
  TOFAA_TEAM: [{ title: "Review Requests", href: "/requests", icon: ClipboardList }, { title: "View Events", href: "/events", icon: CalendarRange }],
  SUPER_ADMIN: [{ title: "Review Requests", href: "/requests", icon: ClipboardList }, { title: "Add a Client", href: "/clients?new=1", icon: Building2 }]
};

// Where an occasion or event stands, worked out from the gift requests raised for it. Lower = further behind.
type Stage = "NOT_PLANNED" | "REQUEST_SUBMITTED" | "AWAITING_APPROVAL" | "IN_PROGRESS";
const stageRank: Record<Stage, number> = { NOT_PLANNED: 0, REQUEST_SUBMITTED: 1, AWAITING_APPROVAL: 2, IN_PROGRESS: 3 };
const stageMeta: Record<Stage, { label: string; chip: string; note: string; cta: string }> = {
  NOT_PLANNED: { label: "Not Planned", chip: "bg-rose-50 text-rose-600", note: "No gift request yet", cta: "Plan Gift" },
  REQUEST_SUBMITTED: { label: "Request Submitted", chip: "bg-violet-50 text-violet-700", note: "TOFAA is working on it", cta: "Track" },
  AWAITING_APPROVAL: { label: "Awaiting Approval", chip: "bg-blue-50 text-blue-700", note: "Proposal shared", cta: "Review" },
  IN_PROGRESS: { label: "Gift in Progress", chip: "bg-sky-50 text-sky-700", note: "On track for delivery", cta: "Track" }
};
const requestStage = (status: GiftStatus): Stage | null =>
  status === "SUBMITTED" || status === "IN_REVIEW" || status === "NEEDS_INFO" ? "REQUEST_SUBMITTED" : status === "PROPOSAL_READY" ? "AWAITING_APPROVAL" : status === "CONFIRMED" || status === "IN_PROGRESS" || status === "DISPATCHED" ? "IN_PROGRESS" : null;

type Coming = { key: string; kind: "occasion" | "birthday" | "event"; title: string; subtitle: string; date: string; daysAway: number; stage: Stage; requestId?: string; planHref: string; attention: boolean; priority: "High Priority" | "High" | "Medium" };
type Tab = "priority" | "month" | "next";
type Feed = { key: string; title: string; hint: string; at: string; href: string; icon: LucideIcon; tint: string };

const greeting = () => { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; };
const monthOf = (date: string, offset = 0) => { const d = new Date(`${date.slice(0, 10)}T00:00:00`); const now = new Date(); return d.getFullYear() * 12 + d.getMonth() === now.getFullYear() * 12 + now.getMonth() + offset; };
const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

function toComing(item: Omit<Coming, "stage" | "attention" | "priority" | "requestId">, requests: GiftRequest[], matches: (request: GiftRequest) => boolean): Coming {
  const stages = requests.filter(matches).map((request) => ({ stage: requestStage(request.status), id: request.id })).filter((entry): entry is { stage: Stage; id: string } => entry.stage !== null);
  const lead = stages.sort((a, b) => stageRank[a.stage] - stageRank[b.stage])[0];
  const stage = lead?.stage ?? "NOT_PLANNED";
  // Someone has to act: the client must approve a proposal, or nothing is planned and the date is close.
  const attention = stage === "AWAITING_APPROVAL" || (stage === "NOT_PLANNED" && item.daysAway <= 14);
  return { ...item, stage, requestId: lead?.id, attention, priority: attention ? "High Priority" : item.daysAway <= 14 ? "High" : "Medium" };
}

const kindIcon: Record<Coming["kind"], { icon: LucideIcon; tint: string }> = {
  birthday: { icon: Cake, tint: "bg-rose-50 text-rose-600" },
  event: { icon: CalendarCheck, tint: "bg-sky-50 text-sky-600" },
  occasion: { icon: CalendarDays, tint: "bg-amber-50 text-amber-600" }
};

function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3 p-5">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />)}</div>;
}

const GUIDE_STEPS: Array<{ num: number; icon: LucideIcon; iconBg: string; accent: string; ring: string; gradient: string; title: string; description: string; cta: string; href: string }> = [
  { num: 1, icon: Users, iconBg: "bg-brand", accent: "text-brand", ring: "ring-brand/20", gradient: "from-brand/[0.07]", title: "Create Your People", description: "Add the people you send gifts to — employees, clients, or loved ones — with their birthdays and key dates.", cta: "Add Recipient", href: "/recipients?new=1" },
  { num: 2, icon: CalendarDays, iconBg: "bg-amber-500", accent: "text-amber-600", ring: "ring-amber-400/25", gradient: "from-amber-500/[0.07]", title: "Plan Occasions", description: "Add birthdays, anniversaries, and company milestones so you're always ahead of every important date.", cta: "Open Occasions", href: "/occasions" },
  { num: 3, icon: Gift, iconBg: "bg-violet-500", accent: "text-violet-600", ring: "ring-violet-400/25", gradient: "from-violet-500/[0.07]", title: "Send Gift Requests", description: "Submit a request and our TOFAA team will curate the perfect, personalised gift for any occasion.", cta: "New Request", href: "/requests/new" },
];

function OnboardingGuide({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section aria-label="Getting started guide" className="relative overflow-hidden rounded-3xl border border-brand/15 bg-gradient-to-br from-white via-white to-brand-soft/40 p-6 shadow-soft sm:p-8">
      {/* Background decoration */}
      <Sparkles aria-hidden size={80} strokeWidth={0.8} className="absolute -right-4 -top-4 text-brand/[0.07]" />
      {/* Header */}
      <div className="relative mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
            <Sparkles size={11} /> Getting Started
          </span>
          <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">Your gifting journey starts here</h2>
          <p className="mt-1 text-sm text-muted">Follow these 3 steps to set up your gifting workflow.</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss guide" className="press shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>

      {/* Steps */}
      <div className="relative grid gap-3 sm:grid-cols-3 sm:gap-4">
        {/* Connecting line behind cards */}
        <div aria-hidden className="absolute left-0 right-0 top-[2.75rem] hidden h-px bg-gradient-to-r from-brand/30 via-amber-400/40 to-violet-400/30 sm:block" />

        {GUIDE_STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <Link key={step.num} href={step.href} onClick={onDismiss}
              className={`press group relative flex flex-col rounded-2xl border border-line/60 bg-gradient-to-br ${step.gradient} to-white p-5 transition hover:border-line hover:shadow-md`}>
              {/* Step badge + icon */}
              <div className="mb-4 flex items-center gap-3">
                <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${step.iconBg} ring-4 ${step.ring} text-white shadow-sm`}>
                  <Icon size={21} />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-700 text-[0.6rem] font-bold text-white">{step.num}</span>
                </span>
                <span className={`text-[0.65rem] font-bold uppercase tracking-widest ${step.accent} opacity-70`}>Step {step.num}</span>
              </div>
              {/* Text */}
              <h3 className="font-semibold leading-snug text-ink">{step.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{step.description}</p>
              {/* CTA row */}
              <div className={`mt-4 flex items-center gap-1.5 text-sm font-semibold ${step.accent} transition-all group-hover:gap-2.5`}>
                {step.cta} <ArrowRight size={14} />
              </div>
              {/* Step connector arrow (small, only between cards) */}
              {i < GUIDE_STEPS.length - 1 && (
                <div className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 sm:flex">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-line/60">
                    <ChevronRight size={11} className="text-slate-400" />
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer dismiss */}
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-xs text-muted">Complete these steps at your own pace — you can always come back to this guide.</p>
        <button type="button" onClick={onDismiss} className="press shrink-0 text-xs font-medium text-muted hover:text-ink hover:underline">
          I&apos;ll explore on my own
        </button>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const modules = useAppSelector((state) => state.modules.byKey);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const { tenantId } = useTenantId();
  const { available } = useAvailableCredits();
  const role = (user?.platformRole ?? "CLIENT") as Role;
  const statKeys = statsForRole[role];

  const [requests, setRequests] = useState<GiftRequest[] | null>(null);
  const [occasions, setOccasions] = useState<UpcomingOccasion[] | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);
  const [activity, setActivity] = useState<{ id: string; summary: string; title?: string; description?: string; actorName?: string; changedAt: string }[]>([]);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [slide, setSlide] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!user) return;
    for (const key of statKeys) {
      try { void dispatch(loadModule({ key, endpoint: moduleConfig[key].endpoint(user, selectedTenantId), params: { page: 1, limit: 5 } })); }
      catch { /* tenant scoped cards are left out when no client is chosen */ }
    }
  }, [dispatch, user, role, selectedTenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tenantId || role !== "CLIENT") { setShowGuide(false); return; }
    try { setShowGuide(!localStorage.getItem(`tofaa_guide_${tenantId}`)); } catch { setShowGuide(true); }
  }, [tenantId, role]);

  const dismissGuide = () => {
    try { if (tenantId) localStorage.setItem(`tofaa_guide_${tenantId}`, "1"); } catch { /* storage blocked */ }
    setShowGuide(false);
  };

  // Everything below is for the client being viewed.
  useEffect(() => {
    setRequests(null); setOccasions(null); setEvents(null); setActivity([]); setRecipientCount(null); setTab(null); setSlide(0);
    if (!tenantId) return;
    let cancelled = false;
    const base = `/tenants/${tenantId}`;
    const guard = <T,>(path: string, params: Record<string, string | number>, empty: T) => getModuleRecords(path, params).catch(() => empty) as Promise<T>;
    void Promise.all([
      guard<UpcomingOccasion[]>(`${base}/occasions/upcoming`, { days: 60 }, []),
      guard<UpcomingEvent[]>(`${base}/gift-requests/upcoming`, { days: 60 }, []),
      guard<{ items?: GiftRequest[] }>(`${base}/gift-requests`, { page: 1, limit: 100 }, { items: [] }),
      guard<{ items?: { id: string; summary: string; title?: string; description?: string; actorName?: string; changedAt: string }[] }>(`${base}/activity`, { page: 1, limit: 5 }, { items: [] }),
      guard<{ items?: unknown[]; pagination?: { total?: number } }>(`${base}/recipients`, { page: 1, limit: 1 }, {}),
    ]).then(([o, e, r, a, rec]) => {
      if (cancelled) return;
      setOccasions(Array.isArray(o) ? o : []); setEvents(Array.isArray(e) ? e : []); setRequests(r?.items ?? []); setActivity(a?.items ?? []);
      setRecipientCount((rec as { pagination?: { total?: number } })?.pagination?.total ?? (Array.isArray((rec as { items?: unknown[] })?.items) ? ((rec as { items?: unknown[] }).items?.length ?? 0) : 0));
    });
    return () => { cancelled = true; };
  }, [tenantId]);

  const coming = useMemo<Coming[] | null>(() => {
    if (!occasions || !events || !requests) return null;
    return [
      ...occasions.map((o) => toComing({ key: `o-${o.id}`, kind: "occasion", title: o.occasionName, subtitle: o.isGlobal ? "Occasion · All clients" : "Occasion", date: o.occasionDate, daysAway: o.daysAway, planHref: `/occasions/${o.id}` }, requests, (r) => r.occasionId === o.id)),
      ...events.map((e) => toComing({ key: `e-${e.recipientId}-${e.date}-${e.title}`, kind: e.kind === "BIRTHDAY" ? "birthday" : "event", title: e.recipientName ?? "Someone", subtitle: e.title, date: e.date, daysAway: e.daysAway, planHref: `/requests/new?recipientId=${e.recipientId}${e.eventId ? `&eventId=${e.eventId}` : ""}` }, requests, (r) => (!!e.requestId && r.id === e.requestId) || (!!e.eventId && r.eventId === e.eventId))),
    ].sort((a, b) => Number(b.attention) - Number(a.attention) || a.daysAway - b.daysAway);
  }, [occasions, events, requests]);

  const tabs = useMemo(() => ({
    priority: (coming ?? []).filter((c) => c.attention),
    month: (coming ?? []).filter((c) => monthOf(c.date)).sort((a, b) => a.daysAway - b.daysAway),
    next: (coming ?? []).filter((c) => monthOf(c.date, 1)).sort((a, b) => a.daysAway - b.daysAway)
  }), [coming]);
  const activeTab: Tab = tab ?? (tabs.priority.length ? "priority" : "month");
  const shown = tabs[activeTab].slice(0, 4);

  const isClient = role === "CLIENT";
  const pending = useMemo(() => {
    const waiting = (requests ?? []).filter((r) => (isClient ? r.status === "PROPOSAL_READY" : r.status === "SUBMITTED" || r.status === "IN_REVIEW"));
    const items = waiting.slice(0, 3).map((r) => ({ key: r.id, title: isClient ? "Gift proposal awaiting approval" : "Request awaiting review", hint: r.title, at: r.updatedAt, href: `/requests/${r.id}`, icon: Gift, tint: "bg-amber-50 text-amber-600" }));
    const unplanned = (coming ?? []).filter((c) => c.stage === "NOT_PLANNED" && monthOf(c.date)).length;
    if (isClient && unplanned) items.push({ key: "unplanned", title: `${unplanned} ${unplanned === 1 ? "occasion needs" : "occasions need"} planning`, hint: "This month", at: "", href: "/occasions", icon: Info, tint: "bg-blue-50 text-blue-600" });
    return { items, total: waiting.length + (isClient && unplanned ? 1 : 0) };
  }, [requests, coming, isClient]);

  const recent = useMemo<Feed[]>(() => {
    const fromRequests = (requests ?? []).map((r): Feed => ({ key: `r-${r.id}`, title: `Gift request ${STATUS_META[r.status]?.label.toLowerCase() ?? r.status.toLowerCase()}`, hint: r.title, at: r.updatedAt, href: `/requests/${r.id}`, icon: Gift, tint: "bg-rose-50 text-rose-500" }));
    const fromStaff = activity.map((a): Feed => ({ key: `a-${a.id}`, title: a.title ?? "Updated by TOFAA", hint: a.description ?? a.summary, at: a.changedAt, href: "/activity", icon: Activity, tint: "bg-emerald-50 text-emerald-600" }));
    return [...fromRequests, ...fromStaff].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 4);
  }, [requests, activity]);

  const giftsThisMonth = (requests ?? []).filter((r) => r.status !== "DRAFT" && r.status !== "CANCELLED" && monthOf(r.createdAt)).length;
  const important = useMemo(() => (coming ?? []).filter((c) => c.stage !== "IN_PROGRESS").slice(0, 5), [coming]);
  const current = important[slide % Math.max(important.length, 1)];
  useEffect(() => {
    if (important.length < 2) return;
    const timer = window.setInterval(() => setSlide((value) => (value + 1) % important.length), 6000);
    return () => window.clearInterval(timer);
  }, [important.length]);

  const stats = statKeys.map((key) => {
    const data = modules[key]?.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const count = data?.pagination?.total ?? data?.total ?? data?.items?.length ?? (Array.isArray(data) ? data.length : undefined);
    return { key, ...statMeta[key], count, error: modules[key]?.error, loading: modules[key]?.status === "loading" };
  });
  const firstName = displayName(user).split(" ")[0];

  return <div className="space-y-6">
    <h2 className="text-2xl font-medium text-ink sm:text-[1.75rem]">{greeting()}{firstName ? `, ${firstName}` : ""}! <span aria-hidden>👋</span></h2>

    {!(isClient && (
        !tenantId ||
        showGuide ||
        recipientCount === null ||
        (recipientCount === 0 && requests !== null && !requests.length)
      )) && <section aria-label="Welcome" className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#FBEFDD] via-[#F4DDB8] to-[#E3B866] p-7 shadow-soft sm:p-10">
      <Gift aria-hidden strokeWidth={1.1} className="absolute -bottom-6 right-6 hidden h-56 w-56 -rotate-6 text-amber-700/25 sm:block md:right-16 md:h-64 md:w-64" />
      <Sparkles aria-hidden className="absolute right-10 top-8 hidden text-amber-600/50 sm:block" size={28} />
      <div className="relative max-w-xl">
        <h1 className="text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">Build stronger relationships, one thoughtful gift at a time.</h1>
        <p className="mt-3 text-base text-ink/80">Stay ahead of important occasions and keep your gifting plans on track.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {heroActions[role].map((action, index) => {
            const Icon = action.icon;
            return <Link key={action.href} href={action.href} className={`press inline-flex min-h-11 items-center gap-2 rounded-2xl px-5 text-[0.9375rem] font-semibold transition ${index === 0 ? "bg-brand text-white hover:bg-brand-dark" : "bg-white/60 text-ink hover:bg-white/90"}`}>
              <Icon size={18} /> {action.title}{index === 0 && <ArrowRight size={16} />}
            </Link>;
          })}
        </div>
      </div>
    </section>}

    {isClient && tenantId && (showGuide || (recipientCount !== null && requests !== null && recipientCount === 0 && !requests.length)) && <OnboardingGuide onDismiss={dismissGuide} />}

    {stats.some((item) => item.error) && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">Some numbers couldn&apos;t be loaded. Please check your connection and refresh the page.</div>}
    {stats.length > 0 && <section aria-label="At a glance" className={`grid grid-cols-2 gap-4 ${stats.length > 3 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      {stats.map((item) => {
        const Icon = item.icon;
        return <Link key={item.key} href={`/${item.key}`} className="press block"><Card className="h-full p-5 transition hover:shadow-float sm:p-6">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${item.tint}`}><Icon size={20} /></span>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-ink">{item.loading ? <span className="inline-block h-8 w-12 animate-pulse rounded-lg bg-slate-100" /> : item.count ?? "–"}</p>
          <p className="mt-0.5 text-sm text-muted">{item.label}</p>
        </Card></Link>;
      })}
    </section>}

    {!tenantId ? (!isClient && <p role="status" className="rounded-2xl bg-white px-6 py-8 text-center text-muted shadow-sm ring-1 ring-black/5">Choose a client from the “Viewing” menu at the top to see their upcoming occasions and latest requests.</p>)
      : <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card aria-label="Upcoming in the next 30 days" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
              <h2 className="flex items-center gap-3 text-lg font-semibold text-ink"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><CalendarDays size={20} /></span>Upcoming – Next 30 Days</h2>
              <Link href="/occasions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">View all occasions <ArrowRight size={15} /></Link>
            </div>
            <div role="tablist" aria-label="Upcoming filter" className="flex flex-wrap gap-2 px-5 pt-4 sm:px-6">
              {([["priority", "Priority", Star], ["month", "This Month", null], ["next", "Next Month", null]] as const).map(([id, label, Icon]) => <button key={id} role="tab" type="button" aria-selected={activeTab === id} onClick={() => setTab(id)} className={`press inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition ${activeTab === id ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {Icon && <Icon size={14} className="fill-amber-500 text-amber-500" />}{label} ({tabs[id].length})
              </button>)}
            </div>
            <div className="mt-4">
              {coming === null ? <Skeleton rows={4} />
                : !shown.length ? <p className="px-6 py-12 text-center text-sm text-muted">{activeTab === "priority" ? "You're all caught up. Nothing needs your attention right now." : "Nothing coming up here. Add birthdays and events to your people and they'll show here."}</p>
                : <ul className="divide-y divide-line/70">{shown.map((item) => {
                  const meta = stageMeta[item.stage];
                  const Kind = kindIcon[item.kind];
                  const KindIcon = Kind.icon;
                  const href = item.stage === "NOT_PLANNED" || !item.requestId ? item.planHref : `/requests/${item.requestId}`;
                  return <li key={item.key} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:px-6">
                    <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-amber-50 text-amber-900"><span className="text-lg font-semibold leading-none">{new Date(`${item.date.slice(0, 10)}T00:00:00`).getDate()}</span><span className="text-[0.6875rem] uppercase leading-tight">{new Date(`${item.date.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { month: "short" })}</span></div>
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${item.kind === "occasion" ? Kind.tint : "bg-brand-soft text-brand"}`}>{item.kind === "occasion" ? <KindIcon size={20} /> : initials(item.title)}</span>
                    <div className="min-w-0 flex-1 basis-40"><p className="truncate font-semibold capitalize text-ink">{item.title}</p><p className="truncate text-sm text-muted">{item.subtitle}</p></div>
                    <div className="flex min-w-[9.5rem] flex-col items-start gap-1">
                      <span className="flex flex-wrap gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${item.priority === "High Priority" ? "bg-rose-50 text-rose-600" : item.priority === "High" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}><Star size={11} className="fill-current" />{item.priority}</span>
                      </span>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>{meta.label}</span>
                      <span className="text-xs text-muted">{item.stage === "NOT_PLANNED" ? `${meta.note} · ${countdown(item.daysAway)}` : meta.note}</span>
                    </div>
                    <Link href={href} className="press inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50">{meta.cta} <ArrowRight size={14} /></Link>
                  </li>;
                })}</ul>}
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card aria-label="Your gifting overview" className="p-5 sm:p-6">
              <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink"><BarChart3 size={20} className="text-brand" />Your Gifting Overview</h2>
              <div className="mt-5 grid grid-cols-2 divide-x divide-line/70">
                <div className="pr-4"><p className="text-3xl font-semibold tabular-nums text-ink">{available === null ? <span className="inline-block h-8 w-20 animate-pulse rounded-lg bg-slate-100" /> : num(available)}</p><p className="mt-1 text-sm text-muted">Available Credits</p></div>
                <div className="pl-5"><p className="text-3xl font-semibold tabular-nums text-ink">{requests === null ? <span className="inline-block h-8 w-12 animate-pulse rounded-lg bg-slate-100" /> : giftsThisMonth}</p><p className="mt-1 text-sm text-muted">This Month&apos;s Gifts</p></div>
              </div>
              <Link href="/credits" className="press mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50">View Details <ArrowRight size={14} /></Link>
            </Card>

            <Card aria-label="Important occasions" className="p-5 sm:p-6">
              <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink"><Star size={20} className="fill-amber-400 text-amber-400" />Important Occasions</h2>
              {coming === null ? <div className="mt-4 h-16 animate-pulse rounded-2xl bg-slate-100" />
                : !current ? <p className="mt-4 rounded-2xl bg-amber-50/60 px-4 py-5 text-sm text-muted">Nothing needs planning right now.</p>
                : <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50/70 px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">{(() => { const Icon = kindIcon[current.kind].icon; return <Icon size={20} />; })()}</span>
                  <div className="min-w-0 flex-1 basis-32"><p className="truncate font-semibold text-ink"><span className="capitalize">{current.title}</span>{current.kind === "birthday" ? "'s Birthday" : current.kind === "event" ? ` · ${current.subtitle}` : ""}</p><p className="text-sm text-muted">{countdown(current.daysAway)} • {shortDay(current.date)}</p></div>
                  <Link href={current.stage === "NOT_PLANNED" || !current.requestId ? current.planHref : `/requests/${current.requestId}`} className="press inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 text-sm font-semibold text-amber-800 hover:bg-amber-50">Plan Now <ArrowRight size={14} /></Link>
                </div>}
              {important.length > 1 && <div className="mt-4 flex justify-center gap-2" role="tablist" aria-label="Important occasions">{important.map((item, index) => <button key={item.key} type="button" role="tab" aria-selected={index === slide % important.length} aria-label={`Show ${item.title}`} onClick={() => setSlide(index)} className={`h-2 rounded-full transition-all ${index === slide % important.length ? "w-5 bg-amber-400" : "w-2 bg-slate-200 hover:bg-slate-300"}`} />)}</div>}
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          {(requests === null || pending.items.length > 0 || !isClient) && <Card aria-label="Pending actions" className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
              <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink"><CheckCircle2 size={22} className="fill-brand text-white" />Pending Actions</h2>
              <span className="flex items-center gap-2"><Link href="/requests" className="text-sm font-semibold text-brand hover:underline">View all</Link>{pending.total > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-semibold text-white">{pending.total}</span>}</span>
            </div>
            <div className="mt-3">
              {requests === null ? <Skeleton rows={2} /> : !pending.items.length ? <p className="px-6 pb-8 pt-4 text-center text-sm text-muted">Nothing is waiting on you.</p>
                : <ul className="divide-y divide-line/70 border-t border-line/70">{pending.items.map((item) => { const Icon = item.icon; return <li key={item.key}><Link href={item.href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50/70 sm:px-6">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.tint}`}><Icon size={20} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-ink">{item.title}</span><span className="block truncate text-sm text-muted">{item.hint}</span></span>
                  {item.at && <span className="shrink-0 text-xs text-muted">{relativeTime(item.at)}</span>}<ChevronRight size={16} className="shrink-0 text-slate-400" />
                </Link></li>; })}</ul>}
            </div>
          </Card>}

          {(requests === null || recent.length > 0 || !isClient) && <Card aria-label="Recent activity" className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
              <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink"><Activity size={20} className="text-brand" />Recent Activity</h2>
              <Link href="/activity" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">View all <ArrowRight size={15} /></Link>
            </div>
            <div className="mt-3">
              {requests === null ? <Skeleton rows={3} /> : !recent.length ? <p className="px-6 pb-8 pt-4 text-center text-sm text-muted">No activity yet.</p>
                : <ul className="divide-y divide-line/70 border-t border-line/70">{recent.map((item) => { const Icon = item.icon; return <li key={item.key}><Link href={item.href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50/70 sm:px-6">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.tint}`}><Icon size={20} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-ink">{item.title}</span><span className="block truncate text-sm text-muted">{item.hint}</span></span>
                  <span className="shrink-0 text-xs text-muted">{relativeTime(item.at)}</span><ChevronRight size={16} className="shrink-0 text-slate-400" />
                </Link></li>; })}</ul>}
            </div>
          </Card>}
        </div>
      </div>}
  </div>;
}
