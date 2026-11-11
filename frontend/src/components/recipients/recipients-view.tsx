"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PeopleTabs } from "@/components/modules/people-tabs";
import { Avatar } from "@/components/ui/avatar";
import { RecipientDialog, type RecipientRow, type RecipientTarget } from "./recipient-dialog";
import { GroupSheet, type RecipientGroup } from "./group-sheet";
import { ImportCsvSheet } from "./import-csv-sheet";

const PAGE_SIZE = 10;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-11-09" → { day: 9, month: 11 } without any timezone shifting. */
function parts(value: unknown): { day: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return match ? { day: Number(match[3]), month: Number(match[2]) } : null;
}
const shortDate = (value: unknown) => { const p = parts(value); return p ? `${p.day} ${MONTHS[p.month - 1]}` : "—"; };
const prettyMobile = (value: unknown) => { const text = String(value ?? ""); const m = /^\+91(\d{5})(\d{5})$/.exec(text); return m ? `+91 ${m[1]} ${m[2]}` : text || "—"; };
const initials = (name: unknown) => String(name ?? "?").split(/\s+/).map((word) => word[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
const updatedLabel = (value?: string) => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? `Updated ${d.getDate()} ${MONTHS[d.getMonth()]}` : ""; };

const card = "rounded-xl border border-line bg-white";
const outlineBtn = "press inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-slate-50";

export function RecipientsView() {
  const user = useAppSelector((state) => state.auth.user);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);

  const endpoints = useMemo(() => {
    try { return user ? { recipients: moduleConfig.recipients.endpoint(user, selectedTenantId), groups: moduleConfig["recipient-groups"].endpoint(user, selectedTenantId) } : null; }
    catch (error) { return { error: error instanceof Error ? error.message : "This account isn't linked to an organisation yet." }; }
  }, [user, selectedTenantId]);
  const ready = endpoints && !("error" in endpoints) ? endpoints : null;

  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<RecipientTarget | null>(null);
  const [groupSheet, setGroupSheet] = useState<RecipientGroup | "new" | null>(null);
  const [groupPreset, setGroupPreset] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<RecipientRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  // "Add a recipient" on Home links here with ?new=1 and opens the add dialog straight away.
  const searchParams = useSearchParams();
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (openedFromLink.current || searchParams.get("new") !== "1" || !ready) return;
    openedFromLink.current = true;
    setTarget("new");
  }, [searchParams, ready]);

  // Only the newest load may write, so a slow response from the previous tenant can't appear here.
  const latestLoad = useRef(0);
  const load = useCallback(async () => {
    const loadId = ++latestLoad.current;
    if (!ready) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [people, groupList] = await Promise.all([loadAllModuleRecords(ready.recipients), loadAllModuleRecords(ready.groups).catch(() => [])]);
      if (loadId !== latestLoad.current) return;
      setRecipients(people as RecipientRow[]);
      setGroups(groupList as unknown as RecipientGroup[]);
    } catch (err) { if (loadId === latestLoad.current) setError(getApiErrorMessage(err)); }
    finally { if (loadId === latestLoad.current) setLoading(false); }
  }, [ready]);
  useEffect(() => { void load(); }, [load]);
  // Clear the previous tenant's rows and ticks as soon as the tenant changes.
  useEffect(() => { setRecipients([]); setGroups([]); setSelected(new Set()); setPage(1); }, [ready]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? recipients.filter((r) => `${r.name ?? ""} ${r.mobileNumber ?? ""} ${r.address?.city ?? ""}`.toLowerCase().includes(q)) : recipients;
  }, [recipients, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const allOnPage = visible.length > 0 && visible.every((r) => selected.has(String(r.id)));

  const upcoming = useMemo(() => {
    const month = new Date().getMonth() + 1;
    const items: { key: string; label: string; day: number }[] = [];
    for (const r of recipients) {
      const birthday = parts(r.dateOfBirth); const anniversary = parts(r.anniversaryDate);
      if (birthday?.month === month) items.push({ key: `${r.id}-b`, label: `${r.name} · Birthday`, day: birthday.day });
      if (anniversary?.month === month) items.push({ key: `${r.id}-a`, label: `${r.name} · Anniversary`, day: anniversary.day });
    }
    return items.sort((a, b) => a.day - b.day).slice(0, 8).map((item) => ({ ...item, date: `${item.day} ${MONTHS[month - 1]}` }));
  }, [recipients]);

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const togglePage = () => setSelected((current) => { const next = new Set(current); visible.forEach((r) => (allOnPage ? next.delete(String(r.id)) : next.add(String(r.id)))); return next; });

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
    void load();
  };

  return <>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <PeopleTabs active="recipients" className="w-fit" />
      <div className="flex shrink-0 gap-3">
        <button type="button" className={outlineBtn} onClick={() => setImportOpen(true)} disabled={!ready}>Import CSV</button>
        <button type="button" disabled={!ready} onClick={() => setTarget("new")} className="press inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"><Plus size={16} /> Add recipient</button>
      </div>
    </div>

    {endpoints && "error" in endpoints && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{endpoints.error}</p>}
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"><span>We couldn&apos;t load your recipients. {error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Try again</Button></div>}

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className={`${card} overflow-hidden`} aria-label="Recipients list">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} aria-label="Search recipients" placeholder="Search name, mobile or city" className="min-h-10 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
          </div>
          {selected.size > 0 ? <div className="flex items-center gap-2 text-sm"><span className="font-medium text-ink">{selected.size} selected</span><button type="button" className={`${outlineBtn} min-h-9`} onClick={() => { setGroupPreset([...selected]); setGroupSheet("new"); }}>Create group</button><button type="button" title="Delete selected" aria-label="Delete selected recipients" className="press flex h-9 w-9 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50" onClick={() => setConfirm(recipients.filter((r) => selected.has(String(r.id))))}><Trash2 size={17} /></button><button type="button" title="Clear selection" aria-label="Clear selection" className="press flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-black/5" onClick={() => setSelected(new Set())}><X size={17} /></button></div>
            : <p className="text-sm text-muted" aria-live="polite">{loading ? "Loading…" : `${filtered.length} recipient${filtered.length === 1 ? "" : "s"}`}</p>}
        </div>

        <div className="scroll-clean overflow-x-auto border-t border-line">
          <table className="w-full min-w-[600px] text-left text-[0.8125rem]">
            <thead className="bg-slate-50/70 text-xs text-slate-500"><tr>
              <th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={togglePage} disabled={!visible.length} className="h-4 w-4 accent-brand" /></th>
              {["Name", "Mobile", "City", "Birthday"].map((label) => <th key={label} className="px-2 py-3 font-medium">{label}</th>)}
              <th className="sticky right-0 bg-slate-50 px-2 py-3 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {loading ? Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3.5"><div className="h-4 animate-pulse rounded bg-slate-100" /></td></tr>)
                : visible.map((r) => {
                  const id = String(r.id);
                  return <tr key={id} className={selected.has(id) ? "bg-brand/5" : "hover:bg-slate-50/70"}>
                    <td className="px-4 py-2.5"><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(id)} onChange={() => toggle(id)} className="h-4 w-4 accent-brand" /></td>
                    <td className="px-2 py-2.5"><button type="button" onClick={() => setTarget(r)} className="press flex items-center gap-2.5 rounded-md text-left font-medium text-ink hover:text-brand"><Avatar name={String(r.name ?? "")} src={r.avatarUrl as string | undefined} className="h-8 w-8 text-[0.6875rem]" /><span className="whitespace-nowrap capitalize">{String(r.name ?? "Unnamed")}</span></button></td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{prettyMobile(r.mobileNumber)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{r.address?.city || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-ink">{shortDate(r.dateOfBirth)}</td>
                    <td className={`sticky right-0 px-2 py-2.5 text-right shadow-[-8px_0_8px_-8px_rgba(20,24,40,0.1)] ${selected.has(id) ? "bg-[#F2F8F6]" : "bg-white"}`}><Button size="sm" variant="secondary" aria-label={`Edit ${r.name ?? "recipient"}`} onClick={() => setTarget(r)}>Edit</Button></td>
                  </tr>;
                })}
            </tbody>
          </table>
          {!loading && !visible.length && <EmptyState title={search ? "Nothing matches your search" : "No recipients yet"} description={search ? "Try a different name, number or city." : "Add the people you gift and we'll remind you before every important date."} action={!search && ready ? <Button onClick={() => setTarget("new")}><Plus size={16} /> Add recipient</Button> : undefined} />}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <p className="text-sm text-muted">Page {current} of {pages}</p>
          <div className="flex gap-2">
            <button type="button" className={`${outlineBtn} min-h-9 disabled:opacity-50`} disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</button>
            <button type="button" className={`${outlineBtn} min-h-9 disabled:opacity-50`} disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</button>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <section className={`${card} p-5`} aria-labelledby="groups-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="groups-title" className="text-[0.9375rem] font-semibold text-ink">Recipient groups</h2>
            <button type="button" className={`${outlineBtn} min-h-8 px-3 text-[0.8125rem]`} disabled={!ready} onClick={() => { setGroupPreset([]); setGroupSheet("new"); }}>New group</button>
          </div>
          <p className="mt-3 text-[0.8125rem] leading-5 text-muted">Import a group into an occasion to set its budget in one go.</p>
          <ul className="mt-4 space-y-2.5">
            {loading ? [0, 1, 2].map((i) => <li key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />)
              : groups.length ? groups.map((group) => <li key={group.id}>
                <button type="button" onClick={() => setGroupSheet(group)} className="press flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3.5 py-2.5 text-left hover:border-brand/40 hover:bg-brand/5">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{group.name}</span><span className="block text-xs text-muted">{updatedLabel(group.updatedAt)}</span></span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{group.recipientIds.length} {group.recipientIds.length === 1 ? "person" : "people"}</span>
                </button>
              </li>) : <li className="rounded-lg bg-slate-50 p-4 text-sm text-muted">No groups yet. Create one to gift many people at once.</li>}
          </ul>
          {groups.length > 0 && <Link href="/recipient-groups" className="press mt-3 flex min-h-9 items-center gap-1 text-[0.8125rem] font-medium text-brand hover:underline">Import a group into an occasion <ChevronRight size={14} /></Link>}
        </section>

        <section className={`${card} p-5`} aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className="text-[0.9375rem] font-semibold text-ink">Coming up this month</h2>
          {loading ? <div className="mt-4 h-20 animate-pulse rounded-lg bg-slate-100" /> : upcoming.length ? <ul className="mt-4 space-y-3">
            {upcoming.map((item) => <li key={item.key} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate capitalize text-slate-700">{item.label}</span><span className="shrink-0 rounded-md bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">{item.date}</span></li>)}
          </ul> : <p className="mt-3 text-sm text-muted">No birthdays or anniversaries this month.</p>}
        </section>
      </aside>
    </div>

    <RecipientDialog target={target} endpoint={ready?.recipients ?? ""} onClose={() => setTarget(null)} onPhotoChanged={() => void load()} onSaved={(addAnother) => { if (!addAnother) setTarget(null); void load(); }} onDelete={(row) => setConfirm([row])} />
    <GroupSheet group={groupSheet} endpoint={ready?.groups ?? ""} recipients={recipients} presetIds={groupPreset} onClose={() => setGroupSheet(null)} onSaved={() => { if (groupSheet === "new" && groupPreset.length) setSelected(new Set()); setGroupSheet(null); void load(); }} />
    <ImportCsvSheet open={importOpen} endpoint={ready?.recipients ?? ""} onClose={() => setImportOpen(false)} onDone={() => void load()} />
    <Sheet open={!!confirm} locked={deleting} zIndex="z-[90]" labelledBy="confirm-delete-title" className="max-w-md" onClose={() => setConfirm(null)}>
      <h2 id="confirm-delete-title" className="text-xl font-semibold text-ink">Delete {confirm && confirm.length > 1 ? `${confirm.length} recipients` : "this recipient"}?</h2>
      <p className="mt-2 text-base text-muted">{confirm && confirm.length === 1 ? `${confirm[0].name} will be removed. ` : ""}This can&apos;t be undone.</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" disabled={deleting} onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" disabled={deleting} onClick={() => void remove()}>{deleting ? "Deleting…" : "Yes, delete"}</Button></div>
    </Sheet>
  </>;
}
