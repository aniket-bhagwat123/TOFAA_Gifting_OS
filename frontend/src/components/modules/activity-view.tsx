"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Building2, CalendarDays, Filter, Gift, Search, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { getApiErrorMessage } from "@/services/api-client";
import { FilterMenu } from "@/components/ui/filter-menu";
import { SearchInput } from "@/components/ui/search-input";
import { Spinner } from "@/components/ui/spinner";
import { control } from "@/components/ui/table-styles";
import { cn } from "@/lib/utils";

type Entry = { id: string; title: string; description: string; category: string; actorName: string; actorKind: "TOFAA" | "USER"; changedAt: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** One icon and soft tint per kind of change, using the app's existing status colours. */
const CATEGORIES: Record<string, { label: string; Icon: LucideIcon; tint: string }> = {
  requests: { label: "Gift requests", Icon: Gift, tint: "bg-rose-50 text-rose-600" },
  budget: { label: "Budget", Icon: Wallet, tint: "bg-emerald-50 text-emerald-700" },
  people: { label: "Recipients & groups", Icon: Users, tint: "bg-sky-50 text-sky-700" },
  occasions: { label: "Occasions & events", Icon: CalendarDays, tint: "bg-amber-50 text-amber-700" },
  account: { label: "Account & team", Icon: Building2, tint: "bg-indigo-50 text-indigo-700" },
};
const FILTER_OPTIONS = [{ value: "", label: "All activity" }, ...Object.entries(CATEGORIES).map(([value, { label }]) => ({ value, label }))];
const categoryOf = (key: string) => CATEGORIES[key] ?? { label: "Other", Icon: Activity, tint: "bg-slate-100 text-slate-600" };

const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const dayTitle = (iso: string) => {
  const d = new Date(iso); const now = new Date(); const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dayKey(iso) === dayKey(now.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

/** What happened in the account, who did it and when, grouped by day. */
export function ActivityView() {
  const user = useAppSelector((state) => state.auth.user);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

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
    const shown = (entries ?? []).filter((entry) => (!category || entry.category === category) && (!q || `${entry.title} ${entry.description} ${entry.actorName}`.toLowerCase().includes(q)));
    const byDay = new Map<string, { title: string; items: Entry[] }>();
    for (const entry of shown) {
      const key = dayKey(entry.changedAt);
      if (!byDay.has(key)) byDay.set(key, { title: dayTitle(entry.changedAt), items: [] });
      byDay.get(key)!.items.push(entry);
    }
    return [...byDay.values()];
  }, [entries, search, category]);

  const filtered = !!search.trim() || !!category;

  return <div className="flex w-full flex-col gap-4 lg:h-[calc(100dvh-8.5rem)]">
    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
      <div className="relative min-w-[14rem] flex-1 sm:max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity…" aria-label="Search activity" className={cn(control, "w-full pl-9")} />
      </div>
      <FilterMenu icon={<Filter size={16} />} label="Filter" value={category} options={FILTER_OPTIONS} onChange={setCategory} />
    </div>

    {error && <p role="alert" className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    <div className="scroll-clean min-h-0 flex-1 space-y-6 overflow-y-auto pb-2">
      {entries === null ? <div className="flex justify-center py-16"><Spinner /></div>
        : !groups.length ? <div className="rounded-2xl bg-white px-6 py-14 text-center ring-1 ring-line/70">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Activity size={22} /></span>
          <p className="mt-3 font-semibold text-ink">{filtered ? "No activity matches" : "Nothing yet"}</p>
          <p className="mt-1 text-sm text-muted">{filtered ? "Try a different word or filter." : "When something changes in your account, it shows up here."}</p>
        </div>
        : groups.map((group) => <section key={group.title} aria-label={group.title}>
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</h3>
          <ul className="space-y-3">
            {group.items.map((entry) => {
              const { Icon, tint, label } = categoryOf(entry.category);
              return <li key={entry.id} className="flex items-start gap-4 rounded-2xl border border-line/70 bg-white px-4 py-3.5">
                <span aria-hidden className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tint)}><Icon size={20} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-semibold text-ink">{entry.title}</p>
                  {entry.description && <p className="mt-0.5 text-sm text-slate-600">{entry.description}</p>}
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    <span>By <span className={cn("font-medium", entry.actorKind === "TOFAA" ? "text-brand" : "text-slate-700")}>{entry.actorName}</span></span>
                    <span aria-hidden>·</span>
                    <time dateTime={entry.changedAt} className="tabular-nums">{timeOf(entry.changedAt)}</time>
                    <span aria-hidden>·</span>
                    <span>{label}</span>
                  </p>
                </div>
              </li>;
            })}
          </ul>
        </section>)}
    </div>
  </div>;
}
