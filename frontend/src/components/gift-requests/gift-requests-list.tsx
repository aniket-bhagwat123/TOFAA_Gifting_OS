"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Eye, Gift, MoreVertical, Plus, Search, Calendar as CalendarIcon, ListFilter, Users } from "lucide-react";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { getModuleRecords } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/** A filter button that opens a short list of options (with a search box when there are many). */
function FilterMenu({ icon, label, value, options, onChange, searchable, width = "w-60" }: {
  icon: ReactNode; label: string; value: string; options: Array<{ value: string; label: string; hint?: string }>; onChange: (value: string) => void; searchable?: boolean; width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selected = options.find((option) => option.value === value);
  const shown = options.filter((option) => `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(term.trim().toLowerCase()));
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTerm(""); }}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} aria-haspopup="listbox" className="flex min-h-11 w-full items-center gap-2 rounded-full border border-line bg-white px-4 text-sm text-ink outline-none transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand/15 data-[state=open]:border-brand sm:w-auto">
        <span className="text-muted">{icon}</span><span className="max-w-[10rem] truncate font-medium">{selected?.label ?? label}</span><ChevronDown size={15} className="text-muted" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className={cn("p-2", width)}>
      {searchable && <div className="relative mb-2"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input autoFocus type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search by name" aria-label={`Search ${label}`} className="min-h-10 w-full rounded-lg border border-line py-2 pl-9 pr-3 text-sm outline-none focus:border-brand" /></div>}
      <div role="listbox" aria-label={label} className="scroll-clean max-h-64 overflow-y-auto">
        {shown.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }} className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-slate-50">
          <span className="min-w-0"><span className="block truncate">{option.label}</span>{option.hint && <span className="block truncate text-xs text-muted">{option.hint}</span>}</span>
          {option.value === value && <Check size={15} className="shrink-0 text-brand" />}
        </button>)}
        {!shown.length && <p className="p-3 text-sm text-muted">No matches.</p>}
      </div>
    </PopoverContent>
  </Popover>;
}

function RowMenu({ request, canEdit, onEdit }: { request: GiftRequest; canEdit: boolean; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const item = "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm text-ink hover:bg-slate-50";
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label={`More actions for ${codeOf(request)}`} onClick={(event) => event.stopPropagation()} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-muted hover:bg-slate-50 hover:text-ink"><MoreVertical size={17} /></button></PopoverTrigger>
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

  const tabBar = <div role="tablist" aria-label="Filter by status" className="scroll-clean flex gap-2 overflow-x-auto pb-1">
    {TABS.map((key) => {
      const active = status === key;
      return <button key={key} type="button" role="tab" aria-selected={active} onClick={() => { setStatus(key); setPage(1); }} className={cn("flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition", active ? "border-line bg-white font-semibold text-brand shadow-sm" : "border-line/70 bg-white/60 text-muted hover:bg-white hover:text-ink")}>
        {tabLabel(key)}{key !== "UPCOMING" && ` (${countOf(key)})`}
      </button>;
    })}
  </div>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">{tabBar}</div>
      {canCreate && <Button size="lg" onClick={() => setWizard({})}><Plus size={18} /> New gift request</Button>}
    </div>

    <div className="grid items-start gap-6">
      <div className="min-w-0">
        {status === "UPCOMING" ? <UpcomingPanel /> : counts === null ? <Card className="flex min-h-[22rem] items-center justify-center"><Spinner /></Card> : counts.total === 0 ? <Card className="p-4">
          <EmptyState title="No gift requests yet" description="Ready to send something special? Start a gift request." action={canCreate ? <Button onClick={() => setWizard({})}><Plus size={17} /> New gift request</Button> : undefined} />
        </Card> : <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
            <div className="relative min-w-[14rem] flex-1">
              <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by recipient, occasion or request ID…" aria-label="Search gift requests" className="min-h-11 w-full rounded-xl border border-line bg-white pl-11 pr-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
            </div>
            <FilterMenu icon={<CalendarIcon size={16} />} label="Any date" value={dateKey} options={DATE_OPTIONS} onChange={(value) => { setDateKey(value as DateKey); setPage(1); }} />
            {dateKey === "CUSTOM" && <div className="flex items-center gap-2 text-sm">
              <input type="date" aria-label="From date" value={customFrom} max={customTo || undefined} onChange={(event) => { setCustomFrom(event.target.value); setPage(1); }} className="min-h-11 rounded-xl border border-line bg-white px-3 outline-none focus:border-brand" />
              <span className="text-muted">to</span>
              <input type="date" aria-label="To date" value={customTo} min={customFrom || undefined} onChange={(event) => { setCustomTo(event.target.value); setPage(1); }} className="min-h-11 rounded-xl border border-line bg-white px-3 outline-none focus:border-brand" />
            </div>}
            <FilterMenu icon={<Users size={16} />} label="Any recipient" searchable width="w-72" value={recipientId} options={[{ value: "", label: "Any recipient" }, ...recipients]} onChange={(value) => { setRecipientId(value); setPage(1); }} />
            <FilterMenu icon={<ListFilter size={16} />} label="Any status" value={status === "ALL" ? "" : status} options={[{ value: "", label: "Any status" }, ...statusOptions.slice(1)]} onChange={(value) => { setStatus((value || "ALL") as StatusKey); setPage(1); }} />
            <Button variant="secondary" className="rounded-full" onClick={reset} disabled={!filtered}>Reset</Button>
          </div>

          {error && <div role="alert" className="mx-4 mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">We couldn't load your requests. {error}</div>}
          <div className="overflow-x-auto px-3 pb-2 sm:px-4">
            <table className="w-full min-w-[60rem] border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted"><tr>
                {["Request", "Recipient", "Occasion", "Requested by", "Budget", "Status", "Actions"].map((heading, index) => <th key={heading} scope="col" className={cn("px-4 py-3 font-semibold", index === 6 && "text-right")}>{heading}</th>)}
              </tr></thead>
              <tbody>
                {items === null ? <tr><td colSpan={7} className="h-72 p-0"><div className="flex h-72 w-full items-center justify-center"><Spinner /></div></td></tr> : !items.length ? <tr><td colSpan={7} className="p-2">
                  <EmptyState title={filtered ? "No requests match" : "No gift requests yet"} description={filtered ? "Try a different status, recipient or search." : "Ready to send something special? Start a gift request."} action={filtered ? <Button variant="secondary" onClick={reset}>Reset filters</Button> : undefined} />
                </td></tr> : items.map((request) => {
                  const occasion = request.occasionName ?? request.eventName;
                  const occasionDate = request.occasionDate ?? request.eventDate ?? request.deliveryDate;
                  const editable = isClient && (request.status === "DRAFT" || request.status === "NEEDS_INFO");
                  return <tr key={request.id} onClick={() => router.push(`/requests/${request.id}`)} className="group cursor-pointer">
                    <td className="rounded-l-2xl border-y border-l border-line/70 bg-white px-4 py-3.5 group-hover:bg-slate-50/70">
                      <Link href={`/requests/${request.id}`} onClick={(event) => event.stopPropagation()} className="block whitespace-nowrap font-bold text-ink hover:underline">{codeOf(request)}</Link>
                      <span className="mt-0.5 block whitespace-nowrap text-xs text-muted">{createdLabel(request.createdAt)}</span>
                    </td>
                    <td className="border-y border-line/70 bg-white px-4 py-3.5 group-hover:bg-slate-50/70">
                      <div className="flex items-center gap-3"><Avatar name={request.recipientName} src={request.recipientAvatarUrl} /><div className="min-w-0"><p className="truncate font-medium text-ink">{request.recipientName ?? "—"}</p><p className="truncate text-xs text-muted">{request.relationship ?? ""}</p></div></div>
                    </td>
                    <td className="border-y border-line/70 bg-white px-4 py-3.5 group-hover:bg-slate-50/70">
                      <div className="flex items-center gap-3"><span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Gift size={18} /></span><div className="min-w-0"><p className="truncate font-medium text-ink">{occasion ?? "—"}</p><p className="whitespace-nowrap text-xs text-muted">{occasionDate ? day(occasionDate) : ""}</p></div></div>
                    </td>
                    <td className="border-y border-line/70 bg-white px-4 py-3.5 group-hover:bg-slate-50/70">
                      <div className="flex items-center gap-3"><Avatar name={request.createdByName} src={request.createdByAvatarUrl} className="h-9 w-9 text-xs" /><div className="min-w-0"><p className="truncate font-medium text-ink">{request.createdByName ?? "—"}</p><p className="text-xs text-muted">{roleShort(request.createdByRole) ? `( ${roleShort(request.createdByRole)} )` : ""}</p></div></div>
                    </td>
                    <td className="whitespace-nowrap border-y border-line/70 bg-white px-4 py-3.5 font-medium tabular-nums text-ink group-hover:bg-slate-50/70">{budgetLabel(request)}</td>
                    <td className="border-y border-line/70 bg-white px-4 py-3.5 group-hover:bg-slate-50/70"><StatusChip status={request.status} /></td>
                    <td className="rounded-r-2xl border-y border-r border-line/70 bg-white px-4 py-3.5 group-hover:bg-slate-50/70">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/requests/${request.id}`} onClick={(event) => event.stopPropagation()}><Button size="sm" variant="secondary"><Eye size={16} /> View</Button></Link>
                        <RowMenu request={request} canEdit={editable} onEdit={() => setWizard({ editId: request.id })} />
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-5 py-3.5">
            <p className="text-sm text-muted">{items?.length ? `Showing ${from}–${from + items.length - 1} of ${total} request${total === 1 ? "" : "s"}` : items ? "Showing 0 requests" : ""}</p>
            <nav aria-label="Pagination" className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              {pageNumbers.map((number, index) => <span key={number} className="flex items-center gap-2">
                {index > 0 && number - pageNumbers[index - 1] > 1 && <span className="text-muted">…</span>}
                <button type="button" aria-label={`Page ${number}`} aria-current={number === page ? "page" : undefined} onClick={() => setPage(number)} className={cn("flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold", number === page ? "bg-brand text-white" : "border border-line bg-white text-ink hover:bg-slate-50")}>{number}</button>
              </span>)}
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </nav>
          </div>
        </Card>}
      </div>
    </div>

    {wizard && (canCreate || wizard.editId) && <GiftRequestWizard requestId={wizard.editId} onClose={closeWizard} onChanged={() => setRefresh((value) => value + 1)} />}
  </div>;
}
