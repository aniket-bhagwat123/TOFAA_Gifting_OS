"use client";

import { useEffect } from "react";
import { ArrowUpRight, Users, Gift, ClipboardList, Wallet, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadModule } from "@/features/modules/modules.slice";
import { moduleConfig } from "@/features/modules/module-config";

const moduleForRole = {
  CLIENT: ["recipients", "requests", "gifts", "credits"],
  TOFAA_TEAM: ["requests", "gifts", "events"],
  SUPER_ADMIN: ["clients", "requests", "gifts", "credits"]
} as const;

export default function DashboardPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const modules = useAppSelector((state) => state.modules.byKey);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const role = user?.platformRole ?? "CLIENT";
  const keys = moduleForRole[role];

  useEffect(() => {
    if (!user) return;
    for (const key of keys) {
      try {
        const config = moduleConfig[key];
        void dispatch(loadModule({ key, endpoint: config.endpoint(user, selectedTenantId), params: { page: 1, limit: 5 } }));
      } catch { /* tenant scoped dashboard cards are omitted when no tenant is assigned */ }
    }
  }, [dispatch, user, role, selectedTenantId]);

  const metrics = keys.map((key) => {
    const data = modules[key]?.data as any;
    const label = moduleConfig[key].title;
    const value = data?.pagination?.total ?? data?.total ?? data?.items?.length ?? (Array.isArray(data) ? data.length : data ? "Available" : "—");
    const icon = key === "recipients" ? Users : key === "gifts" ? Gift : key === "credits" ? Wallet : key === "clients" ? Building2 : ClipboardList;
    return { label, value, icon, error: modules[key]?.error, loading: modules[key]?.status === "loading" };
  });

  return <>
    <PageHeader title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`} description="Your workspace overview is loaded from the available TOFAA API modules." action={<Button variant="secondary" onClick={() => window.location.reload()}>Refresh data <ArrowUpRight size={15} /></Button>} />
    {metrics.some((item) => item.error) && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Some dashboard data could not be loaded. Open a module for details and retry.</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((item) => { const Icon = item.icon; return <Card key={item.label} className="p-5"><div className="rounded-xl bg-brand/10 p-2.5 text-brand w-fit"><Icon size={19} /></div><p className="mt-5 text-sm text-muted">{item.label}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{item.loading ? "…" : item.value}</p><p className="mt-1 text-xs text-muted">Loaded from the {item.label.toLowerCase()} API</p></Card>; })}</div>
    <Card className="mt-6 p-6"><h2 className="font-semibold text-ink">Quick access</h2><p className="mt-1 text-xs text-muted">Open a module to review its API data.</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{keys.map((key) => <a key={key} href={`/${key}`} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm font-medium text-ink transition hover:border-brand/30 hover:bg-brand/5">{moduleConfig[key].title}<ArrowUpRight size={16} className="text-muted" /></a>)}</div></Card>
  </>;
}
