"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";

export type DefaultBudget = { targetType: "GROUP" | "RECIPIENT"; targetId: string; groupId?: string | null; budgetMode: string; budgetCredits: number };
export type BudgetTarget = {
  kind: "group" | "recipient"; id: string; name: string; /** For a person: the group the budget is for. A person's budget belongs to one group. */ groupId?: string;
  /** Person in a shared pool: the most they can be given, the pool, their automatic share, what others already took, and how many others are still on the automatic split. */ max?: number; poolCredits?: number; suggested?: number; taken?: number; waiting?: number;
  /** Group: the least a shared pool can be, so everyone already budgeted still fits. */ min?: number;
};

const field = "min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15";

/** Save a budget on a group or a person. It is the default used when gifts are sent to them. */
export function BudgetSheet({ target, current, spendBase, onClose, onSaved }: {
  target: BudgetTarget | null; current?: DefaultBudget; spendBase: string; onClose: () => void; onSaved: () => void;
}) {
  const isPerson = target?.kind === "recipient";
  const [mode, setMode] = useState("PER_RECIPIENT");
  const [credits, setCredits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMode(current?.budgetMode ?? "PER_RECIPIENT"); setCredits(current ? String(current.budgetCredits) : target?.suggested ? String(target.suggested) : ""); setError(null); }, [target, current]);

  const reset = async () => {
    setBusy(true);
    try { await mutateModule("delete", `${spendBase}/default-budgets`, undefined, { targetType: "RECIPIENT", targetId: target!.id, groupId: target!.groupId ?? "" }); toast.success("Back to the equal split."); onSaved(); }
    catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(credits);
    if (!Number.isInteger(amount) || amount <= 0) { setError("Enter a budget above 0."); return; }
    if (isPerson && target?.max !== undefined && amount > target.max) { setError(target.max < 1 ? `The ${target.poolCredits}-credit shared pool is fully used by others. Raise the group budget first.` : `Keep it within the ${target.poolCredits}-credit shared pool. You can give up to ${target.max} credits.`); return; }
    if (!isPerson && mode === "SHARED_POOL" && target?.min !== undefined && amount < target.min) { setError(`The pool must cover what is already given to members. Enter at least ${target.min} credits.`); return; }
    setBusy(true);
    try {
      await mutateModule("put", `${spendBase}/default-budgets`, { targetType: isPerson ? "RECIPIENT" : "GROUP", targetId: target!.id, groupId: isPerson ? target!.groupId : undefined, budgetMode: isPerson ? "PER_RECIPIENT" : mode, budgetCredits: amount });
      toast.success("Budget saved.");
      onSaved();
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  return <Sheet open={!!target} locked={busy} onClose={onClose} labelledBy="budget-title" className="max-w-md">
    <h2 id="budget-title" className="text-xl font-semibold capitalize text-ink">Set budget · {target?.name}</h2>
    <form noValidate onSubmit={save} className="mt-5 space-y-5">
      {!isPerson && <label className="block space-y-1.5 text-sm font-medium text-ink">Budget type
        <select value={mode} onChange={(event) => setMode(event.target.value)} className={field}><option value="PER_RECIPIENT">Per person</option><option value="SHARED_POOL">Shared pool</option></select>
      </label>}
      <label className="block space-y-1.5 text-sm font-medium text-ink">Budget credits
        <input type="number" min={1} autoFocus value={credits} onChange={(event) => { setCredits(event.target.value); setError(null); }} className={field} />
        {isPerson && target?.poolCredits !== undefined && Number(credits) > 0 && !!target.waiting && <span className="block text-sm font-normal text-muted">The other {target.waiting} {target.waiting === 1 ? "member shares" : "members share"} the remaining {Math.max(0, target.poolCredits - (target.taken ?? 0) - Number(credits))} credits equally.</span>}
        {error && <span role="alert" className="block text-sm font-normal text-rose-600">{error}</span>}
      </label>
      <div className="flex items-center justify-end gap-3 border-t border-line/70 pt-5">{isPerson && !!current && target?.poolCredits !== undefined && <Button type="button" variant="ghost" className="mr-auto" disabled={busy} onClick={() => void reset()}>Reset to equal split</Button>}<Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save budget"}</Button></div>
    </form>
  </Sheet>;
}
