import Link from "next/link";
import { ChevronRight, FileText, Info, Zap } from "lucide-react";
import type { ActionItem } from "@/features/dashboard/dashboard.service";

const hrefFor = (item: ActionItem) => item.kind === "PROPOSAL_REVIEW" && item.requestId ? `/requests/${item.requestId}` : item.recipientId ? `/recipients?open=${item.recipientId}` : "/requests";

/** What needs the user's attention, as rows that open the right screen. */
export function ActionRequiredCard({ items, total, loading }: { items: ActionItem[]; total: number; loading: boolean }) {
  return <section aria-label="Action required" className="overflow-hidden rounded-xl border border-line bg-white">
    <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-rose-50 to-rose-50/30 px-4 py-2">
      <h2 className="flex items-center gap-3 text-sm font-semibold text-ink"><span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-rose-500 shadow-sm"><Zap size={18} /></span>Action Required</h2>
      {total > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-700">{total} {total === 1 ? "item" : "items"}</span>}
    </header>
    {loading ? <div className="space-y-3 p-4">{[0, 1].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
      : !items.length ? <p className="px-4 py-8 text-center text-xs text-muted">You&apos;re all caught up. Nothing needs your attention.</p>
      : <ul className="divide-y divide-line/70">{items.slice(0, 2).map((item) => {
        const proposal = item.kind === "PROPOSAL_REVIEW";
        return <li key={item.key}><Link href={hrefFor(item)} className="flex items-center gap-3 px-4 py-1.5 hover:bg-[#F5F8F7]">
          <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${proposal ? "bg-orange-50 text-orange-500" : "bg-sky-50 text-sky-600"}`}>{proposal ? <FileText size={18} /> : <Info size={18} />}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{item.title}</p><p className="truncate text-xs text-muted">{item.description}</p></div>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Link></li>;
      })}</ul>}
  </section>;
}
