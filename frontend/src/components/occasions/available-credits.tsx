"use client";

import { Database, Wallet } from "lucide-react";
import { num, useTenantId } from "@/components/gift-requests/shared";
import { useBudgetInfo } from "./shared";

/** The credits this client can still use. Nothing is shown until a client is known. */
export function useAvailableCredits() {
  const { tenantId } = useTenantId();
  const { available } = useBudgetInfo(tenantId);
  return { tenantId, available };
}

/** A slim bar for the bottom of a page. With `budgeted`, it also shows how much of the available credits is already budgeted. */
export function AvailableCreditsBar({ budgeted }: { budgeted?: number }) {
  const { tenantId, available } = useAvailableCredits();
  if (!tenantId) return null;
  const showBar = budgeted !== undefined && available !== null;
  const pct = showBar && available > 0 ? Math.min(100, (budgeted / available) * 100) : budgeted ? 100 : 0;
  const over = showBar && budgeted > available;
  return <div className="mt-6 space-y-3 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-black/5" role="status">
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-3 text-sm font-medium text-ink"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white"><Wallet size={18} /></span>Available credits</span>
      <span className="text-lg font-semibold tabular-nums text-ink">{available === null ? <span className="inline-block h-6 w-16 animate-pulse rounded bg-slate-100" /> : num(available)}</span>
    </div>
    {showBar && <div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Credits budgeted across groups" aria-valuemin={0} aria-valuemax={available} aria-valuenow={Math.min(budgeted, available)}>
        <div className={`h-full rounded-full transition-all ${over ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-2 text-sm ${over ? "font-medium text-rose-600" : "text-muted"}`}>{num(budgeted)} of {num(available)} credits budgeted across groups{over ? ` · over by ${num(budgeted - available)}` : available - budgeted >= 0 ? ` · ${num(available - budgeted)} left` : ""}</p>
    </div>}
  </div>;
}

/** The footer of a card: available credits, with a bar showing how much of it is already budgeted. */
export function AvailableCreditsStrip({ budgeted }: { budgeted: number }) {
  const { tenantId, available } = useAvailableCredits();
  if (!tenantId) return null;
  const over = available !== null && budgeted > available;
  const pct = available ? Math.min(100, (budgeted / available) * 100) : budgeted ? 100 : 0;
  return <div className="flex items-center gap-4 border-t border-line bg-slate-50/80 px-4 py-4 sm:px-6" role="status">
    <Database size={20} className="shrink-0 text-slate-500" aria-hidden />
    <span className="shrink-0 text-sm font-medium text-slate-600 sm:text-base">Available credits</span>
    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Credits budgeted across groups" aria-valuemin={0} aria-valuemax={available ?? 0} aria-valuenow={Math.min(budgeted, available ?? 0)} title={available === null ? undefined : `${num(budgeted)} of ${num(available)} credits budgeted${over ? ` · over by ${num(budgeted - available)}` : ""}`}>
      <div className={`h-full rounded-full transition-all ${over ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${pct}%` }} />
    </div>
    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink sm:text-base">{available === null ? <span className="inline-block h-5 w-16 animate-pulse rounded bg-slate-200" /> : `${num(available)} credits`}</span>
  </div>;
}
