"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { control, table } from "@/components/ui/table-styles";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { PeopleTabs } from "@/components/modules/people-tabs";
import { BudgetSheet, type BudgetTarget, type DefaultBudget } from "@/components/occasions/occasion-budget-sheet";
import { AvailableCreditsStrip } from "@/components/occasions/available-credits";
import { GroupSheet, type RecipientGroup } from "./group-sheet";
import { AddRecipientsSheet } from "./add-recipients-sheet";

type Row = Record<string, unknown>;
/** The people of one open group, as fetched for exactly the IDs the group had at that moment. */
interface Members { signature: string; status: "loading" | "ready" | "error"; rows: Row[]; error?: string }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IDS_PER_REQUEST = 50;

const shortDate = (value: unknown) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(value ?? "")); return m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}` : "—"; };
const prettyMobile = (value: unknown) => { const text = String(value ?? ""); const m = /^\+91(\d{5})(\d{5})$/.exec(text); return m ? `+91 ${m[1]} ${m[2]}` : text || "—"; };
const updated = (value?: string) => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? `Updated ${d.getDate()} ${MONTHS[d.getMonth()]}` : ""; };
const people = (count: number) => `${count} ${count === 1 ? "recipient" : "recipients"}`;
const signatureOf = (group: RecipientGroup) => group.recipientIds.join(",");
const cityOf = (row?: Row) => String((row?.address as Row | undefined)?.city ?? "—");

/** Asks the recipients list for just these IDs (in small batches, so the address stays short). */
async function fetchMembers(endpoint: string, ids: string[]): Promise<Row[]> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) batches.push(ids.slice(i, i + IDS_PER_REQUEST));
  const parts = await Promise.all(batches.map((batch) => loadAllModuleRecords(`${endpoint}?recipientIds=${batch.join(",")}`)));
  return parts.flat();
}



/**
 * What one person may spend. Their own budget if they have one; otherwise
 * or an equal share of what is left of the group's total budget (any odd credits go to the first people).
 */
const memberBudget = (budgets: Record<string, DefaultBudget>, group: RecipientGroup, recipientId: string) => {
  const groupBudget = budgets[`GROUP:${group.id}`];
  if (!groupBudget) return undefined;
  const own = budgets[`RECIPIENT:${group.id}:${recipientId}`]?.budgetCredits;
  if (own !== undefined) return own;
  if (groupBudget.budgetMode === "PER_RECIPIENT") return groupBudget.budgetCredits;
  const sharing = group.recipientIds.filter((id) => budgets[`RECIPIENT:${group.id}:${id}`] === undefined);
  const left = Math.max(0, groupBudget.budgetCredits - group.recipientIds.reduce((sum, id) => sum + (budgets[`RECIPIENT:${group.id}:${id}`]?.budgetCredits ?? 0), 0));
  const index = sharing.indexOf(recipientId);
  return Math.floor(left / sharing.length) + (index < left % sharing.length ? 1 : 0);
};
/** The group's total: the pool for a shared budget, otherwise the sum of everyone's amount. */
const groupTotal = (budgets: Record<string, DefaultBudget>, group: RecipientGroup) => {
  const own = budgets[`GROUP:${group.id}`];
  if (own?.budgetMode === "SHARED_POOL") return own.budgetCredits;
  const sum = group.recipientIds.reduce((total, id) => total + (memberBudget(budgets, group, id) ?? 0), 0);
  return sum || undefined;
};
const credits = (value: number) => value.toLocaleString("en-IN");

/** Recipient groups: open a group to load and see its people, search them, or remove someone. */
export function GroupsPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const user = useAppSelector((state) => state.auth.user);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);

  const urls = useMemo(() => {
    try {
      if (!user) return null;

      return { groups: moduleConfig["recipient-groups"].endpoint(user, selectedTenantId), recipients: moduleConfig.recipients.endpoint(user, selectedTenantId) };
    } catch (error) { return { error: error instanceof Error ? error.message : "This account isn't linked to an organisation yet." }; }
  }, [user, selectedTenantId]);
  const ready = urls && !("error" in urls) ? urls : null;

  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [recipientCount, setRecipientCount] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<Record<string, Members>>({});
  const [memberSearch, setMemberSearch] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupSheet, setGroupSheet] = useState<RecipientGroup | "new" | null>(null);
  const [everyone, setEveryone] = useState<Row[] | null>(null);
  const [everyoneLoading, setEveryoneLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<RecipientGroup | null>(null);
  const [budgetFor, setBudgetFor] = useState<BudgetTarget | null>(null);
  const [budgets, setBudgets] = useState<Record<string, DefaultBudget>>({});
  // Spend budgets are for the client themselves, not for staff.
  const canBudget = user?.platformRole === "CLIENT";


  // Only the newest load may write, so a slow answer for the previous client never appears here.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const loadId = ++latest.current;
    if (!ready) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [list, summary] = await Promise.all([
        loadAllModuleRecords(ready.groups),
        getModuleRecords(`${ready.recipients}/summary`, {}).catch(() => null),
      ]);
      if (loadId === latest.current) {
        setGroups(list as unknown as RecipientGroup[]);
        if (summary) setRecipientCount((summary as { active?: number }).active);
      }
    } catch (err) { if (loadId === latest.current) setError(getApiErrorMessage(err)); }
    finally { if (loadId === latest.current) setLoading(false); }
  }, [ready]);
  useEffect(() => { void load(); }, [load]);
  const spendBase = ready ? ready.groups.replace(/\/groups$/, "") : null;
  const loadBudgets = useCallback(async () => {
    if (!canBudget || !spendBase) return;
    try { const rows = await getModuleRecords(`${spendBase}/default-budgets`, {}) as DefaultBudget[]; setBudgets(Object.fromEntries((rows ?? []).map((row) => [row.targetType === "RECIPIENT" ? `RECIPIENT:${row.groupId}:${row.targetId}` : `GROUP:${row.targetId}`, row]))); }
    catch { /* budgets are optional; the list still works without them */ }
  }, [canBudget, spendBase]);
  useEffect(() => { void loadBudgets(); }, [loadBudgets]);

  // In a shared pool, personal budgets have to stay inside the pool and leave at least 1 credit for everyone else.
  const personalOf = (groupId: string, id: string) => budgets[`RECIPIENT:${groupId}:${id}`]?.budgetCredits;
  const openPersonBudget = (group: RecipientGroup, id: string, name: string) => {
    const pool = budgets[`GROUP:${group.id}`];
    if (pool?.budgetMode !== "SHARED_POOL") { setBudgetFor({ kind: "recipient", id, name, groupId: group.id, suggested: memberBudget(budgets, group, id) }); return; }
    const others = group.recipientIds.filter((other) => other !== id);
    const taken = others.reduce((sum, other) => sum + (personalOf(group.id, other) ?? 0), 0);
    const waiting = others.filter((other) => personalOf(group.id, other) === undefined).length;
    setBudgetFor({ kind: "recipient", id, name, groupId: group.id, max: pool.budgetCredits - taken - waiting, poolCredits: pool.budgetCredits, suggested: memberBudget(budgets, group, id), taken, waiting });
  };
  const openGroupBudget = (group: RecipientGroup) => {
    const given = group.recipientIds.reduce((sum, id) => sum + (personalOf(group.id, id) ?? 0), 0);
    const waiting = group.recipientIds.filter((id) => personalOf(group.id, id) === undefined).length;
    setBudgetFor({ kind: "group", id: group.id, name: group.name, min: given + waiting });
  };
  useEffect(() => { setGroups([]); setOpen(new Set()); setMembers({}); setMemberSearch({}); setEveryone(null); }, [ready]);

  const loadMembers = useCallback(async (group: RecipientGroup) => {
    if (!ready) return;
    const signature = signatureOf(group);
    setMembers((current) => ({ ...current, [group.id]: { signature, status: "loading", rows: [] } }));
    try {
      const rows = await fetchMembers(ready.recipients, group.recipientIds);
      setMembers((current) => current[group.id]?.signature === signature ? { ...current, [group.id]: { signature, status: "ready", rows } } : current);
    } catch (err) {
      setMembers((current) => current[group.id]?.signature === signature ? { ...current, [group.id]: { signature, status: "error", rows: [], error: getApiErrorMessage(err) } } : current);
    }
  }, [ready]);

  // A group's people are fetched only once the group is opened, and again only if its members change.
  useEffect(() => {
    for (const id of open) {
      const group = groups.find((g) => g.id === id);
      if (group && members[id]?.signature !== signatureOf(group)) void loadMembers(group);
    }
  }, [open, groups, members, loadMembers]);

  // The full list is needed only to pick people (edit group, add recipients), so it is fetched once, when first needed.
  const ensureEveryone = useCallback(async () => {
    if (!ready || everyone || everyoneLoading) return;
    setEveryoneLoading(true);
    try { setEveryone(await loadAllModuleRecords(ready.recipients)); }
    catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setEveryoneLoading(false); }
  }, [ready, everyone, everyoneLoading]);
  const openSheet = (target: RecipientGroup | "new") => { setGroupSheet(target); void ensureEveryone(); };
  const openAdd = (group: RecipientGroup) => { setAddingTo(group); void ensureEveryone(); };

  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups; }, [groups, search]);
  const uniquePeople = new Set(groups.flatMap((g) => g.recipientIds)).size;
  // One group open at a time: opening another closes the one that was open.
  const toggle = (id: string) => setOpen((current) => (current.has(id) ? new Set<string>() : new Set([id])));

  const removeMember = async (group: RecipientGroup, recipientId: string, name: string) => {
    if (!ready) return;
    setRemoving(recipientId);
    const remaining = group.recipientIds.filter((id) => id !== recipientId);
    try {
      await mutateModule("put", `${ready.groups}/${group.id}`, { name: group.name, recipientIds: remaining });
      // Drop them from what is already on screen, so the refreshed group doesn't trigger another fetch.
      setMembers((current) => current[group.id] ? { ...current, [group.id]: { ...current[group.id], signature: remaining.join(","), rows: current[group.id].rows.filter((r) => String(r.id) !== recipientId) } } : current);
      toast.success(`${name || "Recipient"} removed from ${group.name}.`);
      await load();
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setRemoving(null); }
  };

  const addMembers = async (group: RecipientGroup, ids: string[], rows: Row[]) => {
    if (!ready) return;
    const next = [...group.recipientIds, ...ids];
    await mutateModule("put", `${ready.groups}/${group.id}`, { name: group.name, recipientIds: next });
    // Show them straight away from what we already have, so the refreshed group doesn't trigger another fetch.
    setMembers((current) => current[group.id]?.status === "ready" ? { ...current, [group.id]: { ...current[group.id], signature: next.join(","), rows: [...current[group.id].rows, ...rows] } } : current);
    toast.success(`${people(ids.length)} added to ${group.name}.`);
    setAddingTo(null);
    await load();
  };

  return <>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {embedded ? <span /> : <PeopleTabs active="recipient-groups" counts={{ recipients: recipientCount, groups: groups.length }} className="w-fit" />}
      <Button disabled={!ready} onClick={() => openSheet("new")}><Plus size={16} /> New group</Button>
    </div>

    {urls && "error" in urls && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{urls.error}</p>}
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"><span>We couldn&apos;t load your groups. {error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Try again</Button></div>}

    <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Recipient groups">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="relative w-full sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search groups" placeholder="Search groups" className={`${control} w-full pl-9`} />
        </div>
        <p className="text-sm text-muted" aria-live="polite">{loading ? "Loading…" : `${groups.length} ${groups.length === 1 ? "group" : "groups"} · ${people(uniquePeople)}`}</p>
      </div>

      {loading ? <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>
        : !filtered.length ? <p className="px-6 py-12 text-center text-muted">{search ? "No groups match your search." : "No groups yet. Create one to gift many people at once."}</p>
          : <ul>
            {filtered.map((group) => {
              const expanded = open.has(group.id);
              const state = members[group.id];
              const found = new Map((state?.rows ?? []).map((r) => [String(r.id), r]));
              const query = (memberSearch[group.id] ?? "").trim().toLowerCase();
              const shown = group.recipientIds
                .map((id) => ({ id, row: found.get(id) }))
                .filter(({ row }) => !query || (row && `${row.name ?? ""} ${row.mobileNumber ?? ""} ${cityOf(row)}`.toLowerCase().includes(query)));
              const canRemove = group.recipientIds.length > 1;
              return <li key={group.id} className="border-t border-line first:border-t-0">
                <button type="button" aria-expanded={expanded} onClick={() => toggle(group.id)} className="press flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-slate-50/60 sm:px-6">
                  {expanded ? <ChevronDown className="size-5 shrink-0 text-muted" /> : <ChevronRight className="size-5 shrink-0 text-muted" />}
                  <span className="min-w-0 flex-1"><span className="block truncate text-base font-semibold text-ink">{group.name}</span><span className="block text-sm text-muted">{people(group.recipientIds.length)}</span></span>{canBudget && groupTotal(budgets, group) === undefined && <span className="hidden shrink-0 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 sm:block">Budget not set</span>}{canBudget && groupTotal(budgets, group) !== undefined && <span className="hidden shrink-0 rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand sm:block">{credits(groupTotal(budgets, group)!)} credits{budgets[`GROUP:${group.id}`]?.budgetMode === "SHARED_POOL" ? " · shared" : ""}</span>}
                  <span className="hidden shrink-0 text-sm text-muted sm:block">{updated(group.updatedAt)}</span>
                </button>

                {expanded && <div className="space-y-4 px-4 pb-5 sm:px-6 md:pl-[3.70rem]">
                  <div className="flex flex-col gap-3 rounded-xl border border-line bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:max-w-xs">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="search" value={memberSearch[group.id] ?? ""} onChange={(event) => setMemberSearch((current) => ({ ...current, [group.id]: event.target.value }))} aria-label={`Search recipients in ${group.name}`} placeholder="Search recipients" className="min-h-10 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {canBudget && <Button size="sm" variant="secondary" onClick={() => openGroupBudget(group)}>{budgets[`GROUP:${group.id}`] ? "Edit budget" : "Set budget"}</Button>}
                      <Button size="sm" onClick={() => openAdd(group)}><Plus size={14} /> Add recipients</Button>
                      <Button size="sm" variant="secondary" onClick={() => openSheet(group)}>Edit group</Button>
                    </div>
                  </div>

                  {!state || state.status === "loading" ? <div className="space-y-2 rounded-xl border border-line p-4" aria-busy="true">{Array.from({ length: Math.min(group.recipientIds.length, 4) }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
                    : state.status === "error" ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"><span>We couldn&apos;t load these recipients. {state.error}</span><Button size="sm" variant="secondary" onClick={() => void loadMembers(group)}>Try again</Button></div>
                      : !shown.length ? <p className="rounded-xl border border-line px-4 py-8 text-center text-muted">No recipients match your search.</p>
                        : <div className="overflow-hidden rounded-xl border border-line">
                          <table className={`${table.root} hidden md:table`}>
                            <thead className={table.head}><tr className={table.headRow}>
                              <th className={table.th}>Recipient</th><th className={table.th}>Mobile</th><th className={table.th}>City</th><th className={table.th}>Birthday</th>{canBudget && <th className={table.th}>Budget</th>}<th className={`${table.th} text-right`}>Actions</th>
                            </tr></thead>
                            <tbody>
                              {shown.map(({ id, row }) => <tr key={id} className={table.rowCompact}>
                                <td className={`${table.td} text-sm font-semibold capitalize text-ink`}>{row ? String(row.name ?? "Unnamed") : <span className="text-muted">Removed recipient</span>}</td>
                                <td className={`${table.td} whitespace-nowrap tabular-nums text-slate-600`}>{prettyMobile(row?.mobileNumber)}</td>
                                <td className={`${table.td} text-slate-600`}>{cityOf(row)}</td>
                                <td className={`${table.td} whitespace-nowrap tabular-nums text-slate-600`}>{shortDate(row?.dateOfBirth)}</td>
                                {canBudget && <td className={`${table.td} whitespace-nowrap font-semibold tabular-nums text-ink`}>{memberBudget(budgets, group, id) !== undefined ? `${credits(memberBudget(budgets, group, id)!)} credits` : <span className="font-normal text-muted">Not set</span>}</td>}
                                <td className={`${table.td} space-x-2 whitespace-nowrap text-right`}>{canBudget && row && <Button size="sm" variant="secondary" disabled={!budgets[`GROUP:${group.id}`]} title={budgets[`GROUP:${group.id}`] ? undefined : "Set the group budget first"} onClick={() => openPersonBudget(group, id, String(row.name ?? "Recipient"))}>{memberBudget(budgets, group, id) !== undefined ? "Edit budget" : "Set budget"}</Button>}<Button size="sm" variant="secondary" className="text-rose-700" disabled={removing === id || !canRemove} title={canRemove ? undefined : "A group needs at least one recipient"} aria-label={`Remove ${String(row?.name ?? "recipient")} from ${group.name}`} onClick={() => void removeMember(group, id, String(row?.name ?? ""))}>Remove</Button></td>
                              </tr>)}
                            </tbody>
                          </table>
                          <ul className="divide-y divide-line md:hidden">
                            {shown.map(({ id, row }) => <li key={id} className="space-y-3 p-4">
                              <p className="font-medium capitalize text-ink">{row ? String(row.name ?? "Unnamed") : <span className="text-muted">Removed recipient</span>}</p>
                              <dl className="grid grid-cols-3 gap-2 text-sm"><div><dt className="text-muted">Mobile</dt><dd className="font-medium text-ink">{prettyMobile(row?.mobileNumber)}</dd></div><div><dt className="text-muted">City</dt><dd className="font-medium text-ink">{cityOf(row)}</dd></div><div><dt className="text-muted">Birthday</dt><dd className="font-medium text-ink">{shortDate(row?.dateOfBirth)}</dd></div>{canBudget && <div className="col-span-3"><dt className="text-muted">Budget</dt><dd className="font-medium text-ink">{memberBudget(budgets, group, id) !== undefined ? `${credits(memberBudget(budgets, group, id)!)} credits` : "Not set"}</dd></div>}</dl>
                              {canBudget && row && <Button size="sm" variant="secondary" className="w-full" disabled={!budgets[`GROUP:${group.id}`]} onClick={() => openPersonBudget(group, id, String(row.name ?? "Recipient"))}>{memberBudget(budgets, group, id) !== undefined ? "Edit budget" : "Set budget"}</Button>}
                              <Button size="sm" variant="secondary" className="w-full text-rose-700" disabled={removing === id || !canRemove} onClick={() => void removeMember(group, id, String(row?.name ?? ""))}>Remove</Button>
                            </li>)}
                          </ul>
                        </div>}
                </div>}
              </li>;
            })}
          </ul>}
      {canBudget && !loading && <AvailableCreditsStrip budgeted={groups.reduce((sum, group) => sum + (groupTotal(budgets, group) ?? 0), 0)} />}
    </section>

    {canBudget && ready && <BudgetSheet target={budgetFor} current={budgetFor ? budgets[budgetFor.kind === "group" ? `GROUP:${budgetFor.id}` : `RECIPIENT:${budgetFor.groupId}:${budgetFor.id}`] : undefined} spendBase={spendBase!} onClose={() => setBudgetFor(null)} onSaved={() => { setBudgetFor(null); void loadBudgets(); }} />}
    <AddRecipientsSheet group={addingTo} recipients={everyone} loading={everyoneLoading || (!!addingTo && !everyone)} onClose={() => setAddingTo(null)} onSubmit={(ids, rows) => addMembers(addingTo!, ids, rows)} />
    <GroupSheet group={groupSheet} endpoint={ready?.groups ?? ""} recipients={everyone ?? []} loadingRecipients={everyoneLoading} onClose={() => setGroupSheet(null)} onSaved={() => { setGroupSheet(null); void load(); }} />
  </>;
}
