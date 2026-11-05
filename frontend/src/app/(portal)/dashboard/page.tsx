"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Cake, CalendarDays, CalendarRange, ClipboardList, Gift, Send, Sparkles, UserPlus, Users, Wallet, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadModule } from "@/features/modules/modules.slice";
import { moduleConfig } from "@/features/modules/module-config";
import { getModuleRecords } from "@/features/modules/module.service";
import { type GiftRequest, StatusChip, relativeTime, shortDay, useTenantId } from "@/components/gift-requests/shared";
import { type UpcomingEvent, type UpcomingOccasion, countdown } from "@/components/occasions/shared";
import { useAvailableCredits } from "@/components/occasions/available-credits";
import { num } from "@/components/gift-requests/shared";

type Role = "CLIENT" | "TOFAA_TEAM" | "SUPER_ADMIN";
type Action = { title: string; hint: string; href: string; icon: LucideIcon };

// Which numbers each role sees. Each key is a module, so the numbers follow that module's own API and permissions.
const moduleForRole: Record<Role, string[]> = {
  CLIENT: ["recipients", "requests", "occasions"],
  TOFAA_TEAM: ["requests", "gifts", "events"],
  SUPER_ADMIN: ["clients", "requests", "gifts", "credits"]
};

const statMeta: Record<string, { label: string; icon: LucideIcon; tint: string }> = {
  recipients: { label: "Recipients", icon: Users, tint: "bg-sky-500" },
  requests: { label: "Gift requests", icon: ClipboardList, tint: "bg-rose-500" },
  gifts: { label: "Gifts", icon: Gift, tint: "bg-violet-500" },
  credits: { label: "Credit requests", icon: Wallet, tint: "bg-emerald-500" },
  clients: { label: "Clients", icon: Building2, tint: "bg-indigo-500" },
  events: { label: "Events", icon: CalendarRange, tint: "bg-amber-500" },
  occasions: { label: "Occasions", icon: CalendarDays, tint: "bg-orange-500" }
};

const banner: Record<Role, { headline: string; text: string; actions: Action[] }> = {
  CLIENT: {
    headline: "Make every moment feel special",
    text: "Send a thoughtful gift in a few taps. We handle the choosing, packing and delivery.",
    actions: [
      { title: "Send a gift", hint: "", href: "/requests/new", icon: Send },
      { title: "Add a recipient", hint: "", href: "/recipients?new=1", icon: UserPlus }
    ]
  },
  TOFAA_TEAM: {
    headline: "Your gifting queue",
    text: "See what needs a proposal, what is waiting on a client, and what ships next.",
    actions: [{ title: "Review requests", hint: "", href: "/requests", icon: ClipboardList }]
  },
  SUPER_ADMIN: {
    headline: "Everything across your clients",
    text: "Keep an eye on requests, credits and deliveries for every organisation.",
    actions: [
      { title: "Add a client", hint: "", href: "/clients?new=1", icon: Building2 },
      { title: "Review requests", hint: "", href: "/requests", icon: ClipboardList }
    ]
  }
};

type Coming = { key: string; kind: "occasion" | "birthday" | "event"; title: string; subtitle: string; date: string; daysAway: number };

const greeting = () => { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; };

export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const modules = useAppSelector((state) => state.modules.byKey);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const { tenantId } = useTenantId();
  const { available } = useAvailableCredits();
  const role = (user?.platformRole ?? "CLIENT") as Role;
  const keys = moduleForRole[role];

  const [coming, setComing] = useState<Coming[] | null>(null);
  const [recent, setRecent] = useState<GiftRequest[] | null>(null);

  useEffect(() => {
    if (!user) return;
    for (const key of keys) {
      try {
        const config = moduleConfig[key];
        void dispatch(loadModule({ key, endpoint: config.endpoint(user, selectedTenantId), params: { page: 1, limit: 5 } }));
      } catch { /* tenant scoped cards are left out when no client is chosen */ }
    }
  }, [dispatch, user, role, selectedTenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Upcoming occasions and events, and the latest requests, for the client being viewed.
  useEffect(() => {
    setComing(null); setRecent(null);
    if (!tenantId) return;
    let cancelled = false;
    const base = `/tenants/${tenantId}`;
    Promise.all([
      getModuleRecords(`${base}/occasions/upcoming`, { days: 60 }).catch(() => []),
      getModuleRecords(`${base}/gift-requests/upcoming`, { days: 60 }).catch(() => []),
      getModuleRecords(`${base}/gift-requests`, { page: 1, limit: 5 }).catch(() => ({ items: [] })),
    ]).then(([occasions, events, requests]) => {
      if (cancelled) return;
      const rows: Coming[] = [
        ...((occasions as UpcomingOccasion[]) ?? []).map((o): Coming => ({ key: `o-${o.id}`, kind: "occasion", title: o.occasionName, subtitle: "Occasion", date: o.occasionDate, daysAway: o.daysAway })),
        ...((events as UpcomingEvent[]) ?? []).map((e): Coming => ({ key: `e-${e.recipientId}-${e.date}-${e.title}`, kind: e.kind === "BIRTHDAY" ? "birthday" : "event", title: e.recipientName ?? "Someone", subtitle: e.title, date: e.date, daysAway: e.daysAway })),
      ].sort((a, b) => a.daysAway - b.daysAway);
      setComing(rows);
      setRecent(((requests as { items?: GiftRequest[] }).items ?? []));
    });
    return () => { cancelled = true; };
  }, [tenantId]);

  const stats = keys.map((key) => {
    const data = modules[key]?.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const count = data?.pagination?.total ?? data?.total ?? data?.items?.length ?? (Array.isArray(data) ? data.length : undefined);
    return { key, ...statMeta[key], count, error: modules[key]?.error, loading: modules[key]?.status === "loading" };
  });
  const firstName = user?.name?.split(" ")[0];
  const hero = banner[role];
  const upcomingShown = useMemo(() => (coming ?? []).slice(0, 6), [coming]);

  return <div className="space-y-8">
    <section aria-label="Welcome" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-emerald-900 p-7 text-white shadow-soft sm:p-10">
      <span aria-hidden className="absolute -right-10 -top-16 h-64 w-64 rounded-full bg-white/10" />
      <span aria-hidden className="absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-white/5" />
      {tenantId ? <Link href="/credits" className="press absolute right-6 top-6 hidden items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur transition hover:bg-white/25 sm:flex"><Wallet size={20} /><span><span className="block text-xs text-white/75">Available credits</span><span className="block text-xl font-semibold tabular-nums">{available === null ? "…" : num(available)}</span></span></Link> : <Sparkles aria-hidden size={28} className="absolute right-8 top-8 hidden text-white/60 sm:block" />}
      <div className="relative max-w-2xl">
        <p className="text-sm font-medium text-white/80">{greeting()}{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{hero.headline}</h1>
        <p className="mt-3 text-base text-white/85 sm:text-lg">{hero.text}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {hero.actions.map((action, index) => {
            const Icon = action.icon;
            return <Link key={action.href} href={action.href} className={`press inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-[0.9375rem] font-semibold transition ${index === 0 ? "bg-white text-brand hover:bg-white/90" : "bg-white/15 text-white hover:bg-white/25"}`}><Icon size={18} /> {action.title}</Link>;
          })}
        </div>
      </div>
    </section>

    {stats.some((item) => item.error) && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">Some numbers couldn&apos;t be loaded. Please check your connection and refresh the page.</div>}
    <section aria-label="At a glance" className={`grid grid-cols-2 gap-4 ${stats.length + (tenantId ? 1 : 0) > 4 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
      {stats.map((item) => {
        const Icon = item.icon;
        return <Link key={item.key} href={`/${item.key}`} className="press block">
          <Card className="h-full p-5 transition hover:shadow-float sm:p-6">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${item.tint}`}><Icon size={20} /></span>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-ink">{item.loading ? <span className="inline-block h-8 w-12 animate-pulse rounded-lg bg-slate-100" /> : item.count ?? "–"}</p>
            <p className="mt-0.5 text-sm text-muted">{item.label}</p>
          </Card>
        </Link>;
      })}
      {tenantId && <Link href="/credits" className="press block">
        <Card className="h-full p-5 transition hover:shadow-float sm:p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white"><Wallet size={20} /></span>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-ink">{available === null ? <span className="inline-block h-8 w-12 animate-pulse rounded-lg bg-slate-100" /> : num(available)}</p>
          <p className="mt-0.5 text-sm text-muted">Available credits</p>
        </Card>
      </Link>}
    </section>

    {!tenantId ? (role !== "CLIENT" && <p role="status" className="rounded-2xl bg-white px-6 py-8 text-center text-muted shadow-sm ring-1 ring-black/5">Choose a client from the “Viewing” menu at the top to see their upcoming occasions and latest requests.</p>)
      : <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-label="Coming up">
          <div className="mb-3 flex items-center justify-between px-1"><h2 className="text-lg font-semibold text-ink">Coming up</h2><Link href={role === "CLIENT" ? "/occasions" : "/events"} className="text-sm font-semibold text-brand hover:underline">See all</Link></div>
          <Card className="overflow-hidden">
            {coming === null ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}</div>
              : !upcomingShown.length ? <p className="px-6 py-12 text-center text-sm text-muted">Nothing in the next 60 days. Add birthdays and events to your recipients and they&apos;ll show here.</p>
              : <ul className="divide-y divide-line/70">{upcomingShown.map((item) => <li key={item.key} className="flex items-center gap-4 px-5 py-3.5">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${item.kind === "birthday" ? "bg-rose-500" : item.kind === "occasion" ? "bg-orange-500" : "bg-sky-500"}`}>{item.kind === "birthday" ? <Cake size={18} /> : <CalendarDays size={18} />}</span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold capitalize text-ink">{item.title}</p><p className="truncate text-sm text-muted">{item.subtitle} · {shortDay(item.date)}</p></div>
                <span className={`shrink-0 text-sm ${item.daysAway <= 7 ? "font-semibold text-amber-700" : "text-muted"}`}>{countdown(item.daysAway)}</span>
              </li>)}</ul>}
          </Card>
        </section>

        <section aria-label="Latest requests">
          <div className="mb-3 flex items-center justify-between px-1"><h2 className="text-lg font-semibold text-ink">Latest gift requests</h2><Link href="/requests" className="text-sm font-semibold text-brand hover:underline">See all</Link></div>
          <Card className="overflow-hidden">
            {recent === null ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />)}</div>
              : !recent.length ? <p className="px-6 py-12 text-center text-sm text-muted">No gift requests yet.</p>
              : <ul className="divide-y divide-line/70">{recent.map((request) => <li key={request.id}><Link href={`/requests/${request.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50/70">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{request.title}</p><p className="truncate text-sm capitalize text-muted">{request.recipientName ?? "—"} · {relativeTime(request.updatedAt)}</p></div>
                <StatusChip status={request.status} /><ArrowRight size={16} className="shrink-0 text-slate-300" />
              </Link></li>)}</ul>}
          </Card>
        </section>
      </div>}
  </div>;
}
