"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, Gift, Pencil, Repeat, Star, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { cn } from "@/lib/utils";
import { STATUS_META as REQUEST_STATUS, day, inr } from "@/components/gift-requests/shared";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { StatusPill, Subject } from "./parts";
import { KIND_META, actionFor, countdownText, type ActionKind, type OverviewItem } from "./types";

const PRIORITY_CHIP = { NORMAL: "bg-slate-100 text-slate-700", HIGH: "bg-orange-50 text-orange-700", VIP: "bg-violet-50 text-violet-700" } as const;
const PRIORITY_LABEL = { NORMAL: "Normal", HIGH: "High", VIP: "VIP" } as const;

/** One occasion in full: who, when, where it stands, the requests made from it, and what to do next. */
export function OccasionDetails({ item, tenantId, canPlan, onClose, onAct, onEdit, onDeleted }: {
  item: OverviewItem | null; tenantId: string; canPlan: boolean; onClose: () => void;
  onAct: (item: OverviewItem, kind: ActionKind) => void; onEdit: (item: OverviewItem) => void; onDeleted: () => void;
}) {
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  // Birthdays and anniversaries read from a person's profile are changed there; a company occasion is editable only if it is the client's own.
  const editPath = item?.eventId ? `/tenants/${tenantId}/events/${item.eventId}` : item?.occasionId && !item.isGlobal ? `/tenants/${tenantId}/occasions/${item.occasionId}` : null;
  const action = item ? actionFor(item) : null;

  const remove = async () => {
    if (!item || !editPath || !window.confirm(`Delete ${item.sourceType === "COMPANY" ? item.name : `${item.name}'s ${item.label}`}? This can't be undone.`)) return;
    setBusy(true);
    try { await mutateModule("delete", editPath); toast.success("Occasion deleted."); onDeleted(); }
    catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  return <SidePanel open={!!item} labelledBy="occ-details-title" onClose={onClose} locked={busy}>
    {item && action && <div className="space-y-5">
      <div className="flex items-start gap-4">
        <Subject item={item} size="h-16 w-16 text-xl" />
        <div className="min-w-0 flex-1 pt-1">
          <h2 id="occ-details-title" className="truncate text-xl font-bold capitalize text-ink">{item.name}</h2>
          <p className="truncate text-sm text-muted">{item.sourceType === "COMPANY" ? (item.isGlobal ? "TOFAA occasion" : "Company Event") : item.relationship ?? item.label}</p>
          <div className="mt-2"><StatusPill status={item.status} /></div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-black/5"><X size={20} /></button>
      </div>

      <div className="flex items-center gap-4 rounded-2xl bg-brand-soft p-4">
        <span aria-hidden className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", KIND_META[item.kind].tint)}>{(() => { const Icon = KIND_META[item.kind].icon; return <Icon size={20} />; })()}</span>
        <div><p className="text-sm text-slate-700">{item.label}</p><p className="text-xl font-bold text-ink">{day(item.date)}</p><p className={cn("text-sm", item.daysAway >= 0 && item.daysAway <= 7 ? "font-medium text-amber-700" : "text-muted")}>{countdownText(item.daysAway)}</p></div>
      </div>

      {(item.description || item.notes) && <section>
        <h3 className="text-sm font-semibold text-ink">About this occasion</h3>
        <p className="mt-1 text-sm text-slate-700">{item.description ?? (item.sourceType === "RECIPIENT" ? `${item.label} for ${item.name}.` : "")}</p>
      </section>}

      <section className="border-t border-line/70 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Planning details</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3"><dt className="flex items-center gap-2.5 text-slate-700"><Star size={16} aria-hidden />Priority</dt><dd><span className={cn("rounded-full px-3 py-1 text-xs font-semibold", PRIORITY_CHIP[item.priority])}>{PRIORITY_LABEL[item.priority]}</span></dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="flex items-center gap-2.5 text-slate-700"><Repeat size={16} aria-hidden />Repeat</dt><dd className="text-ink">{item.repeatAnnually ? "Every year" : "Does not repeat"}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="flex items-center gap-2.5 text-slate-700"><Gift size={16} aria-hidden />Budget</dt><dd className="font-semibold tabular-nums text-ink">{item.budget ? inr(item.budget) : "—"}</dd></div>
          <div className="flex items-start justify-between gap-3"><dt className="flex items-center gap-2.5 text-slate-700"><StickyNote size={16} aria-hidden />Notes</dt><dd className="max-w-[60%] text-right text-ink">{item.notes || "—"}</dd></div>
        </dl>
      </section>

      <section className="border-t border-line/70 pt-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">Gift requests</h3>
        {item.requests.length ? <ul className="divide-y divide-line/60 rounded-xl border border-line/70">
          {item.requests.map((request) => {
            const meta = REQUEST_STATUS[request.status as keyof typeof REQUEST_STATUS];
            return <li key={request.id}><Link href={`/requests/${request.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"><span className="font-semibold text-ink">{request.requestCode ?? "Request"}</span><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", meta?.chip ?? "bg-slate-100 text-slate-700")}>{meta?.label ?? request.status}</span></Link></li>;
          })}
        </ul> : <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-muted">No gift request has been made for this date yet.</p>}
      </section>

      <div className="space-y-3 pt-1">
        {action.kind !== "details" && <Button size="lg" className="w-full" disabled={(action.kind === "plan" || action.kind === "create") && !canPlan} onClick={() => onAct(item, action.kind)}><Gift size={18} /> {action.label}</Button>}
        {canPlan && editPath && <button type="button" onClick={() => onEdit(item)} className="press flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl border border-brand/60 bg-white text-base font-semibold text-brand hover:bg-brand-soft"><Pencil size={17} />Edit Occasion</button>}
        {!item.eventId && item.sourceType === "RECIPIENT" && <p className="flex items-center gap-2 text-xs text-muted"><CalendarDays size={14} aria-hidden />This date comes from the person's profile. Change it there.</p>}
        {canPlan && editPath && <div className="text-center">
          <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-ink">More options <ChevronDown size={16} className={cn("transition-transform", more && "rotate-180")} /></button>
          {more && <div className="mt-2"><button type="button" disabled={busy} onClick={remove} className="press inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} />Delete occasion</button></div>}
        </div>}
      </div>
    </div>}
  </SidePanel>;
}
