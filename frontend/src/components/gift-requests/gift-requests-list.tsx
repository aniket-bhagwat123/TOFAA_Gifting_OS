"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Gift, MoreVertical, Plus, Search, Calendar as CalendarIcon, ListFilter, Users } from "lucide-react";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { getModuleRecords } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Tab, TabBar } from "@/components/ui/tab-bar";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterMenu } from "@/components/ui/filter-menu";
import { HoverScrollX } from "@/components/ui/hover-scroll-x";
import { control, iconButton, pageButton, table } from "@/components/ui/table-styles";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { GiftRequestWizard } from "./gift-request-wizard";
import { UpcomingPanel } from "./upcoming-panel";
import { type GiftRequest, type GiftStatus, STATUS_META, STATUS_ORDER, StatusChip, budgetLabel, codeOf, day, roleShort, useTenantId } from "./shared";

const PAGE_SIZE = 5;
type StatusKey = "ALL" | "UPCOMING" | GiftStatus;
type DateKey = "ANY" | "TODAY" | "LAST_7" | "LAST_30" | "THIS_MONTH" | "CUSTOM";
const TABS: StatusKey[] = ["ALL", "DRAFT", "SUBMITTED", "IN_REVIEW", "NEEDS_INFO", "PROPOSAL_READY", "CONFIRMED", "UPCOMING"];
const tabLabel = (key: StatusKey) => (key === "ALL" ? "All" : key === "UPCOMING" ? "Upcoming" : STATUS_META[key].label);
const DATE_OPTIONS: Array<{ value: DateKey; label: string }> = [
  { value: "ANY", label: "Any date" }, { value: "TODAY", label: "Today" }, { value: "LAST_7", label: "Last 7 days" },
  { value: "LAST_30", label: "Last 30 days" }, { value: "THIS_MONTH", label: "This month" }, { value: "CUSTOM", label: "Custom range" },
];
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function dateRange(key: DateKey, from: string, to: string): { dateFrom?: string; dateTo?: string } {
  const today = new Date();
  const ago = (days: number) => { const date = new Date(today); date.setDate(date.getDate() - days); return iso(date); };
  switch (key) {
    case "TODAY": return { dateFrom: iso(today), dateTo: iso(today) };
    case "LAST_7": return { dateFrom: ago(6), dateTo: iso(today) };
    case "LAST_30": return { dateFrom: ago(29), dateTo: iso(today) };
    case "THIS_MONTH": return { dateFrom: iso(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: iso(today) };
    case "CUSTOM": return { dateFrom: from || undefined, dateTo: to || undefined };
    default: return {};
  }
}

/** "Today, 11:30 AM" for today, otherwise "Mar 10, 2025". */
function createdLabel(value: string) {
  const when = new Date(value);
  if (when.toDateString() === new Date().toDateString()) return `Today, ${when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  return when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RowMenu({ request, canEdit, onEdit }: { request: GiftRequest; canEdit: boolean; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const item = "flex min-h-9 w-full items-center rounded-lg px-3 text-left text-sm text-ink hover:bg-slate-50";
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label={`More actions for ${codeOf(request)}`} onClick={(event) => event.stopPropagation()} className={iconButton}><MoreVertical size={16} /></button></PopoverTrigger>
    <PopoverContent align="end" className="w-44 p-1.5" onClick={(event) => event.stopPropagation()}>
      <button type="button" className={item} onClick={() => router.push(`/requests/${request.id}`)}>View details</button>
      {canEdit && <button type="button" className={item} onClick={() => { setOpen(false); onEdit(); }}>Edit request</button>}
      <button type="button" className={item} onClick={() => { void navigator.clipboard?.writeText(request.requestCode ?? "").catch(() => undefined); setOpen(false); }}>Copy request ID</button>
    </PopoverContent>
  </Popover>;
}

export function GiftRequestsList({ startNew = false }: { startNew?: boolean }) {
  const { user, tenantId, isClient } = useTenantId();
  const canCreate = user?.platformRole !== "SUPER_ADMIN";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StatusKey>("ALL");
  const [dateKey, setDateKey] = useState<DateKey>("ANY");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [recipients, setRecipients] = useState<Array<{ value: string; label: string; hint?: string }>>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<GiftRequest[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{ editId?: string } | null>(startNew || searchParams.get("new") === "1" ? {} : null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);

  // The recipient filter is filled from the client's own recipient list.
  useEffect(() => {
    if (!user || !tenantId) return;
    let cancelled = false;
    loadAllModuleRecords(moduleConfig.recipients.endpoint(user, tenantId)).then((rows) => {
      if (cancelled) return;
      setRecipients(rows.map((row) => ({ value: String(row.id), label: String(row.name ?? "Unnamed"), hint: String((row.address as { city?: string } | undefined)?.city ?? row.mobileNumber ?? "") })).sort((a, b) => a.label.localeCompare(b.label)));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [user, tenantId]);

  const range = useMemo(() => dateRange(dateKey, customFrom, customTo), [dateKey, customFrom, customTo]);
  const load = useCallback(async () => {
    if (!tenantId || status === "UPCOMING") return;
    try {
      const list = await getModuleRecords(`/tenants/${tenantId}/gift-requests`, { page, limit: PAGE_SIZE, status: status === "ALL" ? undefined : status, search: query || undefined, recipientId: recipientId || undefined, dateFrom: range.dateFrom, dateTo: range.dateTo });
      const data = list as { items: GiftRequest[]; pagination?: { totalRecords?: number; total_records?: number } };
      setItems(data.items ?? []);
      setTotal(Number(data.pagination?.totalRecords ?? data.pagination?.total_records ?? data.items?.length ?? 0));
      setError(null);
    } catch (err) { setError(getApiErrorMessage(err)); setItems([]); }
  }, [tenantId, page, status, query, recipientId, range]);
  useEffect(() => { setItems(null); void load(); }, [load, refresh]);
  useEffect(() => {
    if (!tenantId) return;
    getModuleRecords(`/tenants/${tenantId}/gift-requests/summary`, {}).then((summary) => setCounts(summary as { total: number; byStatus: Record<string, number> })).catch(() => setCounts({ total: 1, byStatus: {} }));
  }, [tenantId, refresh]);

  const filtered = (status !== "ALL" && status !== "UPCOMING") || !!query || !!recipientId || dateKey !== "ANY";
  const reset = () => { setStatus("ALL"); setDateKey("ANY"); setCustomFrom(""); setCustomTo(""); setRecipientId(""); setSearch(""); setQuery(""); setPage(1); };
  const closeWizard = () => { setWizard(null); if (startNew || searchParams.get("new") === "1") router.replace("/requests"); };

  if (!tenantId) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">{isClient ? "Your account isn't linked to an organisation yet. Please contact TOFAA." : "Choose a client from the “Viewing” menu at the top first."}</div>;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const countOf = (key: StatusKey) => (key === "ALL" ? counts?.total : key === "UPCOMING" ? undefined : counts?.byStatus[key]) ?? 0;
  const pageNumbers = Array.from({ length: pages }, (_, index) => index + 1).filter((number) => number === 1 || number === pages || Math.abs(number - page) <= 1);
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const statusOptions = [{ value: "ALL", label: "All statuses" }, ...STATUS_ORDER.map((key) => ({ value: key, label: STATUS_META[key].label }))];

  const tabBar = <TabBar label="Filter by status" wrapperClassName="min-w-0 max-w-full">
    {TABS.map((key) => <Tab key={key} active={status === key} count={key === "UPCOMING" ? undefined : countOf(key)} onClick={() => { setStatus(key); setPage(1); }}>{tabLabel(key)}</Tab>)}
  </TabBar>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">{tabBar}</div>
      {canCreate && <Button onClick={() => setWizard({})}><Plus size={16} /> New request</Button>}
    </div>

    <div className="grid items-start gap-6">
      <div className="min-w-0">
        {status === "UPCOMING" ? <UpcomingPanel /> : counts === null ? <Card className="flex min-h-[22rem] items-center justify-center"><Spinner /></Card> : counts.total === 0 ? <Card className="p-4">
          <EmptyState title="No gift requests yet" description="Ready to send something special? Start a gift request." action={canCreate ? <Button onClick={() => setWizard({})}><Plus size={17} /> New request</Button> : undefined} />
        </Card> : <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-4 py-3 sm:px-5">
            <div className="relative min-w-full flex-1 sm:min-w-[17.5rem] sm:max-w-[26rem]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by recipient, occasion or request ID…" aria-label="Search gift requests" className={cn(control, "w-full pl-9")} />
            </div>
            <FilterMenu icon={<CalendarIcon size={16} />} label="Any date" value={dateKey} options={DATE_OPTIONS} onChange={(value) => { setDateKey(value as DateKey); setPage(1); }} />
            {dateKey === "CUSTOM" && <div className="flex items-center gap-2 text-sm">
              <input type="date" aria-label="From date" value={customFrom} max={customTo || undefined} onChange={(event) => { setCustomFrom(event.target.value); setPage(1); }} className={control} />
              <span className="text-muted">to</span>
              <input type="date" aria-label="To date" value={customTo} min={customFrom || undefined} onChange={(event) => { setCustomTo(event.target.value); setPage(1); }} className={control} />
            </div>}
            <FilterMenu icon={<Users size={16} />} label="Any recipient" searchable width="w-72" value={recipientId} options={[{ value: "", label: "Any recipient" }, ...recipients]} onChange={(value) => { setRecipientId(value); setPage(1); }} />
            <FilterMenu icon={<ListFilter size={16} />} label="Any status" value={status === "ALL" ? "" : status} options={[{ value: "", label: "Any status" }, ...statusOptions.slice(1)]} onChange={(value) => { setStatus((value || "ALL") as StatusKey); setPage(1); }} />
            <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={reset} disabled={!filtered}>Reset</Button>
          </div>

          {error && <div role="alert" className="mx-4 mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">We couldn't load your requests. {error}</div>}
          <HoverScrollX>
            <table className={cn(table.root, "min-w-[62rem]")}>
              <thead className={table.head}><tr className={table.headRow}>
                {["Request", "Recipient", "Occasion", "Requested by", "Budget", "Status", "Actions"].map((heading, index) => <th key={heading} scope="col" className={cn(table.th, index === 6 && "text-right")}>{heading}</th>)}
              </tr></thead>
              <tbody>
                {items === null ? <tr><td colSpan={7} className="h-72 p-0"><div className="flex h-72 w-full items-center justify-center"><Spinner /></div></td></tr> : !items.length ? <tr><td colSpan={7} className="p-2">
                  <EmptyState title={filtered ? "No requests match" : "No gift requests yet"} description={filtered ? "Try a different status, recipient or search." : "Ready to send something special? Start a gift request."} action={filtered ? <Button variant="secondary" onClick={reset}>Reset filters</Button> : undefined} />
                </td></tr> : items.map((request) => {
                  const occasion = request.occasionName ?? request.eventName;
                  const occasionDate = request.occasionDate ?? request.eventDate ?? request.deliveryDate;
                  const editable = isClient && (request.status === "DRAFT" || request.status === "NEEDS_INFO");
                  const cell = table.td;
                  return <tr key={request.id} onClick={() => router.push(`/requests/${request.id}`)} className={cn(table.row, "group cursor-pointer")}>
                    <td className={cell}>
                      <Link href={`/requests/${request.id}`} onClick={(event) => event.stopPropagation()} className="block whitespace-nowrap text-sm font-semibold text-ink hover:underline">{codeOf(request)}</Link>
                      <span className="mt-1 block whitespace-nowrap text-xs tabular-nums text-muted">{createdLabel(request.createdAt)}</span>
                    </td>
                    <td className={cell}>
                      <div className="flex items-center gap-3"><Avatar name={request.recipientName} src={request.recipientAvatarUrl} className="h-9 w-9 text-xs" /><div className="min-w-0"><p className="max-w-[11rem] truncate text-sm font-semibold text-ink">{request.recipientName ?? "—"}</p><p className="max-w-[11rem] truncate text-xs text-muted">{request.relationship ?? ""}</p></div></div>
                    </td>
                    <td className={cell}>
                      <div className="flex items-center gap-3"><span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Gift size={20} /></span><div className="min-w-0"><p className="max-w-[11rem] truncate text-sm font-medium text-ink">{occasion ?? "—"}</p><p className="whitespace-nowrap text-xs tabular-nums text-muted">{occasionDate ? day(occasionDate) : ""}</p></div></div>
                    </td>
                    <td className={cell}>
                      <div className="flex items-center gap-3"><Avatar name={request.createdByName} src={request.createdByAvatarUrl} className="h-9 w-9 text-xs" /><div className="min-w-0"><p className="max-w-[10rem] truncate text-sm font-medium text-ink">{request.createdByName ?? "—"}</p><p className="text-xs text-muted">{roleShort(request.createdByRole)}</p></div></div>
                    </td>
                    <td className={cn(cell, "whitespace-nowrap text-sm font-semibold tabular-nums text-ink")}>{budgetLabel(request)}</td>
                    <td className={cell}><StatusChip status={request.status} /></td>
                    <td className={cell}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/requests/${request.id}`} onClick={(event) => event.stopPropagation()}><Button size="sm" variant="secondary" className="min-h-9 rounded-lg px-3 text-sm"><Eye size={16} /> View</Button></Link>
                        <RowMenu request={request} canEdit={editable} onEdit={() => setWizard({ editId: request.id })} />
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </HoverScrollX>
          <div className={table.footer}>
            <p className="text-sm tabular-nums text-muted">{items?.length ? `Showing ${from}–${from + items.length - 1} of ${total} request${total === 1 ? "" : "s"}` : items ? "Showing 0 requests" : ""}</p>
            <nav aria-label="Pagination" className="flex items-center gap-1.5">
              <Button size="sm" variant="secondary" className="min-h-9 rounded-lg px-3" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              {pageNumbers.map((number, index) => <span key={number} className="flex items-center gap-1.5">
                {index > 0 && number - pageNumbers[index - 1] > 1 && <span className="text-muted">…</span>}
                <button type="button" aria-label={`Page ${number}`} aria-current={number === page ? "page" : undefined} onClick={() => setPage(number)} className={cn(pageButton, number === page ? "bg-brand text-white" : "border border-line bg-white text-ink hover:bg-slate-50")}>{number}</button>
              </span>)}
              <Button size="sm" variant="secondary" className="min-h-9 rounded-lg px-3" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </nav>
          </div>
        </Card>}
      </div>
    </div>

    {wizard && (canCreate || wizard.editId) && <GiftRequestWizard requestId={wizard.editId} onClose={closeWizard} onChanged={() => setRefresh((value) => value + 1)} />}
  </div>;
}
