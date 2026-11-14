"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, Building2, Check, ChevronLeft, ChevronRight, Download, Filter, Gift, LogIn, Plus, Search, Trash2, Upload, UserPlus, Users, X, CalendarClock, MapPin, Heart } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords, rowsOf } from "@/features/modules/module-utils";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FilterMenu } from "@/components/ui/filter-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { control, pageButton, table } from "@/components/ui/table-styles";
import { cn } from "@/lib/utils";
import { RecipientDialog, type RecipientRow, type RecipientTarget } from "./recipient-dialog";
import { GroupSheet, type RecipientGroup } from "./group-sheet";
import { RecipientCreatePanel } from "./wizard/recipient-create-panel";
import { ImportCsvSheet, RECIPIENT_TEMPLATE } from "./import-csv-sheet";
import { PeopleTabs } from "@/components/modules/people-tabs";
import { SearchInput } from "@/components/ui/search-input";
import { RecipientsTable, type SortKey, type SortState } from "./recipients-table";
import { type DirectoryRow, RELATIONSHIPS, type Summary, UPCOMING_OPTIONS, recipientsToCsv, updatedLabel } from "./recipient-utils";

const PAGE_SIZE = 7;
const card = "rounded-2xl border border-line/70 bg-white shadow-soft";
type Filters = { relationship: string; city: string; groupId: string; upcoming: string; status: "ACTIVE" | "ARCHIVED" | "" };
const NO_FILTERS: Filters = { relationship: "", city: "", groupId: "", upcoming: "", status: "" };

export function RecipientsView({ startNew = false }: { startNew?: boolean }) {
  const user = useAppSelector((state) => state.auth.user);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const router = useRouter();

  const endpoints = useMemo(() => {
    try { return user ? { recipients: moduleConfig.recipients.endpoint(user, selectedTenantId), groups: moduleConfig["recipient-groups"].endpoint(user, selectedTenantId) } : null; }
    catch (error) { return { error: error instanceof Error ? error.message : "This account isn't linked to an organisation yet." }; }
  }, [user, selectedTenantId]);
  const ready = endpoints && !("error" in endpoints) ? endpoints : null;

  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [everyone, setEveryone] = useState<RecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortState>({ key: "name", descending: false });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<RecipientTarget | null>(null);
  const [groupSheet, setGroupSheet] = useState<RecipientGroup | "new" | null>(null);
  const [groupPreset, setGroupPreset] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DirectoryRow | null>(null);
  const [confirm, setConfirm] = useState<DirectoryRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  // "Add a recipient" on Home links here with ?new=1 and opens the add panel straight away.
  const searchParams = useSearchParams();
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (openedFromLink.current || !ready) return;
    if (startNew || searchParams.get("new") === "1") { openedFromLink.current = true; setCreateOpen(true); return; }
    // "View recipient profile" after the wizard links here with ?open=<id>.
    const openId = searchParams.get("open");
    if (!openId) return;
    openedFromLink.current = true;
    getModuleRecords(`${ready.recipients}/${openId}`, {}).then((row) => setTarget(row as RecipientRow)).catch(() => toast.error("We couldn't open that recipient.")).finally(() => router.replace("/recipients"));
  }, [searchParams, ready, router, startNew]);

  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 400); return () => clearTimeout(timer); }, [search]);

  // Only the newest load may write, so a slow response from the previous tenant can't appear here.
  const latestLoad = useRef(0);
  const loadPage = useCallback(async () => {
    const loadId = ++latestLoad.current;
    if (!ready) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const data = await getModuleRecords(ready.recipients, {
        page, limit: PAGE_SIZE, search: query || undefined, relationship: filters.relationship || undefined, city: filters.city || undefined,
        groupId: filters.groupId || undefined, status: filters.status || undefined, upcomingDays: filters.upcoming ? Number(filters.upcoming) : undefined,
        sort: sort.key, order: sort.descending ? "desc" : "asc",
      });
      if (loadId !== latestLoad.current) return;
      const pagination = (data as { pagination?: { totalRecords?: number; total_records?: number } }).pagination;
      setRows(rowsOf(data) as DirectoryRow[]);
      setTotal(Number(pagination?.totalRecords ?? pagination?.total_records ?? 0));
    } catch (err) { if (loadId === latestLoad.current) setError(getApiErrorMessage(err)); }
    finally { if (loadId === latestLoad.current) setLoading(false); }
  }, [ready, page, query, filters, sort]);
  useEffect(() => { void loadPage(); }, [loadPage]);

  const loadSide = useCallback(async () => {
    if (!ready) return;
    const [counts, groupList] = await Promise.all([
      getModuleRecords(`${ready.recipients}/summary`, {}).catch(() => null),
      loadAllModuleRecords(ready.groups).catch(() => []),
    ]);
    if (counts) setSummary(counts as Summary);
    setGroups(groupList as unknown as RecipientGroup[]);
  }, [ready]);
  useEffect(() => { void loadSide(); }, [loadSide]);
  // Clear the previous tenant's rows and ticks as soon as the tenant changes.
  useEffect(() => { setRows([]); setSummary(null); setGroups([]); setEveryone([]); setSelected(new Set()); setFilters(NO_FILTERS); setPage(1); }, [ready]);

  const refresh = () => { void loadPage(); void loadSide(); setEveryone([]); };
  // The group form lists every person, so load them only when it is opened.
  useEffect(() => { if (groupSheet && ready && !everyone.length) loadAllModuleRecords(ready.recipients).then((all) => setEveryone(all as RecipientRow[])).catch(() => undefined); }, [groupSheet, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (patch: Partial<Filters>) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };
  const activeCount = [filters.relationship, filters.city, filters.groupId, filters.upcoming].filter(Boolean).length + (filters.status === "ARCHIVED" ? 1 : 0);
  const filtered = activeCount > 0 || !!query;
  const clearAll = () => { setFilters(NO_FILTERS); setSearch(""); setQuery(""); setPage(1); };
  const onSort = (key: SortKey) => { setSort((current) => ({ key, descending: current.key === key ? !current.descending : false })); setPage(1); };

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const togglePage = () => setSelected((current) => { const next = new Set(current); const all = rows.every((r) => next.has(String(r.id))); rows.forEach((r) => (all ? next.delete(String(r.id)) : next.add(String(r.id)))); return next; });

  /** Rows for the ticked people, even those on other pages. */
  const fetchSelected = async (): Promise<DirectoryRow[]> => {
    if (!ready) return [];
    const ids = [...selected];
    const found: DirectoryRow[] = rows.filter((r) => selected.has(String(r.id)));
    const missing = ids.filter((id) => !found.some((r) => String(r.id) === id));
    for (let i = 0; i < missing.length; i += 100) {
      const data = await getModuleRecords(ready.recipients, { recipientIds: missing.slice(i, i + 100).join(","), limit: 100, page: 1 });
      found.push(...(rowsOf(data) as DirectoryRow[]));
    }
    return found;
  };

  const exportCsv = async () => {
    setBusy(true);
    try {
      const csv = recipientsToCsv(await fetchSelected());
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = "recipients.csv"; link.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  const setArchived = async (people: DirectoryRow[], archived: boolean) => {
    if (!ready) return;
    setBusy(true);
    let done = 0;
    for (const person of people) {
      try { await mutateModule("patch", `${ready.recipients}/${person.id}`, { status: archived ? "ARCHIVED" : "ACTIVE" }); done++; }
      catch (err) { toast.error(`${person.name}: ${getApiErrorMessage(err)}`); }
    }
    setBusy(false);
    if (done) toast.success(`${done} recipient${done === 1 ? "" : "s"} ${archived ? "archived" : "restored"}.`);
    setSelected(new Set()); refresh();
  };

  const addToGroup = async (group: RecipientGroup) => {
    setBusy(true);
    try {
      await mutateModule("put", `${ready!.groups}/${group.id}`, { name: group.name, recipientIds: [...new Set([...group.recipientIds, ...selected])] });
      toast.success(`Added to ${group.name}.`);
      setSelected(new Set()); refresh();
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm || !ready) return;
    setDeleting(true);
    let done = 0;
    for (const r of confirm) {
      try { await mutateModule("delete", `${ready.recipients}/${r.id}`); done++; }
      catch (err) { toast.error(`${r.name}: ${getApiErrorMessage(err)}`); }
    }
    setDeleting(false); setConfirm(null); setTarget(null); setSelected(new Set());
    if (done) toast.success(`${done} recipient${done === 1 ? "" : "s"} deleted.`);
    refresh();
  };

  const giftFor = (row: DirectoryRow) => router.push(`/requests?new=1&recipientId=${row.id}`);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const archivedView = filters.status === "ARCHIVED";
  const selectedCount = selected.size;
  const pill = "press inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-line bg-white px-2.5 text-xs font-medium text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([RECIPIENT_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "recipients-template.csv"; link.click();
    URL.revokeObjectURL(url);
  };

  return <>
    {/* Tabs row */}
    <div className="mb-3">
      <PeopleTabs active="recipients" counts={{ recipients: summary?.active, groups: groups.length }} />
    </div>
    {/* Search, quick filters and actions row */}
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchInput value={search} onChange={setSearch} placeholder="Search by name, mobile or city…" label="Search recipients" className="min-w-[10rem] flex-1" />
      <FilterMenu triggerClassName="sm:min-w-0 sm:shrink-0" icon={<Heart size={16} />} label="Relationship" value={filters.relationship} options={[{ value: "", label: "Relationship" }, ...RELATIONSHIPS.filter((r) => !summary || summary.relationships.includes(r.value) || r.value === filters.relationship).map((r) => ({ value: r.value, label: r.label }))]} onChange={(value) => setFilter({ relationship: value })} />
      <FilterMenu triggerClassName="sm:min-w-0 sm:shrink-0" icon={<MapPin size={16} />} label="City" searchable value={filters.city} options={[{ value: "", label: "City" }, ...(summary?.cities ?? []).map((c) => ({ value: c, label: c }))]} onChange={(value) => setFilter({ city: value })} />
      <FilterMenu triggerClassName="sm:min-w-0 sm:shrink-0" icon={<Users size={16} />} label="Group" searchable width="w-64" value={filters.groupId} options={[{ value: "", label: "Group" }, ...groups.map((g) => ({ value: g.id, label: g.name, hint: `${g.recipientIds.length} people` }))]} onChange={(value) => setFilter({ groupId: value })} />
      <Button variant="secondary" className="shrink-0" onClick={() => setImportOpen(true)} disabled={!ready}><Upload size={16} /> Import</Button>
      <Button className="shrink-0 whitespace-nowrap" disabled={!ready} onClick={() => setCreateOpen(true)}><Plus size={16} /> Add Recipient</Button>
    </div>

    {endpoints && "error" in endpoints && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{endpoints.error}</p>}
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"><span>We couldn&apos;t load your recipients. {error}</span><Button size="sm" variant="secondary" onClick={() => void loadPage()}>Try again</Button></div>}

    <div>
      <section aria-label="Recipients list" className="min-w-0 space-y-3">
        {/* More filters */}
        <div className={cn(card, "flex flex-wrap items-center gap-2.5 px-4 py-3")}>
          <span className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-line bg-white px-3 text-sm font-medium text-ink"><Filter size={16} className="text-brand" /> Filters{activeCount > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-white">{activeCount}</span>}</span>
          <FilterMenu icon={<CalendarClock size={16} />} label="Upcoming occasion" value={filters.upcoming} options={[{ value: "", label: "Upcoming occasion" }, ...UPCOMING_OPTIONS.slice(1)]} onChange={(value) => setFilter({ upcoming: value })} />
          <FilterMenu icon={<Archive size={16} />} label="Status" value={filters.status} options={[{ value: "", label: "All" }, { value: "ACTIVE", label: "Status: Active" }, { value: "ARCHIVED", label: `Status: Archived${summary?.archived ? ` (${summary.archived})` : ""}` }]} onChange={(value) => { setFilter({ status: value as Filters["status"] }); setSelected(new Set()); }} />
          <button type="button" onClick={clearAll} disabled={!filtered} className="press ml-auto inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-brand hover:bg-brand-soft/60 disabled:cursor-not-allowed disabled:opacity-40">Clear all</button>
        </div>

        {/* Selection bar */}
        {selectedCount > 0 && <div role="region" aria-label="Selected recipients" aria-live="polite" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-brand/20 bg-brand-soft/60 px-4 py-2.5">
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded bg-brand text-white"><Check size={14} strokeWidth={3} /></span>
          <span className="font-semibold text-ink text-xs">{selectedCount} selected</span>
          <Popover>
            <PopoverTrigger asChild><button type="button" disabled={busy} className={pill}><UserPlus size={16} className="text-brand" /> Add to Group</button></PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <button type="button" className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-brand hover:bg-slate-50" onClick={() => { setGroupPreset([...selected]); setGroupSheet("new"); }}><Plus size={15} /> New group…</button>
              <div className="scroll-clean max-h-56 overflow-y-auto">{groups.map((group) => <button key={group.id} type="button" className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm text-ink hover:bg-slate-50" onClick={() => void addToGroup(group)}><span className="truncate">{group.name}</span><span className="shrink-0 text-xs text-muted">{group.recipientIds.length}</span></button>)}</div>
            </PopoverContent>
          </Popover>
          <button type="button" disabled={busy} onClick={() => void exportCsv()} className={pill}><Download size={16} className="text-brand" /> Export CSV</button>
          <button type="button" disabled={selectedCount !== 1} title={selectedCount === 1 ? undefined : "A gift request is for one person. Tick one recipient."} onClick={() => { const row = rows.find((r) => selected.has(String(r.id))); if (row) giftFor(row); else router.push(`/requests?new=1&recipientId=${[...selected][0]}`); }} className={pill}><Gift size={16} className="text-brand" /> Create Gift Request</button>
          <button type="button" disabled={busy} onClick={async () => void setArchived(await fetchSelected(), !archivedView)} className={pill}>{archivedView ? <ArchiveRestore size={16} className="text-brand" /> : <Archive size={16} className="text-brand" />}{archivedView ? "Restore" : "Archive"}</button>
          <button type="button" aria-label="Delete selected recipients" title="Delete selected" disabled={busy} onClick={async () => setConfirm(await fetchSelected())} className="press flex h-8 w-8 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} /></button>
          <button type="button" aria-label="Clear selection" onClick={() => setSelected(new Set())} className="press flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-black/5"><X size={16} /></button>
        </div>}

        <div className={cn(card, "overflow-hidden")}>
          <RecipientsTable rows={rows} loading={loading} selected={selected} onToggle={toggle} onTogglePage={togglePage} sort={sort} onSort={onSort} archivedView={archivedView} filtered={filtered} canAdd={!!ready}
            onOpen={(row) => setEditTarget(row as DirectoryRow)} onGift={giftFor} onArchive={(row) => void setArchived([row], !archivedView)} onDelete={(row) => setConfirm([row])} onAdd={() => setCreateOpen(true)} onImport={() => setImportOpen(true)} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
          <p className="text-sm tabular-nums text-muted" aria-live="polite">{loading ? "Loading…" : rows.length ? `Showing ${from} – ${from + rows.length - 1} of ${total} recipient${total === 1 ? "" : "s"}` : "Showing 0 recipients"}</p>
          {pages > 1 && <nav aria-label="Pagination" className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className={cn(pageButton, "border border-line bg-white disabled:opacity-40")}><ChevronLeft size={16} /></button>
            {pageNumbers.map((n, i) => <span key={n} className="flex items-center gap-1.5">
              {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
              <button type="button" aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined} onClick={() => setPage(n)} className={cn(pageButton, n === page ? "bg-brand text-white" : "border border-line bg-white text-ink hover:bg-slate-50")}>{n}</button>
            </span>)}
            <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)} className={cn(pageButton, "border border-line bg-white disabled:opacity-40")}><ChevronRight size={16} /></button>
          </nav>}
        </div>
      </section>

    </div>

    <RecipientCreatePanel open={createOpen} endpoints={ready} userId={user?.id} onClose={() => { setCreateOpen(false); if (startNew) router.replace("/recipients"); }} onSaved={refresh}
      onViewProfile={(id) => { getModuleRecords(`${ready?.recipients}/${id}`, {}).then((row) => setTarget(row as RecipientRow)).catch(() => toast.error("We couldn't open that recipient.")); }} />
    <RecipientCreatePanel open={!!editTarget} editTarget={editTarget} endpoints={ready} userId={user?.id} onClose={() => setEditTarget(null)} onSaved={refresh} onEdited={() => { setEditTarget(null); refresh(); }}
      onViewProfile={(id) => { getModuleRecords(`${ready?.recipients}/${id}`, {}).then((row) => setTarget(row as RecipientRow)).catch(() => toast.error("We couldn't open that recipient.")); }} />
    <RecipientDialog target={target} endpoint={ready?.recipients ?? ""} onClose={() => setTarget(null)} onPhotoChanged={refresh} onSaved={(addAnother) => { if (!addAnother) setTarget(null); refresh(); }} onDelete={(row) => setConfirm([row as DirectoryRow])} />
    <GroupSheet group={groupSheet} endpoint={ready?.groups ?? ""} recipients={everyone} loadingRecipients={!everyone.length} presetIds={groupPreset} onClose={() => setGroupSheet(null)} onSaved={() => { if (groupSheet === "new" && groupPreset.length) setSelected(new Set()); setGroupSheet(null); refresh(); }} />
    <ImportCsvSheet open={importOpen} endpoint={ready?.recipients ?? ""} onClose={() => setImportOpen(false)} onDone={refresh} />
    <Sheet open={!!confirm} locked={deleting} zIndex="z-[90]" labelledBy="confirm-delete-title" className="max-w-md" onClose={() => setConfirm(null)}>
      <h2 id="confirm-delete-title" className="text-xl font-semibold text-ink">Delete {confirm && confirm.length > 1 ? `${confirm.length} recipients` : "this recipient"}?</h2>
      <p className="mt-2 text-base text-muted">{confirm && confirm.length === 1 ? `${confirm[0].name} will be removed. ` : ""}This can&apos;t be undone.</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={deleting} onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" disabled={deleting} onClick={() => void remove()}>{deleting ? "Deleting…" : "Yes, delete"}</Button></div>
    </Sheet>
  </>;
}
