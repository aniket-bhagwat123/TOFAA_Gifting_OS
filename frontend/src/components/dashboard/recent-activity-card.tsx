import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, Truck } from "lucide-react";
import { dayTime } from "@/components/gift-requests/shared";

export type ActivityRow = { key: string; title: string; at: string; kind: "done" | "shipping" | "update" };

const icons = { done: <CheckCircle2 size={20} className="text-emerald-600" />, shipping: <Truck size={20} className="text-ink" />, update: <Activity size={20} className="text-brand" /> };

export function RecentActivityCard({ rows, loading }: { rows: ActivityRow[]; loading: boolean }) {
  return <section aria-label="Recent activity" className="overflow-hidden rounded-xl border border-line bg-white">
    <header className="flex items-center justify-between gap-3 px-4 py-2">
      <h2 className="flex items-center gap-2.5 text-sm font-semibold text-ink"><Activity size={18} className="text-brand" />Recent Activity</h2>
      <Link href="/activity" aria-label="View all" title="View all" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-brand hover:bg-slate-50"><ArrowRight size={16} /></Link>
    </header>
    {loading ? <div className="space-y-3 px-4 pb-4">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-100" />)}</div>
      : !rows.length ? <p className="px-4 pb-6 pt-2 text-center text-xs text-muted">When something changes, it shows up here.</p>
      : <ul className="px-4 pb-2">{rows.map((row) => <li key={row.key} className="flex items-center gap-4 py-1.5">
        <span aria-hidden className="flex w-6 shrink-0 justify-center">{icons[row.kind]}</span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{row.title}</p>
        <time dateTime={row.at} className="shrink-0 text-xs tabular-nums text-muted">{dayTime(row.at)}</time>
      </li>)}</ul>}
  </section>;
}
