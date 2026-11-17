"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUp, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Batch = { id: string; fileName?: string | null; totalRows: number; createdCount: number; failedCount: number; groupsCreated: string[]; groupsUpdated: number; status: "ACTIVE" | "REVERTED"; createdByName?: string | null; createdAt?: string; revertedAt?: string | null; revertedByName?: string | null };
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "");

/** Every recipient import, newest first. An import can be reverted, which deletes the people it created and the groups it made. */
export function ImportHistory() {
  const user = useAppSelector((state) => state.auth.user);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const tenantId = user?.platformRole === "CLIENT" ? user.tenant?.id : selectedTenantId;
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) { setBatches([]); return; }
    setError(null);
    try { setBatches(await loadAllModuleRecords(`/tenants/${tenantId}/import-batches`) as unknown as Batch[]); }
    catch (err) { setError(getApiErrorMessage(err)); setBatches([]); }
  }, [tenantId]);
  useEffect(() => { setBatches(null); void load(); }, [load]);

  const revert = async () => {
    if (!reverting || !tenantId) return;
    setBusy(true);
    try {
      const result = await mutateModule("post", `/tenants/${tenantId}/import-batches/${reverting.id}/revert`) as { recipientsRemoved?: number; groupsRemoved?: number };
      toast.success(`Import reverted. ${result?.recipientsRemoved ?? 0} recipient${result?.recipientsRemoved === 1 ? "" : "s"} removed${result?.groupsRemoved ? `, ${result.groupsRemoved} group${result.groupsRemoved === 1 ? "" : "s"} removed` : ""}.`);
      setReverting(null); await load();
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  const canRevertAny = !!tenantId;
  return <div className="scroll-clean min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {batches === null ? <div className="flex justify-center py-16"><Spinner /></div>
      : !batches.length ? <div className="rounded-2xl bg-white px-6 py-14 text-center ring-1 ring-line/70">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FileUp size={22} /></span>
        <p className="mt-3 font-semibold text-ink">No imports yet</p>
        <p className="mt-1 text-sm text-muted">When you import recipients from a file, each import is listed here and can be reverted.</p>
      </div>
      : <ul className="space-y-3">{batches.map((b, index) => <li key={b.id} className={cn("flex flex-wrap items-start gap-4 rounded-2xl border border-line/70 bg-white px-4 py-3.5", b.status === "REVERTED" && "opacity-70")}>
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><FileUp size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold text-ink">{b.fileName || "Recipient import"}
            {index === 0 && b.status === "ACTIVE" && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">Latest</span>}
            {b.status === "REVERTED" && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Reverted</span>}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {b.createdCount} recipient{b.createdCount === 1 ? "" : "s"} added
            {b.failedCount > 0 && `, ${b.failedCount} skipped`}
            {b.groupsCreated.length > 0 && `, ${b.groupsCreated.length} group${b.groupsCreated.length === 1 ? "" : "s"} created`}
            {b.groupsUpdated > 0 && `, ${b.groupsUpdated} group${b.groupsUpdated === 1 ? "" : "s"} updated`}
          </p>
          <p className="mt-1.5 text-xs text-muted">By <span className="font-medium text-slate-700">{b.createdByName || "Unknown"}</span> · {when(b.createdAt)}{b.status === "REVERTED" && b.revertedAt ? ` · Reverted by ${b.revertedByName || "Unknown"} on ${when(b.revertedAt)}` : ""}</p>
        </div>
        {b.status === "ACTIVE" && canRevertAny && b.createdCount >= 0 && <Button size="sm" variant="secondary" onClick={() => setReverting(b)}><Undo2 size={14} /> Revert</Button>}
      </li>)}</ul>}

    <Sheet open={!!reverting} locked={busy} labelledBy="revert-import-title" className="max-w-md" onClose={() => setReverting(null)}>
      <h2 id="revert-import-title" className="text-[17px] font-semibold text-ink">Revert this import?</h2>
      <p className="mt-2 text-sm text-muted">The {reverting?.createdCount ?? 0} recipient{reverting?.createdCount === 1 ? "" : "s"} added by &ldquo;{reverting?.fileName || "this import"}&rdquo; will be deleted{reverting?.groupsCreated.length ? `, and the ${reverting.groupsCreated.length} group${reverting.groupsCreated.length === 1 ? "" : "s"} it created will be removed` : ""}. People added another way are not touched.</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => setReverting(null)}>Cancel</Button>
        <Button className="bg-rose-600 hover:bg-rose-700" disabled={busy} onClick={() => void revert()}>{busy ? "Reverting…" : "Revert import"}</Button>
      </div>
    </Sheet>
  </div>;
}
