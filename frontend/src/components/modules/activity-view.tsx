"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Building2, CalendarDays, Gift, Search, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { getApiErrorMessage } from "@/services/api-client";
import { Spinner } from "@/components/ui/spinner";

type Entry = { id: string; summary: string; changedAt: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ICONS: Array<[RegExp, LucideIcon, string]> = [
  [/gift/, Gift, "bg-rose-500"], [/credit|balance|wallet/, Wallet, "bg-emerald-500"], [/tenant|client/, Building2, "bg-indigo-500"],
  [/recipient|group|user/, Users, "bg-sky-500"], [/occasion|event/, CalendarDays, "bg-amber-500"],
];

/** "TOFAA made a change in gift requests" → what changed, so each row can say it as a headline. */
const subjectOf = (summary: string) => summary.replace(/^TOFAA made a change in\s*/i, "").trim() || "your account";
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const iconFor = (subject: string) => { const hit = ICONS.find(([pattern]) => pattern.test(subject.toLowerCase())); return hit ? { Icon: hit[1], tint: hit[2] } : { Icon: Activity, tint: "bg-slate-500" }; };

const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const dayTitle = (iso: string) => {
  const d = new Date(iso); const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dayKey(iso) === dayKey(now.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

/** Changes TOFAA made for you, grouped by day in a clean, inset-list style. */
export function ActivityView() {
  const user = useAppSelector((state) => state.auth.user);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setEntries(null); setError(null);
    if (!user) return;
    let endpoint: string;
    try { endpoint = moduleConfig.activity.endpoint(user, selectedTenantId); }
    catch (err) { setError(err instanceof Error ? err.message : "This account isn't linked to an organisation yet."); setEntries([]); return; }
    let cancelled = false;
    loadAllModuleRecords(endpoint)
      .then((rows) => { if (!cancelled) setEntries(rows as unknown as Entry[]); })
      .catch((err) => { if (!cancelled) { setError(getApiErrorMessage(err)); setEntries([]); } });
    return () => { cancelled = true; };
  }, [user, selectedTenantId]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const shown = (entries ?? []).filter((entry) => !q || entry.summary.toLowerCase().includes(q));
    const byDay = new Map<string, { title: string; items: Entry[] }>();
    for (const entry of shown) {
      const key = dayKey(entry.changedAt);
      if (!byDay.has(key)) byDay.set(key, { title: dayTitle(entry.changedAt), items: [] });
      byDay.get(key)!.items.push(entry);
    }
    return [...byDay.values()];
  }, [entries, search]);

  return <div className="flex w-full flex-col gap-4 lg:h-[calc(100dvh-8.5rem)]">

    <div className="relative shrink-0">
      <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity" aria-label="Search activity" className="min-h-11 w-full rounded-xl border border-transparent bg-slate-200/60 pl-10 pr-3 text-[0.9375rem] outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
    </div>

    {error && <p role="alert" className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-2">
    {entries === null ? <div className="flex justify-center py-16"><Spinner /></div>
      : !groups.length ? <div className="rounded-2xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-black/5">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Activity size={22} /></span>
        <p className="mt-3 font-semibold text-ink">{search ? "No activity matches your search" : "Nothing yet"}</p>
        <p className="mt-1 text-sm text-muted">{search ? "Try a different word." : "When TOFAA makes a change for you, it shows up here."}</p>
      </div>
      : groups.map((group) => <section key={group.title} aria-label={group.title}>
        <h3 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</h3>
        <ul className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          {group.items.map((entry, index) => {
            const subject = subjectOf(entry.summary);
            const { Icon, tint } = iconFor(subject);
            return <li key={entry.id} className="flex items-center gap-4 px-4 py-3.5">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white ${tint}`}><Icon size={18} strokeWidth={2.2} /></span>
              <div className={`flex min-w-0 flex-1 items-center justify-between gap-3 ${index < group.items.length - 1 ? "border-b border-line/70 pb-3.5 -mb-3.5" : ""}`}>
                <div className="min-w-0">
                  <p className="truncate text-[0.9375rem] font-semibold text-ink">{sentence(subject)} updated</p>
                  <p className="truncate text-sm text-muted">TOFAA made a change</p>
                </div>
                <time dateTime={entry.changedAt} className="shrink-0 text-sm tabular-nums text-muted">{timeOf(entry.changedAt)}</time>
              </div>
            </li>;
          })}
        </ul>
      </section>)}
    </div>
  </div>;
}
