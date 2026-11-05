"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/services/api-client";
import type { RecipientGroup } from "./group-sheet";

type Row = Record<string, unknown>;
const cityOf = (row: Row) => String((row.address as Row | undefined)?.city ?? "");

/** Pick more people to put in an existing group. Only people who are not in it yet are offered. */
export function AddRecipientsSheet({ group, recipients, loading, onClose, onSubmit }: {
  group: RecipientGroup | null; recipients: Row[] | null; loading: boolean;
  onClose: () => void; onSubmit: (ids: string[], rows: Row[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (group) { setQuery(""); setPicked(new Set()); } }, [group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const available = useMemo(() => {
    const inGroup = new Set(group?.recipientIds ?? []);
    return (recipients ?? []).filter((r) => !inGroup.has(String(r.id)));
  }, [group, recipients]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? available.filter((r) => `${r.name ?? ""} ${r.mobileNumber ?? ""} ${cityOf(r)}`.toLowerCase().includes(q)) : available;
  }, [available, query]);
  const allShown = shown.length > 0 && shown.every((r) => picked.has(String(r.id)));

  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleShown = () => setPicked((current) => { const next = new Set(current); shown.forEach((r) => (allShown ? next.delete(String(r.id)) : next.add(String(r.id)))); return next; });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!picked.size) return;
    setBusy(true);
    try {
      const chosen = available.filter((r) => picked.has(String(r.id)));
      await onSubmit(chosen.map((r) => String(r.id)), chosen);
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  return <Sheet open={!!group} locked={busy} onClose={onClose} labelledBy="add-recipients-title" className="max-w-lg">
    <h2 id="add-recipients-title" className="text-xl font-semibold text-ink">Add recipients to “{group?.name}”</h2>
    <form noValidate onSubmit={submit} className="mt-4 space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search recipients to add" placeholder="Search by name, mobile or city" autoFocus className="min-h-11 w-full rounded-xl border border-line bg-slate-50 py-2 pl-10 pr-3 text-base outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15" />
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        {loading ? <div className="space-y-2 p-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
          : !shown.length ? <p className="px-4 py-10 text-center text-muted">{!available.length ? ((recipients ?? []).length ? "Everyone is already in this group." : "No recipients yet.") : "No recipients match your search."}</p>
            : <>
              <label className="flex cursor-pointer items-center gap-3 border-b border-line bg-slate-50 px-4 py-2.5 text-sm font-medium text-ink">
                <input type="checkbox" checked={allShown} onChange={toggleShown} className="h-4 w-4 accent-brand" />
                {query ? "Select all matches" : "Select all"} ({shown.length})
              </label>
              <ul className="scroll-clean max-h-72 divide-y divide-line overflow-y-auto">
                {shown.map((r) => { const id = String(r.id); return <li key={id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <input type="checkbox" checked={picked.has(id)} onChange={() => toggle(id)} className="h-4 w-4 shrink-0 accent-brand" />
                    <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{String(r.name ?? "Unnamed")}</span><span className="block truncate text-xs text-muted">{[String(r.mobileNumber ?? ""), cityOf(r)].filter(Boolean).join(" · ")}</span></span>
                  </label>
                </li>; })}
              </ul>
            </>}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-line/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted" aria-live="polite">{picked.size ? `${picked.size} selected` : "Tick the people to add."}</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !picked.size}>{busy ? "Adding…" : picked.size ? `Add ${picked.size} ${picked.size === 1 ? "recipient" : "recipients"}` : "Add recipients"}</Button>
        </div>
      </div>
    </form>
  </Sheet>;
}
