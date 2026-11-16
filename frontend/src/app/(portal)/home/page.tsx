"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Building2, CalendarRange, ClipboardList, Gift, Plus, Star, Users, Wallet, type LucideIcon } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadModule } from "@/features/modules/modules.slice";
import { moduleConfig } from "@/features/modules/module-config";
import { getModuleRecords } from "@/features/modules/module.service";
import { dashboardService } from "@/features/dashboard/dashboard.service";
import { displayName } from "@/lib/utils";
import { type GiftRequest, STATUS_META, useTenantId } from "@/components/gift-requests/shared";
import { Card } from "@/components/ui/card";
import { ActionRequiredCard } from "@/components/dashboard/action-required-card";
import { ImportantPeopleCard } from "@/components/dashboard/important-people-card";
import { InsightBanner } from "@/components/dashboard/insight-banner";
import { OccasionCalendar } from "@/components/dashboard/occasion-calendar";
import { QuickNoteCard } from "@/components/dashboard/quick-note-card";
import { type ActivityRow, RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { useAsync } from "@/components/dashboard/use-async";

type Role = "CLIENT" | "TOFAA_TEAM" | "SUPER_ADMIN";
type StaffAction = { title: string; href: string };

// Which numbers staff see on top. Each key is a module, so the numbers follow that module's own API and permissions.
const statsForRole: Record<Role, string[]> = { CLIENT: [], TOFAA_TEAM: ["requests", "gifts", "events"], SUPER_ADMIN: ["clients", "requests", "gifts", "credits"] };
const statMeta: Record<string, { label: string; icon: LucideIcon; tint: string }> = {
  requests: { label: "Gift requests", icon: ClipboardList, tint: "bg-rose-500" },
  gifts: { label: "Gifts", icon: Gift, tint: "bg-violet-500" },
  credits: { label: "Credit requests", icon: Wallet, tint: "bg-emerald-500" },
  clients: { label: "Clients", icon: Building2, tint: "bg-indigo-500" },
  events: { label: "Events", icon: CalendarRange, tint: "bg-amber-500" }
};
const staffActions: Record<Exclude<Role, "CLIENT">, StaffAction[]> = {
  TOFAA_TEAM: [{ title: "Review Requests", href: "/requests" }, { title: "View Events", href: "/events" }],
  SUPER_ADMIN: [{ title: "Review Requests", href: "/requests" }, { title: "Add a Client", href: "/clients?new=1" }]
};
const clientActions = [{ title: "New Gift Request", href: "/requests?new=1", primary: true }, { title: "Add Recipient", href: "/recipients?new=1" }, { title: "Add Occasion", href: "/occasions?new=1" }];

const greeting = () => { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; };
const actionClass = (primary: boolean) => `press inline-flex min-h-10 items-center gap-2 rounded-lg border px-5 text-sm font-semibold transition ${primary ? "border-brand bg-brand text-white hover:bg-brand-dark" : "border-brand/60 bg-white text-brand hover:bg-brand-soft/50"}`;

type ActivityRecord = { id: string; title?: string; description?: string; summary: string; changedAt: string };

export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const modules = useAppSelector((state) => state.modules.byKey);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const { tenantId } = useTenantId();
  const role = (user?.platformRole ?? "CLIENT") as Role;
  const isClient = role === "CLIENT";
  const statKeys = statsForRole[role];

  useEffect(() => {
    if (!user) return;
    for (const key of statKeys) {
      try { void dispatch(loadModule({ key, endpoint: moduleConfig[key].endpoint(user, selectedTenantId), params: { page: 1, limit: 5 } })); }
      catch { /* tenant scoped cards are left out when no client is chosen */ }
    }
  }, [dispatch, user, role, selectedTenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useAsync(tenantId ? () => dashboardService.summary(tenantId) : null, `summary|${tenantId}`);
  // Recent activity: the client's latest requests and change log.
  const recent = useAsync(tenantId ? async () => {
    const base = `/tenants/${tenantId}`;
    const [requests, activity] = await Promise.all([
      getModuleRecords(`${base}/gift-requests`, { page: 1, limit: 20 }).catch(() => ({ items: [] })) as Promise<{ items?: GiftRequest[] }>,
      getModuleRecords(`${base}/activity`, { page: 1, limit: 5 }).catch(() => ({ items: [] })) as Promise<{ items?: ActivityRecord[] }>,
    ]);
    const rows: Array<ActivityRow & { time: number }> = [
      ...(requests.items ?? []).filter((r) => r.status !== "DRAFT").map((r): ActivityRow & { time: number } => ({ key: `r-${r.id}`, title: `Gift ${STATUS_META[r.status]?.label.toLowerCase() ?? r.status.toLowerCase()} – ${r.title}`, at: r.updatedAt, kind: r.status === "DELIVERED" ? "done" : r.status === "DISPATCHED" ? "shipping" : "update", time: new Date(r.updatedAt).getTime() })),
      ...(activity.items ?? []).map((a): ActivityRow & { time: number } => ({ key: `a-${a.id}`, title: a.title ?? a.description ?? a.summary, at: a.changedAt, kind: "update", time: new Date(a.changedAt).getTime() })),
    ].sort((a, b) => b.time - a.time).slice(0, 4);
    return { rows };
  } : null, `recent|${tenantId}`);

  const stats = statKeys.map((key) => {
    const data = modules[key]?.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const count = data?.pagination?.total ?? data?.total ?? data?.items?.length ?? (Array.isArray(data) ? data.length : undefined);
    return { key, ...statMeta[key], count, loading: modules[key]?.status === "loading" };
  });
  const firstName = displayName(user).split(" ")[0];
  const actions = isClient ? clientActions : staffActions[role].map((a, i) => ({ ...a, primary: i === 0 }));

  return <div className="space-y-4">
    <InsightBanner />

    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-ink sm:text-2xl">{greeting()}{firstName ? `, ${firstName}` : ""}! <span aria-hidden>👋</span></h2>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => <Link key={action.href} href={action.href} className={actionClass(!!action.primary)}><Plus size={16} />{action.title}</Link>)}
      </div>
    </div>

    {stats.length > 0 && <section aria-label="Overview" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((item) => {
        const Icon = item.icon;
        return <Link key={item.key} href={`/${item.key}`} className="press block"><Card className="h-full p-4 transition hover:shadow-float">
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-white ${item.tint}`}><Icon size={18} /></span>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{item.loading ? <span className="inline-block h-7 w-12 animate-pulse rounded-lg bg-slate-100" /> : item.count ?? "–"}</p>
          <p className="mt-0.5 text-xs text-muted">{item.label}</p>
        </Card></Link>;
      })}
    </section>}

    {!tenantId ? (!isClient && <p role="status" className="rounded-xl bg-white px-6 py-8 text-center text-sm text-muted ring-1 ring-black/5">Choose a client from the “Viewing” menu at the top to see their dashboard.</p>)
      : <>
        <OccasionCalendar tenantId={tenantId} />
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <ImportantPeopleCard title="Important External People" subtitle="Clients & Business Associates" icon={<Star size={18} className="fill-amber-400" />} people={summary.data?.importantExternal ?? []} loading={summary.loading} empty="Add clients or partners to see their dates here." />
          <ImportantPeopleCard title="Important Internal People" subtitle="Leadership & Key Employees" icon={<Users size={18} className="text-brand" />} people={summary.data?.importantInternal ?? []} loading={summary.loading} empty="Add employees to see their dates here." />
          <ActionRequiredCard items={summary.data?.actionRequired.items ?? []} total={summary.data?.actionRequired.total ?? 0} loading={summary.loading} />
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <RecentActivityCard rows={recent.data?.rows ?? []} loading={recent.loading} />
          <QuickNoteCard />
        </div>
      </>}
  </div>;
}
