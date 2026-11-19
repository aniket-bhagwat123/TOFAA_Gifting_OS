"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, Building2, Check, ChevronLeft, ChevronRight, Download, Gift, LogIn, Plus, Search, Trash2, Upload, UserPlus, Users, X, CalendarClock, MapPin, Heart } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { SendGiftDialog, type SendGiftTarget } from "./send-gift-dialog";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords, rowsOf } from "@/features/modules/module-utils";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { Button } from "@/components/ui/button";
import { FilterMenu } from "@/components/ui/filter-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { control, pageButton, table } from "@/components/ui/table-styles";
import { cn } from "@/lib/utils";
import { RecipientDialog, type RecipientRow, type RecipientTarget } from "./recipient-dialog";
import { GroupSheet, type RecipientGroup } from "./group-sheet";
import { RecipientCreatePanel } from "./wizard/recipient-create-panel";
import { ImportRecipientsSheet } from "./import-recipients-sheet";
import { FormatMenu } from "@/components/ui/format-menu";
import { type FileFormat, writeTable } from "@/lib/data-io";
import { FIELD_HEADERS, recipientToCells } from "@/lib/recipient-fields";
import { PeopleTabs } from "@/components/modules/people-tabs";
import { SearchInput } from "@/components/ui/search-input";
import { RecipientsTable, type SortKey, type SortState } from "./recipients-table";
import { type DirectoryRow, RELATIONSHIPS, type Summary, UPCOMING_OPTIONS, updatedLabel } from "./recipient-utils";

const PAGE_SIZES = [10, 20, 30, 40, 50, 100];
const PAGE_SIZE_KEY = "tofaa-recipients-page-size";
const card = "rounded-lg border border-line/70 bg-white shadow-soft";
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
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { try { const saved = Number(window.localStorage.getItem(PAGE_SIZE_KEY)); if (PAGE_SIZES.includes(saved)) setPageSize(saved); } catch { /* the default is fine */ } }, []);
  const changePageSize = (size: number) => { setPageSize(size); setPage(1); try { window.localStorage.setItem(PAGE_SIZE_KEY, String(size)); } catch { /* ignore */ } };
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
        page, limit: pageSize, search: query || undefined, relationship: filters.relationship || undefined, city: filters.city || undefined,
        groupId: filters.groupId || undefined, status: filters.status || undefined, upcomingDays: filters.upcoming ? Number(filters.upcoming) : undefined,
        sort: sort.key, order: sort.descending ? "desc" : "asc",
      });
      if (loadId !== latestLoad.current) return;
      const pagination = (data as { pagination?: { totalRecords?: number; total_records?: number } }).pagination;
      setRows(rowsOf(data) as DirectoryRow[]);
      setTotal(Number(pagination?.totalRecords ?? pagination?.total_records ?? 0));
    } catch (err) { if (loadId === latestLoad.current) setError(getApiErrorMessage(err)); }
    finally { if (loadId === latestLoad.current) setLoading(false); }
  }, [ready, page, pageSize, query, filters, sort]);
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

  // Rows loaded when everyone matching the filters was selected, so they are not fetched again.
  const rowCache = useRef(new Map<string, DirectoryRow>());
  const filterQuery = () => {
    const q = new URLSearchParams();
    if (query) q.set("search", query);
    if (filters.relationship) q.set("relationship", filters.relationship);
    if (filters.city) q.set("city", filters.city);
    if (filters.groupId) q.set("groupId", filters.groupId);
    if (filters.status) q.set("status", filters.status);
    if (filters.upcoming) q.set("upcomingDays", filters.upcoming);
    return q.toString();
  };
  /** Selects every recipient that matches the current search and filters, on all pages, not only the ones shown. */
  const selectAllMatching = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const qs = filterQuery();
      const all = await loadAllModuleRecords(qs ? `${ready.recipients}?${qs}` : ready.recipients) as DirectoryRow[];
      all.forEach((r) => rowCache.current.set(String(r.id), r));
      setSelected(new Set(all.map((r) => String(r.id))));
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  /** Rows for the ticked people, even those on other pages. */
  const fetchSelected = async (): Promise<DirectoryRow[]> => {
    if (!ready) return [];
    const ids = [...selected];
    const found: DirectoryRow[] = ids.map((id) => rowCache.current.get(id) ?? rows.find((r) => String(r.id) === id)).filter((r): r is DirectoryRow => !!r);
    const missing = ids.filter((id) => !found.some((r) => String(r.id) === id));
    for (let i = 0; i < missing.length; i += 100) {
      const data = await getModuleRecords(ready.recipients, { recipientIds: missing.slice(i, i + 100).join(","), limit: 100, page: 1 });
      found.push(...(rowsOf(data) as DirectoryRow[]));
    }
    return found;
  };

  // Exports in the same columns as the import template, so a file can be exported, edited and imported again.
  const exportAs = async (format: FileFormat, everyone = false) => {
    setBusy(true);
    try {
      const people = everyone && ready ? (await loadAllModuleRecords(ready.recipients)) as DirectoryRow[] : await fetchSelected();
      if (!people.length) { toast.error("There are no recipients to export."); return; }
      writeTable(FIELD_HEADERS, people.map((p) => recipientToCells(p as Record<string, unknown>)), format, "recipients");
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  const bulk = async (path: "bulk-delete" | "bulk-status", people: DirectoryRow[], extra?: Record<string, unknown>) => {
    let affected = 0;
    const ids = people.map((p) => String(p.id));
    for (let i = 0; i < ids.length; i += 1000) {
      const result = await mutateModule("post", `${ready!.recipients}/${path}`, { recipientIds: ids.slice(i, i + 1000), ...extra }) as { affected?: number };
      affected += result?.affected ?? 0;
    }
    return affected;
  };

  const setArchived = async (people: DirectoryRow[], archived: boolean) => {
    if (!ready || !people.length) return;
    setBusy(true);
    try {
      const done = await bulk("bulk-status", people, { status: archived ? "ARCHIVED" : "ACTIVE" });
      toast.success(`${done} recipient${done === 1 ? "" : "s"} ${archived ? "archived" : "restored"}.`);
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
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
    try {
      const done = await bulk("bulk-delete", confirm);
      toast.success(`${done} recipient${done === 1 ? "" : "s"} deleted.`);
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    setDeleting(false); setConfirm(null); setTarget(null); setSelected(new Set());
    refresh();
  };

  const [sendTarget, setSendTarget] = useState<SendGiftTarget | null>(null);
  const clientTenantId = user?.platformRole === "CLIENT" ? user.tenant?.id ?? null : null;
  // A client sends the gift from here; staff still open the full request form.
  const giftFor = (row: DirectoryRow) => clientTenantId
    ? setSendTarget({ title: String(row.name ?? "Recipient"), wholeGroup: false, people: [{ id: String(row.id), name: String(row.name ?? "Recipient") }] })
    : router.push(`/requests?new=1&recipientId=${row.id}`);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const archivedView = filters.status === "ARCHIVED";
  const selectedCount = selected.size;
  const pill = "press inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-white px-2.5 text-xs font-medium text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
  return <>
    {/* Tabs and quick filters row */}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <PeopleTabs active="recipients" counts={{ recipients: summary?.active, groups: groups.length }} className="w-fit shrink-0" />
      <div className="flex flex-wrap items-center justify-end gap-2">
      <FilterMenu triggerClassName="sm:min-w-0 sm:shrink-0" icon={<Heart size={16} />} label="Relationship" value={filters.relationship} options={[{ value: "", label: "Relationship" }, ...RELATIONSHIPS.filter((r) => !summary || summary.relationships.includes(r.value) || r.value === filters.relationship).map((r) => ({ value: r.value, label: r.label }))]} onChange={(value) => setFilter({ relationship: value })} />
      <FilterMenu triggerClassName="sm:min-w-0 sm:shrink-0" icon={<MapPin size={16} />} label="City" searchable value={filters.city} options={[{ value: "", label: "City" }, ...(summary?.cities ?? []).map((c) => ({ value: c, label: c }))]} onChange={(value) => setFilter({ city: value })} />
      <Button variant="secondary" className="shrink-0" onClick={() => setImportOpen(true)} disabled={!ready}><Upload size={16} /> Import</Button>
      <FormatMenu disabled={!ready || busy} onPick={(format) => void exportAs(format, true)} className="press inline-flex min-h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[7px] border border-line bg-white px-3.5 text-sm font-medium text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Download size={16} /> Export</FormatMenu>
      <Button className="shrink-0 whitespace-nowrap" disabled={!ready} onClick={() => setCreateOpen(true)}><Plus size={16} /> Add Recipient</Button>
      </div>
    </div>

    {endpoints && "error" in endpoints && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{endpoints.error}</p>}
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"><span>We couldn&apos;t load your recipients. {error}</span><Button size="sm" variant="secondary" onClick={() => void loadPage()}>Try again</Button></div>}

    <div>
      <section aria-label="Recipients list" className="min-w-0 space-y-3">
        {/* More filters */}
        <div className={cn(card, "flex flex-wrap items-center gap-2 px-3 py-2")}>
          <FilterMenu icon={<Users size={16} />} label="Group" searchable width="w-64" value={filters.groupId} options={[{ value: "", label: "Group" }, ...groups.map((g) => ({ value: g.id, label: g.name, hint: `${g.recipientIds.length} people` }))]} onChange={(value) => setFilter({ groupId: value })} />
          <FilterMenu icon={<CalendarClock size={16} />} label="Upcoming occasion" value={filters.upcoming} options={[{ value: "", label: "Upcoming occasion" }, ...UPCOMING_OPTIONS.slice(1)]} onChange={(value) => setFilter({ upcoming: value })} />
          <FilterMenu icon={<Archive size={16} />} label="Status" value={filters.status} options={[{ value: "", label: "All" }, { value: "ACTIVE", label: "Status: Active" }, { value: "ARCHIVED", label: `Status: Archived${summary?.archived ? ` (${summary.archived})` : ""}` }]} onChange={(value) => { setFilter({ status: value as Filters["status"] }); setSelected(new Set()); }} />
      <SearchInput value={search} onChange={setSearch} placeholder="Search by name, mobile or city…" label="Search recipients" className="ml-auto w-full sm:w-72" />
          <button type="button" onClick={clearAll} disabled={!filtered} className="press inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold text-brand hover:bg-brand-soft/60 disabled:cursor-not-allowed disabled:opacity-40">Clear all</button>
        </div>

        {/* Selection bar */}
        {selectedCount > 0 && <div role="region" aria-label="Selected recipients" aria-live="polite" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-brand/20 bg-brand-soft/60 px-4 py-2.5">
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded bg-brand text-white"><Check size={14} strokeWidth={3} /></span>
          <span className="font-semibold text-ink text-xs">{selectedCount} selected</span>
          {selectedCount < total && <button type="button" disabled={busy} onClick={() => void selectAllMatching()} className="press inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold text-brand hover:bg-white/70 disabled:opacity-50">Select all {total} recipients</button>}
          <Popover>
            <PopoverTrigger asChild><button type="button" disabled={busy} className={pill}><UserPlus size={16} className="text-brand" /> Add to Group</button></PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <button type="button" className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-brand hover:bg-slate-50" onClick={() => { setGroupPreset([...selected]); setGroupSheet("new"); }}><Plus size={15} /> New group…</button>
              <div className="scroll-clean max-h-56 overflow-y-auto">{groups.map((group) => <button key={group.id} type="button" className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm text-ink hover:bg-slate-50" onClick={() => void addToGroup(group)}><span className="truncate">{group.name}</span><span className="shrink-0 text-xs text-muted">{group.recipientIds.length}</span></button>)}</div>
            </PopoverContent>
          </Popover>
          <FormatMenu align="start" disabled={busy} onPick={(format) => void exportAs(format)} className={pill}><Download size={16} className="text-brand" /> Export</FormatMenu>
          <button type="button" disabled={selectedCount !== 1} title={selectedCount === 1 ? undefined : "A gift request is for one person. Tick one recipient."} onClick={() => { const row = rows.find((r) => selected.has(String(r.id))); if (row) giftFor(row); else router.push(`/requests?new=1&recipientId=${[...selected][0]}`); }} className={pill}><Gift size={16} className="text-brand" /> Send Gift</button>
          <button type="button" disabled={busy} onClick={async () => void setArchived(await fetchSelected(), !archivedView)} className={pill}>{archivedView ? <ArchiveRestore size={16} className="text-brand" /> : <Archive size={16} className="text-brand" />}{archivedView ? "Restore" : "Archive"}</button>
          <button type="button" aria-label="Delete selected recipients" title="Delete selected" disabled={busy} onClick={async () => setConfirm(await fetchSelected())} className="press flex h-8 w-8 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} /></button>
          <button type="button" aria-label="Clear selection" onClick={() => setSelected(new Set())} className="press flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-black/5"><X size={16} /></button>
        </div>}

        <div className={cn(card, "overflow-hidden")}>
          <RecipientsTable rows={rows} loading={loading} selected={selected} onToggle={toggle} onTogglePage={togglePage} sort={sort} onSort={onSort} archivedView={archivedView} filtered={filtered} canAdd={!!ready}
            onOpen={(row) => setEditTarget(row as DirectoryRow)} onGift={giftFor} onArchive={(row) => void setArchived([row], !archivedView)} onDelete={(row) => setConfirm([row])} onAdd={() => setCreateOpen(true)} onImport={() => setImportOpen(true)} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
          <p className="text-xs tabular-nums text-muted" aria-live="polite">{loading ? "Loading…" : rows.length ? `Showing ${from} – ${from + rows.length - 1} of ${total} recipient${total === 1 ? "" : "s"}` : "Showing 0 recipients"}</p>
          <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">Rows per page
            <select aria-label="Rows per page" value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))} className="h-8 rounded-md border border-line bg-white px-2 text-xs font-medium text-ink outline-none focus:border-brand">
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          {pages > 1 && <nav aria-label="Pagination" className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className={cn(pageButton, "border border-line bg-white disabled:opacity-40")}><ChevronLeft size={16} /></button>
            {pageNumbers.map((n, i) => <span key={n} className="flex items-center gap-1.5">
              {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
              <button type="button" aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined} onClick={() => setPage(n)} className={cn(pageButton, n === page ? "bg-brand text-white" : "border border-line bg-white text-ink hover:bg-slate-50")}>{n}</button>
            </span>)}
            <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)} className={cn(pageButton, "border border-line bg-white disabled:opacity-40")}><ChevronRight size={16} /></button>
          </nav>}
          </div>
        </div>
      </section>

    </div>

    <RecipientCreatePanel open={createOpen} endpoints={ready} userId={user?.id} onClose={() => { setCreateOpen(false); if (startNew) router.replace("/recipients"); }} onSaved={refresh}
      onViewProfile={(id) => { getModuleRecords(`${ready?.recipients}/${id}`, {}).then((row) => setTarget(row as RecipientRow)).catch(() => toast.error("We couldn't open that recipient.")); }} />
    <RecipientCreatePanel open={!!editTarget} editTarget={editTarget} endpoints={ready} userId={user?.id} onClose={() => setEditTarget(null)} onSaved={refresh} onEdited={() => { setEditTarget(null); refresh(); }}
      onViewProfile={(id) => { getModuleRecords(`${ready?.recipients}/${id}`, {}).then((row) => setTarget(row as RecipientRow)).catch(() => toast.error("We couldn't open that recipient.")); }} />
    <RecipientDialog target={target} endpoint={ready?.recipients ?? ""} onClose={() => setTarget(null)} onPhotoChanged={refresh} onSaved={(addAnother) => { if (!addAnother) setTarget(null); refresh(); }} onDelete={(row) => setConfirm([row as DirectoryRow])} />
    <GroupSheet group={groupSheet} endpoint={ready?.groups ?? ""} recipients={everyone} loadingRecipients={!everyone.length} presetIds={groupPreset} onClose={() => setGroupSheet(null)} onSaved={() => { if (groupSheet === "new" && groupPreset.length) setSelected(new Set()); setGroupSheet(null); refresh(); }} />
    {clientTenantId && <SendGiftDialog target={sendTarget} tenantId={clientTenantId} onClose={() => setSendTarget(null)} onSent={() => setSendTarget(null)} />}
    <ImportRecipientsSheet open={importOpen} endpoint={ready?.recipients ?? ""} groupsEndpoint={ready?.groups ?? ""} onClose={() => setImportOpen(false)} onDone={refresh} />
    <DeleteDialog open={!!confirm} busy={deleting} message={confirm && confirm.length > 1 ? `Are you sure you want to delete ${confirm.length} recipients?` : `Are you sure you want to delete ${confirm?.[0]?.name ?? "this recipient"}?`} onConfirm={() => void remove()} onClose={() => setConfirm(null)} />
  </>;
}
