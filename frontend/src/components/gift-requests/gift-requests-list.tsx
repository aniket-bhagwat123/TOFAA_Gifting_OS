"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { getModuleRecords } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { UpcomingPanel } from "./upcoming-panel";
import { type GiftRequest, type GiftStatus, StatusChip, STATUS_META, day, inr, num, relativeTime, shortDay, useTenantId } from "./shared";

const PAGE_SIZE = 10;
type TabKey = "ALL" | "UPCOMING" | GiftStatus;
const CLIENT_TABS: Array<{ key: TabKey; label: string }> = [{ key: "UPCOMING", label: "Upcoming" }, { key: "APPROVED", label: "Approved" }];
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "ALL", label: "All" }, { key: "DRAFT", label: "Draft" }, { key: "SUBMITTED", label: "Submitted" }, { key: "IN_REVIEW", label: "In review" },
  { key: "NEEDS_INFO", label: "Needs info" }, { key: "PROPOSAL_READY", label: "Proposal ready" }, { key: "APPROVED", label: "Approved" }, { key: "REJECTED", label: "Rejected" },
];

export function GiftRequestsList() {
  const { tenantId, isClient } = useTenantId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tabState, setTab] = useState<TabKey>("ALL");
  const tab: TabKey = isClient && tabState !== "APPROVED" ? "UPCOMING" : tabState;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<GiftRequest[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (searchParams.get("new") === "1") router.replace("/requests/new"); }, [searchParams, router]);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);

  const load = useCallback(async () => {
    if (!tenantId || tab === "UPCOMING") return;
    try {
      const list = await getModuleRecords(`/tenants/${tenantId}/gift-requests`, { page, limit: PAGE_SIZE, status: tab === "ALL" ? undefined : (tab as GiftStatus), search: query || undefined });
      const data = list as { items: GiftRequest[]; pagination?: { totalRecords?: number; total_records?: number } };
      setItems(data.items ?? []);
      setTotal(Number(data.pagination?.totalRecords ?? data.pagination?.total_records ?? data.items?.length ?? 0));
      setError(null);
    } catch (err) { setError(getApiErrorMessage(err)); setItems([]); }
  }, [tenantId, page, tab, query]);
  useEffect(() => { setItems(null); void load(); }, [load]);
  useEffect(() => {
    if (!tenantId) return;
    getModuleRecords(`/tenants/${tenantId}/gift-requests/summary`, {}).then((summary) => setCounts(summary as { total: number; byStatus: Record<string, number> })).catch(() => setCounts({ total: 1, byStatus: {} }));
  }, [tenantId]);

  if (!tenantId) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">{isClient ? "Your account isn't linked to an organisation yet. Please contact TOFAA." : "Choose a client from the “Viewing” menu at the top first."}</div>;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const countOf = (key: TabKey) => (key === "ALL" ? counts?.total : counts?.byStatus[key]);

  const tabBar = <div role="tablist" aria-label="Filter by status" className={`flex gap-1 overflow-x-auto rounded-2xl p-1.5 text-sm ${isClient ? "bg-white shadow-sm ring-1 ring-line/70" : "bg-slate-100"}`}>
    {(isClient ? CLIENT_TABS : TABS).map(({ key, label }) => {
      const active = tab === key;
      const count = countOf(key);
      return <button key={key} type="button" role="tab" aria-selected={active} onClick={() => { setTab(key); setPage(1); }} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 font-medium ${active ? (isClient ? "bg-brand-soft text-brand" : "bg-white text-ink shadow-sm") : "text-muted hover:text-ink"}`}>
        {label}{!!count && <span className={`rounded-full px-1.5 text-xs ${active ? "bg-slate-100 text-ink" : "text-muted"}`}>{count}</span>}
      </button>;
    })}
  </div>;

  return <div className="space-y-4">
    <div className={`flex items-center gap-3 ${isClient ? "justify-between" : "justify-end"}`}>
      {isClient && tabBar}
      <Link href="/requests/new"><Button size="lg"><Plus size={18} /> New gift request</Button></Link>
    </div>

    <div className={`grid items-start gap-6 ${isClient ? "" : "xl:grid-cols-[minmax(0,1fr)_19rem]"}`}>
    <div className="min-w-0 space-y-6">
    {counts === null ? <Card className="flex min-h-[22rem] items-center justify-center"><Spinner /></Card> : counts.total === 0 && !isClient ? <Card className="p-4">
      <EmptyState title="No gift requests yet" description="Ready to send something special? Start a gift request." action={<Link href="/requests/new"><Button><Plus size={17} /> New gift request</Button></Link>} />
    </Card> : <>
    {!(isClient && tab === "UPCOMING") && <Card className="overflow-hidden">
      <div className="border-b border-line/70 p-4 sm:p-5">
      {!isClient && tabBar}
      {tab !== "UPCOMING" && <div className={`relative w-full sm:max-w-xs ${isClient ? "" : "mt-4"}`}>
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title or recipient" aria-label="Search gift requests" className="min-h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
      </div>}
      </div>
      {tab !== "UPCOMING" && <>

      {error && <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">We couldn't load your requests. {error}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted"><tr className="border-b border-line/70">
            <th className="px-6 py-3.5 font-medium">Request</th><th className="px-6 py-3.5 font-medium">Budget</th>
            <th className="px-6 py-3.5 font-medium">Delivery by</th><th className="px-6 py-3.5 font-medium">Status</th><th className="px-6 py-3.5 text-right font-medium">Updated</th>
          </tr></thead>
          <tbody className="divide-y divide-line/70">
            {items === null ? <tr><td colSpan={5} className="h-72 p-0"><div className="flex h-72 w-full items-center justify-center"><Spinner /></div></td></tr> : !items.length ? <tr><td colSpan={5} className="p-2">
              <EmptyState title={query || tab !== "ALL" ? "No requests match" : "No gift requests yet"} description={query || tab !== "ALL" ? "Try another status or search." : "Ready to send something special? Start a gift request."} action={query || tab !== "ALL" ? undefined : <Link href="/requests/new"><Button><Plus size={17} /> New gift request</Button></Link>} />
            </td></tr> : items.map((request) => <tr key={request.id} onClick={() => router.push(`/requests/${request.id}`)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
              <td className="max-w-[22rem] px-6 py-4">
                <Link href={`/requests/${request.id}`} className="block truncate font-semibold text-ink hover:underline" onClick={(event) => event.stopPropagation()}>{request.title}</Link>
                <span className="mt-0.5 block truncate text-sm text-muted">{[request.recipientName, request.occasionName ?? (request.eventName ? `${request.eventName}${request.eventDate ? ` · ${shortDay(request.eventDate)}` : ""}` : null)].filter(Boolean).join(" · ") || "—"}</span>
              </td>
              <td className="whitespace-nowrap px-6 py-4"><span className="block font-medium tabular-nums text-ink">{inr(request.requestedBudget)}</span>{request.requestedCredits ? <span className="block text-sm text-muted">{num(request.requestedCredits)} credits</span> : null}</td>
              <td className="whitespace-nowrap px-6 py-4 text-muted">{request.deliveryDate ? day(request.deliveryDate) : "—"}</td>
              <td className="px-6 py-4"><StatusChip status={request.status} /></td>
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-muted">{relativeTime(request.updatedAt)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line/70 px-5 py-3.5">
        <p className="text-sm text-muted">{items ? `Showing ${items.length} of ${total} request${total === 1 ? "" : "s"}` : ""}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      </div>
      </>}
    </Card>}
    {tab === "UPCOMING" && <UpcomingPanel />}
    </>}
    </div>
    {!isClient && <aside className="xl:sticky xl:top-24"><UpcomingPanel /></aside>}
    </div>
  </div>;
}
