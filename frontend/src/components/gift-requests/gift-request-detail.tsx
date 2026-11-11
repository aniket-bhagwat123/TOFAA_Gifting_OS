"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { ImageUpload, sendImage } from "@/components/ui/image-upload";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { GiftRequestWizard } from "./gift-request-wizard";
import { GIFT_PURPOSES, GIFT_STYLES, INITIATED_VIA, type GiftEvent, type GiftRequest, type GiftStatus, type ProposalOption, STATUS_META, StatusChip, budgetLabel, codeOf, creditsFor, day, dayTime, inputClass, inr, labelFrom, num, shortDay, useTenantId } from "./shared";

const STEPS: Array<{ status: GiftStatus; label: string }> = [
  { status: "SUBMITTED", label: "Submitted" }, { status: "IN_REVIEW", label: "In review" }, { status: "PROPOSAL_READY", label: "Proposal ready" },
  { status: "CONFIRMED", label: "Confirmed" }, { status: "IN_PROGRESS", label: "In progress" }, { status: "DISPATCHED", label: "Dispatched" }, { status: "DELIVERED", label: "Delivered" },
];
const APPROVED: GiftStatus[] = ["CONFIRMED", "IN_PROGRESS", "DISPATCHED", "DELIVERED"];
const CANCELLABLE: GiftStatus[] = ["DRAFT", "SUBMITTED", "IN_REVIEW", "NEEDS_INFO", "PROPOSAL_READY"];
const eventTitle = (event: GiftEvent, optionCount: number) => {
  switch (event.toStatus) {
    case "DRAFT": return "Draft created";
    case "SUBMITTED": return event.fromStatus === "NEEDS_INFO" ? "Resubmitted" : "Submitted";
    case "IN_REVIEW": return "Review started";
    case "PROPOSAL_READY": return optionCount ? "Proposal published" : "Proposal ready";
    case "NEEDS_INFO": return event.fromStatus === "PROPOSAL_READY" ? "Changes requested" : "More information requested";
    case "CONFIRMED": return "Confirmed";
    case "IN_PROGRESS": return "Preparation started";
    case "DISPATCHED": return "Dispatched";
    case "DELIVERED": return "Delivered";
    default: return "Cancelled";
  }
};
const roleLabel = (role?: string | null) => (role === "KAM" ? " (KAM)" : role === "SUPER_ADMIN" ? " (TOFAA)" : "");

type Dialog = { kind: "cancel" } | { kind: "note"; action: "request-info" | "reject" } | { kind: "proposal" } | null;
type DraftOption = { name: string; description: string; price: string; imageUrl: string };

export function GiftRequestDetail({ requestId }: { requestId: string }) {
  const { tenantId, isClient } = useTenantId();
  const [request, setRequest] = useState<GiftRequest | null>(null);
  const [events, setEvents] = useState<GiftEvent[]>([]);
  const [available, setAvailable] = useState<number | null>(null);
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogNote, setDialogNote] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [editing, setEditing] = useState(useSearchParams().get("edit") === "1");
  const [proposalNote, setProposalNote] = useState("");
  const [draftOptions, setDraftOptions] = useState<DraftOption[]>([{ name: "", description: "", price: "", imageUrl: "" }]);

  const base = `/tenants/${tenantId}/gift-requests/${requestId}`;
  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [detail, history, balance, pricing] = await Promise.all([
        getModuleRecords(base, {}), getModuleRecords(`${base}/history`, {}),
        getModuleRecords(`/tenants/${tenantId}/credits/balance`, {}).catch(() => null),
        getModuleRecords(`/tenants/${tenantId}/credits/pricing`, {}, { ttl: 60_000 }).catch(() => null),
      ]);
      const next = detail as GiftRequest;
      setRequest(next);
      setEvents(((history as { items?: GiftEvent[] }).items) ?? []);
      setAvailable((balance as { availableCredits?: number } | null)?.availableCredits ?? null);
      setUnitPrice((pricing as { unitPriceMinor?: number } | null)?.unitPriceMinor ?? null);
      setSelected((current) => current ?? next.selectedOptionIndex ?? (next.proposal?.options.length === 1 ? 0 : null));
      setError(null);
    } catch (err) { setError(getApiErrorMessage(err)); }
  }, [base, tenantId]);
  useEffect(() => { void load(); }, [load]);

  const options = request?.proposal?.options ?? [];
  const reached = useMemo(() => {
    const map = new Map<GiftStatus, string>();
    for (const event of events) if (!map.has(event.toStatus)) map.set(event.toStatus, event.createdAt);
    return map;
  }, [events]);
  const publisher = [...events].reverse().find((event) => event.toStatus === "PROPOSAL_READY");

  if (!tenantId) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">Choose a client from the “Viewing” menu at the top first.</div>;
  if (error && !request) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-800">{error} <Link href="/requests" className="font-semibold underline">Back to requests</Link></div>;
  if (!request) return <div className="flex justify-center py-20"><Spinner /></div>;

  const status = request.status;
  const deciding = status === "PROPOSAL_READY" && isClient;
  const approved = APPROVED.includes(status);
  const chosenIndex = approved ? request.selectedOptionIndex ?? null : selected;
  const chosen = chosenIndex !== null ? options[chosenIndex] : undefined;
  const chosenCredits = chosen ? creditsFor(chosen.price, unitPrice) : null;
  const currentStep = status === "NEEDS_INFO" ? 1 : STEPS.findIndex((step) => step.status === status);
  const stopped = status === "CANCELLED";
  const lastReached = Math.max(-1, ...STEPS.map((step, index) => (reached.has(step.status) ? index : -1)));

  const act = async (work: () => Promise<unknown>, success: string, close?: () => void) => {
    setBusy(true);
    try { await work(); toast.success(success); close?.(); await load(); }
    catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };
  const approve = () => {
    if (options.length > 1 && selected === null) { setDecisionError("Pick one option to approve."); return; }
    setDecisionError(null);
    void act(() => mutateModule("post", `${base}/approve`, { selectedOptionIndex: selected ?? 0, note: decisionNote.trim() || undefined }), "Confirmed. TOFAA will start preparing your gift.");
  };
  const requestChanges = () => {
    if (!decisionNote.trim()) { setDecisionError("Tell TOFAA what you'd like changed."); return; }
    setDecisionError(null);
    void act(() => mutateModule("post", `${base}/request-changes`, { note: decisionNote.trim() }), "Sent. TOFAA will update the proposal.");
  };
  const submitDialog = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dialog) return;
    setDialogError(null);
    if (dialog.kind === "cancel") return void act(() => mutateModule("post", `${base}/cancel`, { note: dialogNote.trim() || undefined }), "Request cancelled.", () => setDialog(null));
    if (dialog.kind === "note") {
      if (!dialogNote.trim()) { setDialogError(dialog.action === "reject" ? "Please give a reason." : "Tell the client what you need."); return; }
      return void act(() => mutateModule("post", `/admin/gift-requests/${requestId}/${dialog.action}`, { note: dialogNote.trim() }), dialog.action === "reject" ? "Request declined and closed." : "Sent to the client.", () => setDialog(null));
    }
    const cleaned = draftOptions.filter((option) => option.name.trim() || option.price);
    if (!cleaned.length || cleaned.some((option) => !option.name.trim() || !(Number(option.price) >= 0) || option.price === "")) { setDialogError("Each option needs a name and a price."); return; }
    void act(() => mutateModule("put", `/admin/gift-requests/${requestId}/proposal`, { options: cleaned.map((option) => ({ name: option.name.trim(), description: option.description.trim() || undefined, price: Number(option.price), imageUrl: option.imageUrl || undefined })), note: proposalNote.trim() || undefined }), "Proposal sent to the client.", () => setDialog(null));
  };
  const open = (next: Dialog) => { setDialog(next); setDialogNote(""); setDialogError(null); if (next?.kind === "proposal") { setProposalNote(request.proposal?.note ?? ""); setDraftOptions(options.length ? options.map((option) => ({ name: option.name, description: option.description ?? "", price: String(option.price), imageUrl: option.imageUrl ?? "" })) : [{ name: "", description: "", price: "", imageUrl: "" }]); } };
  const openReference = async () => {
    try { const link = await getModuleRecords(`${base}/reference`, {}) as { url: string }; window.open(link.url, "_blank", "noopener"); }
    catch (err) { toast.error(getApiErrorMessage(err)); }
  };
  const creditsCard = chosenCredits !== null && available !== null ? available - chosenCredits : null;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link href="/requests" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"><ChevronLeft size={16} /> Gift requests</Link>
        <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-bold text-ink sm:text-3xl">{request.title}</h2><StatusChip status={status} /></div>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted"><span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-bold text-brand">{codeOf(request)}</span> Requested by {request.createdByName ?? "—"}{request.createdByRole === "CLIENT" ? " (EA)" : ""} · {day(request.createdAt)} · For {request.recipientName ?? "—"}</p>
      </div>
      {isClient && CANCELLABLE.includes(status) && <Button variant="secondary" onClick={() => open({ kind: "cancel" })}>Cancel request</Button>}
    </div>

    <Card className="px-6 py-5">
      <ol className="grid grid-cols-4 gap-3 sm:grid-cols-7 sm:gap-4">
        {STEPS.map((step, index) => {
          const done = stopped ? index <= lastReached : index <= currentStep;
          const date = reached.get(step.status);
          const waiting = step.status === "CONFIRMED" && status === "PROPOSAL_READY";
          const current = !stopped && index === currentStep;
          const needsInfo = status === "NEEDS_INFO" && step.status === "IN_REVIEW";
          return <li key={step.status} aria-current={current ? "step" : undefined}>
            <div className={`h-1.5 rounded-full ${done ? (stopped ? "bg-slate-400" : "bg-brand") : "bg-slate-200"} ${current ? "ring-2 ring-brand/25" : ""}`} />
            <p className={`mt-2 text-xs font-semibold sm:text-sm ${current ? "text-brand" : "text-ink"}`}>{step.label}</p>
            <p className="text-xs text-muted">{needsInfo ? (isClient ? "Needs your input" : "Waiting on client") : waiting ? (isClient ? "Waiting on you" : "Waiting on client") : date ? shortDay(date) : ""}</p>
          </li>;
        })}
      </ol>
    </Card>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 space-y-6">
        {status !== "PROPOSAL_READY" && <StatusCard request={request} isClient={isClient} busy={busy} onEdit={() => setEditing(true)}
          onSubmit={() => void act(() => mutateModule("post", `${base}/submit`, {}), "Sent to TOFAA.")} />}

        {(options.length > 0 && (status === "PROPOSAL_READY" || approved)) && <Card className="space-y-6 p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="text-lg font-semibold text-ink">Proposal from TOFAA</h3><p className="text-sm text-muted">{deciding ? "Pick one option, then approve — or ask for changes." : approved ? "You confirmed this option." : "Waiting for the client to decide."}</p></div>
            {publisher && <p className="text-sm text-muted">Published {day(publisher.createdAt)}</p>}
          </div>
          {request.proposal?.note && <blockquote className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink">“{request.proposal.note}”{publisher?.actorName && <span className="text-muted"> — {publisher.actorName}, your KAM</span>}</blockquote>}
          <div role="radiogroup" aria-label="Proposal options" className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {options.map((option: ProposalOption, index) => {
              const active = chosenIndex === index;
              return <button key={index} type="button" role="radio" aria-checked={active} disabled={!deciding} onClick={() => { setSelected(index); setDecisionError(null); }} className={`rounded-2xl border p-3 text-left transition ${active ? "border-brand ring-2 ring-brand/30" : "border-line"} ${deciding ? "hover:border-brand/60" : "cursor-default"}`}>
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">{option.imageUrl ? <img src={option.imageUrl} alt="" className="h-full w-full object-cover" /> : <Gift size={28} />}</div>
                <div className="mt-3 flex items-center justify-between"><span className="text-xs font-semibold tracking-wide text-muted">OPTION {String.fromCharCode(65 + index)}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? "border-brand" : "border-slate-300"}`}>{active && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}</span></div>
                <p className="mt-1 font-semibold text-ink">{option.name}</p>
                {option.description && <p className="mt-1 text-sm text-muted">{option.description}</p>}
                <p className="mt-2 text-sm"><strong className="text-base text-ink">{inr(option.price)}</strong> <span className="text-muted">per recipient</span></p>
              </button>;
            })}
          </div>
          {deciding && <>
            <label className="block space-y-1.5 text-sm font-medium text-ink">Note to TOFAA <span className="font-normal text-muted">(optional)</span>
              <textarea value={decisionNote} onChange={(event) => { setDecisionNote(event.target.value); setDecisionError(null); }} rows={2} maxLength={2000} placeholder="Anything to add with your decision" className={inputClass} />
            </label>
            {decisionError && <p role="alert" className="text-sm text-rose-600">{decisionError}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{chosen ? `${chosen.name} × 1 recipient` : "No option picked yet"}</p>
              <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={requestChanges}>Request changes</Button><Button disabled={busy} onClick={approve}>{busy ? "Working…" : "Confirm option"}</Button></div>
            </div>
          </>}
        </Card>}

        {!isClient && <StaffActions status={status} busy={busy} onStart={() => void act(() => mutateModule("post", `/admin/gift-requests/${requestId}/start-review`, {}), "Review started.")} onMove={(path, message) => void act(() => mutateModule("post", `/admin/gift-requests/${requestId}/${path}`, {}), message)} onOpen={open} />}

        <Card className="space-y-6 p-6 sm:p-7">
          <div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-ink">Request brief</h3>{isClient && (status === "DRAFT" || status === "NEEDS_INFO") && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</Button>}</div>
          <dl className="grid gap-x-8 gap-y-5 text-sm sm:grid-cols-3">
            <Brief label="Request ID" value={request.requestCode} /><Brief label="Recipient" value={request.recipientName} /><Brief label={request.eventId ? "Event" : "Occasion"} value={request.occasionName ?? (request.eventName ? `${request.eventName}${request.eventDate ? ` · ${shortDay(request.eventDate)}` : ""}` : null)} />
            <Brief label="Required delivery date" value={request.deliveryDate ? day(request.deliveryDate) : null} /><Brief label="Budget" value={`${budgetLabel(request)}${request.requestedCredits ? ` · ${num(request.requestedCredits)} credits` : ""}`} /><Brief label="Initiated by" value={request.initiatedVia ? labelFrom(INITIATED_VIA, request.initiatedVia) : null} />
          </dl>
          <dl className="grid gap-x-8 gap-y-5 border-t border-line/70 pt-5 text-sm sm:grid-cols-3">
            <Brief label="Relationship" value={[request.relationship, request.relationshipContext].filter(Boolean).join(" · ")} />
            <Brief label="Gift style" value={GIFT_STYLES.find((item) => item.value === request.giftStyle)?.label} />
            <Brief label="Gift purpose" value={request.giftPurpose ? labelFrom(GIFT_PURPOSES, request.giftPurpose) : null} />
            <Brief label="Interests" value={request.interests?.join(", ")} />
          </dl>
          <dl className="space-y-5 border-t border-line/70 pt-5 text-sm">
            <Brief label="Delivery address" value={request.deliveryAddress} />
            <Brief label="Gift message" value={request.message ? `“${request.message}”` : null} /><Brief label="Special instructions" value={request.specialInstructions} />
            <Brief label="Gift preferences" value={request.giftPreferences} />
            {request.referenceFile && <div><dt className="text-xs text-muted">Reference</dt><dd className="mt-0.5"><button type="button" className="font-medium text-brand hover:underline" onClick={() => void openReference()}>{request.referenceFile.fileName}</button></dd></div>}
          </dl>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card className="p-5">
          <h3 className="font-semibold text-ink">Recipient</h3>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={request.recipientName} src={request.recipientAvatarUrl} className="h-11 w-11" />
            <div className="min-w-0"><p className="truncate font-medium text-ink">{request.recipientName ?? "—"}</p><p className="truncate text-xs text-muted">{[request.relationship, request.recipientMobile].filter(Boolean).join(" · ")}</p></div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-ink">Activity</h3>
          <ol className="mt-5 space-y-5">
            {[...events].reverse().map((event) => <li key={event.id} className="flex gap-3">
              <span className="mt-1.5 flex flex-col items-center"><span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[event.toStatus].dot}`} /></span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{eventTitle(event, options.length)}</p>
                <p className="text-xs text-muted">{event.actorName ?? "TOFAA"}{roleLabel(event.actorRole)} · {dayTime(event.createdAt)}</p>
                {event.toStatus === "PROPOSAL_READY" && options.length > 0 && <p className="mt-0.5 text-xs text-muted">{options.length} option{options.length === 1 ? "" : "s"} shared.</p>}
                {event.note && <p className="mt-1 break-words rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-ink">{event.note}</p>}
              </div>
            </li>)}
          </ol>
        </Card>
        {(request.requestedCredits || chosenCredits !== null) && <Card className="p-5">
          <h3 className="font-semibold text-ink">Credits</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">{approved ? "Credits used" : "Requested"}</dt><dd className="font-semibold tabular-nums text-ink">{request.requestedCredits ? num(request.requestedCredits) : "—"}</dd></div>
            {chosenCredits !== null && <div className="flex justify-between"><dt className="text-muted">Selected option</dt><dd className="font-semibold tabular-nums text-ink">{num(chosenCredits)}</dd></div>}
            {creditsCard !== null && !approved && <div className="flex justify-between border-t border-line/70 pt-2"><dt className="text-muted">Available after</dt><dd className={`font-bold tabular-nums ${creditsCard < 0 ? "text-rose-700" : "text-ink"}`}>{num(creditsCard)}</dd></div>}
          </dl>
          {creditsCard !== null && creditsCard < 0 && !approved && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">Your balance doesn't cover this option. <Link href="/credits" className="font-semibold underline">Request credits</Link></p>}
        </Card>}
      </aside>
    </div>

    {editing && <GiftRequestWizard requestId={requestId} onClose={() => setEditing(false)} onChanged={() => void load()} />}

    <Sheet open={!!dialog} locked={busy} labelledBy="gr-dialog-title" className={dialog?.kind === "proposal" ? "max-w-2xl" : "max-w-md"} onClose={() => setDialog(null)}>
      {dialog && <form noValidate onSubmit={submitDialog} className="space-y-5">
        <h2 id="gr-dialog-title" className="text-2xl font-semibold text-ink">{dialog.kind === "cancel" ? "Cancel this request?" : dialog.kind === "proposal" ? "Share a proposal" : dialog.action === "reject" ? "Reject request" : "Ask the client for information"}</h2>
        {dialog.kind === "proposal" ? <>
          <label className="block space-y-1.5 text-sm font-medium text-ink">Note to the client <span className="font-normal text-muted">(optional)</span><textarea value={proposalNote} onChange={(event) => setProposalNote(event.target.value)} rows={2} maxLength={2000} className={inputClass} /></label>
          <div className="space-y-3">
            {draftOptions.map((option, index) => <div key={index} className="space-y-2 rounded-xl border border-line p-3">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold tracking-wide text-muted">OPTION {String.fromCharCode(65 + index)}</span>{draftOptions.length > 1 && <button type="button" aria-label="Remove option" onClick={() => setDraftOptions((current) => current.filter((_, i) => i !== index))} className="text-muted hover:text-rose-700"><Trash2 size={15} /></button>}</div>
              <ImageUpload shape="square" maxMb={5} size="h-16 w-20 text-base" name={option.name || "Gift"} src={option.imageUrl || null} label={`Photo for option ${String.fromCharCode(65 + index)}`}
                onUpload={async (file) => { const saved = await sendImage<{ url: string }>("post", `/admin/gift-requests/${requestId}/proposal-image`, file); setDraftOptions((current) => current.map((item, i) => (i === index ? { ...item, imageUrl: saved.url } : item))); }}
                onRemove={async () => setDraftOptions((current) => current.map((item, i) => (i === index ? { ...item, imageUrl: "" } : item)))} />
              <input value={option.name} onChange={(event) => setDraftOptions((current) => current.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} placeholder="Gift name" maxLength={180} className={inputClass} />
              <textarea value={option.description} onChange={(event) => setDraftOptions((current) => current.map((item, i) => (i === index ? { ...item, description: event.target.value } : item)))} placeholder="Short description" rows={2} maxLength={1000} className={inputClass} />
              <input type="number" min={0} step="any" value={option.price} onChange={(event) => setDraftOptions((current) => current.map((item, i) => (i === index ? { ...item, price: event.target.value } : item)))} placeholder="Price per recipient (₹)" className={inputClass} />
            </div>)}
            {draftOptions.length < 5 && <Button type="button" variant="secondary" size="sm" onClick={() => setDraftOptions((current) => [...current, { name: "", description: "", price: "", imageUrl: "" }])}><Plus size={15} /> Add option</Button>}
          </div>
        </> : <label className="block space-y-1.5 text-sm font-medium text-ink">{dialog.kind === "cancel" ? <>Reason <span className="font-normal text-muted">(optional)</span></> : dialog.action === "reject" ? "Reason" : "What do you need from them?"}
          <textarea value={dialogNote} onChange={(event) => { setDialogNote(event.target.value); setDialogError(null); }} rows={3} maxLength={2000} autoFocus className={inputClass} /></label>}
        {dialogError && <p role="alert" className="text-sm text-rose-600">{dialogError}</p>}
        <div className="flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setDialog(null)}>{dialog.kind === "cancel" ? "Keep request" : "Close"}</Button>
          <Button type="submit" variant={dialog.kind === "cancel" || (dialog.kind === "note" && dialog.action === "reject") ? "danger" : "primary"} disabled={busy}>{busy ? "Working…" : dialog.kind === "cancel" ? "Yes, cancel" : dialog.kind === "proposal" ? "Send proposal" : dialog.action === "reject" ? "Reject" : "Send"}</Button>
        </div>
      </form>}
    </Sheet>
  </div>;
}

function Brief({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 whitespace-pre-line text-ink">{value}</dd></div>;
}

function StatusCard({ request, isClient, busy, onSubmit, onEdit }: { request: GiftRequest; isClient: boolean; busy: boolean; onSubmit: () => void; onEdit: () => void }) {
  const { status } = request;
  const copy: Partial<Record<GiftStatus, { title: string; text: string; tone: string }>> = {
    DRAFT: { title: "This request is still a draft", text: isClient ? "Send it to TOFAA when you're ready. You can keep editing until then." : "The client hasn't sent this yet.", tone: "border-line" },
    SUBMITTED: { title: "Sent to TOFAA", text: "The team will pick it up shortly and start preparing options.", tone: "border-line" },
    IN_REVIEW: { title: "TOFAA is preparing your options", text: "You'll get a proposal to choose from. We'll keep this page up to date.", tone: "border-line" },
    NEEDS_INFO: { title: isClient ? "TOFAA needs a bit more from you" : "Waiting on the client", text: request.statusNote ?? "Please update the request and send it again.", tone: "border-amber-200 bg-amber-50/60" },
    CANCELLED: { title: "This request was cancelled", text: request.statusNote ?? "No further action is needed.", tone: "border-line" },
    CONFIRMED: { title: "Confirmed", text: "Your choice is confirmed. TOFAA will start preparing the gift.", tone: "border-emerald-200 bg-emerald-50/60" },
    IN_PROGRESS: { title: "TOFAA is preparing your gift", text: "We'll let you know when it's on its way.", tone: "border-violet-200 bg-violet-50/60" },
    DISPATCHED: { title: "Your gift is on its way", text: "It has been dispatched and is heading to the recipient.", tone: "border-sky-200 bg-sky-50/60" },
    DELIVERED: { title: "Delivered", text: "The gift reached the recipient. We hope they love it.", tone: "border-emerald-200 bg-emerald-50/60" },
  };
  const item = copy[status]; if (!item) return null;
  return <Card className={`flex flex-wrap items-center justify-between gap-4 p-6 ${item.tone}`}>
    <div className="min-w-0"><h3 className="text-lg font-semibold text-ink">{item.title}</h3><p className="mt-1 text-sm text-muted">{item.text}</p></div>
    {isClient && (status === "DRAFT" || status === "NEEDS_INFO") && <div className="flex gap-2">
      <Button variant="secondary" onClick={onEdit}><Pencil size={15} /> Edit</Button>
      <Button disabled={busy} onClick={onSubmit}>{busy ? "Sending…" : status === "DRAFT" ? "Send to TOFAA" : "Send again"}</Button>
    </div>}
  </Card>;
}

function StaffActions({ status, busy, onStart, onMove, onOpen }: { status: GiftStatus; busy: boolean; onStart: () => void; onMove: (path: string, message: string) => void; onOpen: (dialog: Dialog) => void }) {
  const canReject = status === "IN_REVIEW" || status === "NEEDS_INFO";
  if (!(status === "SUBMITTED" || status === "IN_REVIEW" || status === "PROPOSAL_READY" || status === "CONFIRMED" || status === "IN_PROGRESS" || status === "DISPATCHED" || canReject)) return null;
  return <Card className="flex flex-wrap items-center justify-between gap-3 border-brand/30 bg-brand-soft/40 p-5">
    <div><h3 className="font-semibold text-ink">Team actions</h3><p className="text-sm text-muted">Move this request along.</p></div>
    <div className="flex flex-wrap gap-2">
      {status === "SUBMITTED" && <Button disabled={busy} onClick={onStart}>Start review</Button>}
      {status === "CONFIRMED" && <Button disabled={busy} onClick={() => onMove("start-fulfilment", "Marked in progress.")}>Start preparing</Button>}
      {status === "IN_PROGRESS" && <Button disabled={busy} onClick={() => onMove("dispatch", "Marked as dispatched.")}>Mark dispatched</Button>}
      {status === "DISPATCHED" && <Button disabled={busy} onClick={() => onMove("deliver", "Marked as delivered.")}>Mark delivered</Button>}
      {status === "IN_REVIEW" && <Button onClick={() => onOpen({ kind: "proposal" })}>Share proposal</Button>}
      {(status === "SUBMITTED" || status === "IN_REVIEW" || status === "PROPOSAL_READY") && <Button variant="secondary" onClick={() => onOpen({ kind: "note", action: "request-info" })}>Ask for info</Button>}
      {canReject && <Button variant="secondary" className="text-rose-700" onClick={() => onOpen({ kind: "note", action: "reject" })}>Decline</Button>}
    </div>
  </Card>;
}
