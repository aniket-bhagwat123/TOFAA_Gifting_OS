"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, FileText, Gift, Heart, Lightbulb, MapPin, MessageSquare, Pencil, Plus, ShieldCheck, Star, Target, UploadCloud, User, Users, X } from "lucide-react";
import { toast } from "sonner";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { clearRequestCache, getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { api, getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { RequiredMark } from "@/components/ui/required-mark";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { GIFT_PURPOSES, GIFT_STYLES, INITIATED_VIA, INTERESTS, RELATIONSHIPS, type GiftRequest, budgetLabel, budgetText, codeOf, creditsFor, day, labelFrom, num, parseBudget, shortDay, useTenantId } from "./shared";

type Row = Record<string, unknown>;
type Style = "PREMIUM" | "THOUGHTFUL" | "PERSONALISED";
type Form = {
  recipientId: string; source: "occasion" | "event"; occasionId: string; eventId: string; deliveryDate: string;
  budgetMode: "SPECIFIC" | "TOFAA_RECOMMEND"; budget: string; initiatedVia: string;
  relationship: string; relationshipContext: string; interests: string[]; giftStyle: Style | ""; specialInstructions: string;
  deliveryAddress: string | null; message: string; giftPurpose: string;
};
type Errors = Partial<Record<"recipientId" | "source" | "deliveryDate" | "budget" | "initiatedVia" | "relationship" | "file", string>>;

const EMPTY: Form = {
  recipientId: "", source: "occasion", occasionId: "", eventId: "", deliveryDate: "", budgetMode: "SPECIFIC", budget: "", initiatedVia: "",
  relationship: "", relationshipContext: "", interests: [], giftStyle: "", specialInstructions: "", deliveryAddress: null, message: "", giftPurpose: "",
};
const STEPS = [
  { title: "Basic Details", hint: "Recipient, occasion & budget" },
  { title: "Gift Preferences", hint: "Your preferences" },
  { title: "Additional Details", hint: "Address, message & more" },
];
const FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_FILE = 5 * 1024 * 1024;
const control = "min-h-10 w-full rounded-[9px] border bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:bg-slate-50 disabled:text-slate-400";
const today = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); };
const isoToday = () => { const now = today(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const addressOf = (row?: Row) => {
  const address = row?.address as Row | undefined;
  if (!address) return "";
  const city = [address.city, address.postalCode].filter(Boolean).join(" – ");
  return [address.addressLine1, address.addressLine2, city, address.state].filter(Boolean).join(", ");
};

function Label({ id, children, required, optional }: { id: string; children: ReactNode; required?: boolean; optional?: boolean }) {
  return <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{children}{required && <RequiredMark />}{optional && <span className="ml-1 font-normal text-muted">(optional)</span>}</label>;
}
const FieldError = ({ id, message }: { id: string; message?: string }) => (message ? <p id={id} role="alert" className="mt-1.5 text-sm text-rose-600">{message}</p> : null);

function Section({ icon, title, subtitle, children, className }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-line/70 bg-emerald-50/30 p-5", className)}>
    <div className="mb-4 flex items-start gap-3"><span className="mt-0.5 text-brand">{icon}</span><div><h3 className="text-lg font-semibold text-ink">{title}</h3><p className="text-sm text-muted">{subtitle}</p></div></div>
    {children}
  </section>;
}

function Summary({ rows }: { rows: Array<{ icon: ReactNode; label: string; value?: string | null }> }) {
  return <aside aria-label="Request summary" className="space-y-4">
    <div className="rounded-2xl border border-line/70 bg-emerald-50/30">
      <h3 className="flex items-center gap-3 border-b border-line/60 px-5 py-4 text-lg font-semibold text-ink"><FileText size={20} className="text-brand" /> Request Summary</h3>
      <dl className="space-y-4 p-5">
        {rows.map((row) => <div key={row.label} className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">{row.icon}</span><div className="min-w-0"><dt className="text-xs text-muted">{row.label}</dt><dd className="break-words text-sm font-semibold text-ink">{row.value || "—"}</dd></div></div>)}
      </dl>
    </div>
    <p className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3.5 text-sm text-amber-900"><Lightbulb size={20} className="mt-0.5 shrink-0 text-amber-500" /><span><strong>Tip:</strong> You can always update the budget and details later.</span></p>
  </aside>;
}

export function GiftRequestWizard({ requestId, onClose, onChanged }: { requestId?: string; onClose: () => void; onChanged: () => void }) {
  const { user, tenantId, isClient } = useTenantId();
  const router = useRouter();
  const params = useSearchParams();

  const [recipients, setRecipients] = useState<Row[]>([]);
  const [occasions, setOccasions] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [unitPriceMinor, setUnitPriceMinor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setFormState] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>(requestId);
  const [dirty, setDirty] = useState(false);
  const [done, setDone] = useState<GiftRequest | null>(null);
  const [customInterest, setCustomInterest] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedFile, setSavedFile] = useState<GiftRequest["referenceFile"]>(null);
  const [removeSaved, setRemoveSaved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editing = !!requestId;

  const setForm = (patch: Partial<Form>) => { setFormState((current) => ({ ...current, ...patch })); setDirty(true); };
  const clear = (...keys: Array<keyof Errors>) => setErrors((current) => { const next = { ...current }; keys.forEach((key) => delete next[key]); return next; });

  useEffect(() => {
    if (!user || !tenantId) { setLoading(false); return; }
    let cancelled = false;
    const base = `/tenants/${tenantId}`;
    (async () => {
      try {
        const [recipientRows, occasionRows, eventRows, pricing, existing] = await Promise.all([
          loadAllModuleRecords(moduleConfig.recipients.endpoint(user, tenantId)),
          loadAllModuleRecords(`${base}/occasions`),
          loadAllModuleRecords(`${base}/events`),
          getModuleRecords(`${base}/credits/pricing`, {}, { ttl: 60_000 }).catch(() => null),
          requestId ? getModuleRecords(`${base}/gift-requests/${requestId}`, {}) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setRecipients(recipientRows); setOccasions(occasionRows.filter((item) => item.isActive !== false)); setEvents(eventRows);
        setUnitPriceMinor((pricing as { unitPriceMinor?: number } | null)?.unitPriceMinor ?? null);
        if (existing) {
          const request = existing as GiftRequest;
          setFormState({
            recipientId: request.recipientId, source: request.eventId ? "event" : "occasion", occasionId: request.occasionId ?? "", eventId: request.eventId ?? "",
            deliveryDate: request.deliveryDate ?? "", budgetMode: request.budgetMode ?? "SPECIFIC", budget: budgetText(request.budgetMin ?? request.requestedBudget, request.budgetMax ?? request.requestedBudget),
            initiatedVia: request.initiatedVia ?? "", relationship: request.relationship ?? "", relationshipContext: request.relationshipContext ?? "", interests: request.interests ?? [],
            giftStyle: request.giftStyle ?? "", specialInstructions: request.specialInstructions ?? "", deliveryAddress: request.deliveryAddress ?? null, message: request.message ?? "", giftPurpose: request.giftPurpose ?? "",
          });
          setSavedFile(request.referenceFile ?? null);
        } else {
          // Opened from "Send gift" on an upcoming birthday or event.
          const presetEvent = params.get("eventId");
          const event = presetEvent ? eventRows.find((row) => String(row.id) === presetEvent) : undefined;
          const person = recipientRows.find((row) => String(row.id) === (params.get("recipientId") ?? String(event?.recipientId ?? "")));
          setFormState((current) => ({
            ...current, recipientId: person ? String(person.id) : "",
            ...(event ? { source: "event" as const, eventId: String(event.id), deliveryDate: event.eventDate && String(event.eventDate) >= isoToday() ? String(event.eventDate) : "" } : {}),
          }));
        }
      } catch (err) { if (!cancelled) setLoadError(getApiErrorMessage(err)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tenantId, requestId]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const recipient = recipients.find((row) => String(row.id) === form.recipientId);
  const eventOptions = useMemo(() => events.filter((event) => !form.recipientId || !event.recipientId || String(event.recipientId) === form.recipientId), [events, form.recipientId]);
  const sourceOptions = [
    ...occasions.map((item) => ({ id: `occasion:${String(item.id)}`, label: `${String(item.occasionName)}${item.occasionDate ? ` · ${shortDay(String(item.occasionDate))}` : ""}`, searchText: "occasion" })),
    ...eventOptions.map((item) => ({ id: `event:${String(item.id)}`, label: `${String(item.eventName)}${item.eventDate ? ` · ${shortDay(String(item.eventDate))}` : ""}`, searchText: "event" })),
  ];
  const sourceValue = form.source === "occasion" ? (form.occasionId ? `occasion:${form.occasionId}` : "") : (form.eventId ? `event:${form.eventId}` : "");
  const sourceName = String(form.source === "occasion" ? occasions.find((row) => String(row.id) === form.occasionId)?.occasionName ?? "" : events.find((row) => String(row.id) === form.eventId)?.eventName ?? "");
  const address = form.deliveryAddress ?? addressOf(recipient);
  const budget = parseBudget(form.budget);
  const credits = budget && budget !== "invalid" ? creditsFor(budget.max, unitPriceMinor) : null;
  const budgetSummary = form.budgetMode === "TOFAA_RECOMMEND" ? "TOFAA to recommend" : budget && budget !== "invalid" ? budgetLabel({ budgetMode: "SPECIFIC", budgetMin: budget.min, budgetMax: budget.max }) : "";
  const initiatedLabel = labelFrom(INITIATED_VIA, form.initiatedVia);

  const validate = (target: number) => {
    const next: Errors = {};
    if (target === 0) {
      if (!form.recipientId) next.recipientId = "Please choose who the gift is for.";
      if (!sourceValue) next.source = "Please choose an occasion or event.";
      if (!form.deliveryDate) next.deliveryDate = "Please pick the required delivery date.";
      else if (form.deliveryDate < isoToday()) next.deliveryDate = "The delivery date can't be in the past.";
      if (form.budgetMode === "SPECIFIC") {
        if (!form.budget.trim()) next.budget = "Enter a budget, or let TOFAA recommend one.";
        else if (budget === "invalid") next.budget = "Enter an amount like 50,000 or a range like 3,00,000 – 5,00,000.";
      }
      if (!form.initiatedVia) next.initiatedVia = "Tell us how this gift was initiated.";
    }
    if (target === 1 && !form.relationship) next.relationship = "Please choose your relationship with the recipient.";
    setErrors((current) => ({ ...current, ...next }));
    return Object.keys(next).length === 0;
  };
  const firstInvalidStep = () => [0, 1].find((index) => !validate(index));

  const go = (target: number) => {
    if (target > step) for (let index = step; index < target; index += 1) if (!validate(index)) { setStep(index); return; }
    setStep(target);
  };

  /** Creates the draft (or updates it), then attaches or removes the reference file. Returns the saved request. */
  const persist = async (): Promise<GiftRequest> => {
    const base = `/tenants/${tenantId}/gift-requests`;
    const personName = String(recipient?.name ?? "");
    const name = sourceName || "Gift";
    const range = budget && budget !== "invalid" && form.budgetMode === "SPECIFIC" ? budget : null;
    const body: Record<string, unknown> = {
      title: `${name} gift${personName ? ` for ${personName}` : ""}`,
      purpose: form.giftPurpose ? `${labelFrom(GIFT_PURPOSES, form.giftPurpose)} gift for ${name.toLowerCase()}` : `A thoughtful gift for ${name.toLowerCase()}`,
      recipientId: form.recipientId,
      occasionId: form.source === "occasion" ? form.occasionId : null, eventId: form.source === "event" ? form.eventId : null,
      deliveryDate: form.deliveryDate || null, budgetMode: form.budgetMode,
      budgetMin: range?.min ?? null, budgetMax: range?.max ?? null, requestedBudget: range?.max ?? null, requestedCredits: credits,
      initiatedVia: form.initiatedVia || null, relationship: form.relationship || null, relationshipContext: form.relationshipContext.trim() || null,
      interests: form.interests, giftStyle: form.giftStyle || null, deliveryAddress: address.trim() || null,
      message: form.message.trim() || null, giftPurpose: form.giftPurpose || null, specialInstructions: form.specialInstructions.trim() || null,
    };
    let saved: GiftRequest;
    if (draftId) saved = await mutateModule("patch", `${base}/${draftId}`, body) as GiftRequest;
    else {
      saved = await mutateModule("post", base, Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null))) as GiftRequest;
      setDraftId(saved.id);
    }
    if (file) {
      const { data } = await api.post(`${base}/${saved.id}/reference`, file, { params: { fileName: file.name }, headers: { "Content-Type": file.type }, timeout: 60_000 });
      clearRequestCache();
      saved = (data?.data ?? data) as GiftRequest;
      setFile(null); setSavedFile(saved.referenceFile ?? null);
    } else if (removeSaved) {
      saved = await mutateModule("delete", `${base}/${saved.id}/reference`) as GiftRequest;
      setRemoveSaved(false);
    }
    return saved;
  };

  const saveDraft = async () => {
    if (!form.recipientId || !sourceValue) {
      setStep(0);
      setErrors({ ...(!form.recipientId && { recipientId: "Choose who the gift is for to save a draft." }), ...(!sourceValue && { source: "Choose an occasion or event to save a draft." }) });
      return;
    }
    if (form.deliveryDate && form.deliveryDate < isoToday()) { setStep(0); setErrors({ deliveryDate: "The delivery date can't be in the past." }); return; }
    if (budget === "invalid" && form.budgetMode === "SPECIFIC") { setStep(0); setErrors({ budget: "Enter an amount like 50,000 or a range like 3,00,000 – 5,00,000." }); return; }
    setBusy("draft");
    try {
      const saved = await persist();
      toast.success(`Draft saved (${codeOf(saved)}). Continue from Gift requests anytime.`);
      onChanged(); setDirty(false); onClose();
    } catch (err) { toast.error(getApiErrorMessage(err)); setBusy(null); }
  };

  const submit = async () => {
    const bad = firstInvalidStep();
    if (bad !== undefined) { setStep(bad); return; }
    setBusy("submit");
    try {
      const saved = await persist();
      const sent = await mutateModule("post", `/tenants/${tenantId}/gift-requests/${saved.id}/submit`, {}) as GiftRequest;
      setDone(sent); setDirty(false); onChanged();
    } catch (err) { toast.error(`${getApiErrorMessage(err)}${draftId ? " Your draft is saved." : ""}`); onChanged(); }
    finally { setBusy(null); }
  };

  const next = () => { if (validate(step)) setStep((value) => Math.min(value + 1, 2)); };
  const requestClose = () => { if (busy) return; if (dirty && !done) { setConfirmClose(true); return; } onClose(); };

  const chooseFile = (picked?: File | null) => {
    if (!picked) return;
    if (!FILE_TYPES.includes(picked.type)) { setErrors((current) => ({ ...current, file: "Attach a JPG, PNG or PDF file." })); return; }
    if (picked.size > MAX_FILE) { setErrors((current) => ({ ...current, file: "That file is over 5 MB. Choose a smaller one." })); return; }
    clear("file"); setFile(picked); setDirty(true);
  };

  const content = (() => {
    if (!tenantId) return <div role="alert" className="m-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">{isClient ? "Your account isn't linked to an organisation yet. Please contact TOFAA." : "Choose a client from the “Viewing” menu at the top first."}</div>;
    if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;
    if (loadError) return <div role="alert" className="m-8 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-800">{loadError}</div>;
    return null;
  })();

  // ───────────── confirmation screen ─────────────
  if (done) {
    return <Sheet open onClose={onClose} labelledBy="gr-wizard-title" className="max-w-xl text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={36} /></span>
      <h2 id="gr-wizard-title" className="mt-5 text-2xl font-bold text-ink">Gift request submitted</h2>
      <p className="mt-1.5 text-base text-muted">Thank you. TOFAA has received your request and will start curating options.</p>
      <p className="mx-auto mt-5 inline-block rounded-full bg-brand-soft px-5 py-2 text-lg font-bold tracking-wide text-brand" aria-label={`Request ID ${done.requestCode ?? ""}`}>{codeOf(done)}</p>
      <dl className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-5 text-left text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted">Recipient</dt><dd className="font-semibold text-ink">{done.recipientName ?? "—"}</dd></div>
        <div><dt className="text-xs text-muted">Occasion</dt><dd className="font-semibold text-ink">{done.occasionName ?? done.eventName ?? "—"}</dd></div>
        <div><dt className="text-xs text-muted">Delivery date</dt><dd className="font-semibold text-ink">{done.deliveryDate ? day(done.deliveryDate) : "—"}</dd></div>
        <div><dt className="text-xs text-muted">Budget</dt><dd className="font-semibold text-ink">{budgetLabel(done)}</dd></div>
      </dl>
      <ol className="mt-5 space-y-2 text-left text-sm text-muted">
        <li className="flex gap-3"><span className="font-semibold text-brand">1.</span> The TOFAA team reviews your request.</li>
        <li className="flex gap-3"><span className="font-semibold text-brand">2.</span> You get a proposal with gift options to choose from.</li>
        <li className="flex gap-3"><span className="font-semibold text-brand">3.</span> You confirm, and we take care of delivery.</li>
      </ol>
      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
        <Button variant="secondary" onClick={() => { onClose(); router.push(`/requests/${done.id}`); }}>View request</Button>
        <Button onClick={onClose}><Check size={18} /> Done</Button>
      </div>
    </Sheet>;
  }

  return <><Sheet open onClose={requestClose} locked={!!busy} labelledBy="gr-wizard-title" className="flex max-w-5xl flex-col overflow-hidden !p-0">
    <header className="flex items-start gap-4 px-6 pb-4 pt-6 sm:px-8">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Gift size={26} /></span>
      <div className="min-w-0 flex-1"><h2 id="gr-wizard-title" className="text-2xl font-bold text-ink">{editing ? "Edit gift request" : "New gift request"}</h2>
        <p className="text-sm text-muted">{step === 0 ? "Share a few details. TOFAA will curate thoughtful gift options for you." : "Share more details about the gift. TOFAA will curate the best options for you."}</p></div>
      <button type="button" aria-label="Close" onClick={requestClose} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-slate-100 hover:text-ink"><X size={20} /></button>
    </header>

    {content ?? <form noValidate onSubmit={(event) => { event.preventDefault(); if (step < 2) next(); else void submit(); }} className="flex min-h-0 flex-1 flex-col">
      <ol aria-label="Progress" className="grid grid-cols-3 gap-2 border-y border-line/60 px-6 py-4 sm:px-8">
        {STEPS.map((item, index) => {
          const complete = index < step;
          return <li key={item.title} aria-current={index === step ? "step" : undefined}>
            <button type="button" onClick={() => go(index)} className="flex w-full items-center gap-3 text-left">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", complete ? "bg-brand text-white" : index === step ? "bg-brand text-white ring-4 ring-brand/15" : "border border-line bg-white text-muted")}>{complete ? <Check size={17} /> : index + 1}</span>
              <span className="hidden min-w-0 sm:block"><span className={cn("block truncate text-sm font-semibold", index <= step ? "text-ink" : "text-muted")}>{item.title}</span><span className="block truncate text-xs text-muted">{item.hint}</span></span>
            </button>
          </li>;
        })}
      </ol>

      <div className="scroll-clean min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
        {step === 0 && <div className="space-y-5">
          <h3 className="text-xl font-bold text-ink">1. Basic details</h3>
          <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
            <div>
              <span id="gr-recipient" className="mb-1.5 block text-sm font-medium text-ink">Who is it for?<RequiredMark /></span>
              <SearchableSelect name="recipientId" labelId="gr-recipient" options={recipients.map((row) => ({ id: String(row.id), label: String(row.name ?? "Unnamed"), searchText: `${String((row.address as Row | undefined)?.city ?? "")} ${String(row.mobileNumber ?? "")}` }))} value={form.recipientId} loading={false} loadError={null} placeholder="Search or select a recipient" error={errors.recipientId} required onChange={(value) => { setForm({ recipientId: value, ...(form.source === "event" ? { eventId: "" } : {}), deliveryAddress: null }); clear("recipientId"); }} />
              <FieldError id="gr-recipient-error" message={errors.recipientId} />
              <Link href="/recipients?new=1" target="_blank" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"><Plus size={15} /> Add new recipient</Link>
            </div>
            <div>
              <span id="gr-source" className="mb-1.5 block text-sm font-medium text-ink">Occasion or event<RequiredMark /></span>
              <SearchableSelect name="source" labelId="gr-source" options={sourceOptions} value={sourceValue} loading={false} loadError={null} placeholder="Select an occasion or event" error={errors.source} required onChange={(value) => { const [kind, id] = value.split(":"); setForm(kind === "event" ? { source: "event", eventId: id, occasionId: "" } : { source: "occasion", occasionId: id, eventId: "" }); clear("source"); }} />
              <FieldError id="gr-source-error" message={errors.source} />
            </div>
            <DatePickerField id="gr-delivery" label="Required delivery date" required value={form.deliveryDate} onChange={(value) => { setForm({ deliveryDate: value }); clear("deliveryDate"); }} error={errors.deliveryDate} minDate={today()} placeholder="Select date" />
            <div>
              <Label id="gr-budget" required={form.budgetMode === "SPECIFIC"}>Gift budget (₹)</Label>
              <input id="gr-budget" inputMode="decimal" autoComplete="off" disabled={form.budgetMode === "TOFAA_RECOMMEND"} value={form.budget} onChange={(event) => { setForm({ budget: event.target.value }); clear("budget"); }} aria-invalid={!!errors.budget} aria-describedby={errors.budget ? "gr-budget-error" : undefined} placeholder={form.budgetMode === "TOFAA_RECOMMEND" ? "TOFAA will recommend a budget" : "e.g. 3,00,000 – 5,00,000"} className={cn(control, errors.budget ? "border-rose-400" : "border-line")} />
              <FieldError id="gr-budget-error" message={errors.budget} />
              {!errors.budget && credits !== null && form.budgetMode === "SPECIFIC" && <p className="mt-1.5 text-xs text-muted">About {num(credits)} credits at the upper end of your budget.</p>}
              <label className="mt-2 flex min-h-8 cursor-pointer items-center gap-2 text-sm text-ink"><input type="checkbox" checked={form.budgetMode === "TOFAA_RECOMMEND"} onChange={(event) => { setForm({ budgetMode: event.target.checked ? "TOFAA_RECOMMEND" : "SPECIFIC" }); clear("budget"); }} className="h-4 w-4 rounded border-line accent-brand" /> Let TOFAA recommend a budget</label>
            </div>
          </div>

          <fieldset className="grid gap-4 rounded-2xl border border-line/70 bg-emerald-50/40 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <legend className="sr-only">Budget preference</legend>
            <div className="flex items-start gap-3"><Target size={22} className="mt-0.5 shrink-0 text-brand" /><div><p className="font-semibold text-ink">Budget preference</p><p className="text-sm text-muted">You can set a specific budget or let TOFAA suggest the right value based on the occasion and relationship.</p></div></div>
            <div className="space-y-2.5">
              {([["SPECIFIC", "I have a budget"], ["TOFAA_RECOMMEND", "Let TOFAA recommend"]] as const).map(([value, label]) => <label key={value} className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm text-ink"><input type="radio" name="budgetMode" checked={form.budgetMode === value} onChange={() => { setForm({ budgetMode: value }); clear("budget"); }} className="h-4 w-4 accent-brand" />{label}</label>)}
            </div>
          </fieldset>

          <div className="rounded-2xl border border-line/70 p-5">
            <div className="flex items-start gap-3"><MessageSquare size={22} className="mt-1 shrink-0 text-brand" /><div className="min-w-0 flex-1">
              <Label id="gr-initiated" required>How was this gift initiated?</Label>
              <div className="relative">
                <select id="gr-initiated" value={form.initiatedVia} onChange={(event) => { setForm({ initiatedVia: event.target.value }); clear("initiatedVia"); }} aria-invalid={!!errors.initiatedVia} aria-describedby={errors.initiatedVia ? "gr-initiated-error" : undefined} className={cn(control, "appearance-none pr-10", !form.initiatedVia && "text-slate-400", errors.initiatedVia ? "border-rose-400" : "border-line")}>
                  <option value="">Select option</option>
                  {INITIATED_VIA.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
              </div>
              <FieldError id="gr-initiated-error" message={errors.initiatedVia} />
              <p className="mt-1.5 text-xs text-muted">This helps us understand the context and serves as a reference for the request.</p>
            </div></div>
          </div>
        </div>}

        {step === 1 && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-5">
            <Section icon={<Heart size={24} />} title="Relationship & Context" subtitle="Help us understand the relationship for a more thoughtful gift.">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label id="gr-relationship" required>Relationship with recipient</Label>
                  <div className="relative">
                    <select id="gr-relationship" value={form.relationship} onChange={(event) => { setForm({ relationship: event.target.value }); clear("relationship"); }} aria-invalid={!!errors.relationship} aria-describedby={errors.relationship ? "gr-relationship-error" : undefined} className={cn(control, "appearance-none pr-10", !form.relationship && "text-slate-400", errors.relationship ? "border-rose-400" : "border-line")}>
                      <option value="">Select relationship</option>
                      {[...RELATIONSHIPS, ...(form.relationship && !RELATIONSHIPS.includes(form.relationship) ? [form.relationship] : [])].map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
                  </div>
                  <FieldError id="gr-relationship-error" message={errors.relationship} />
                </div>
                <div>
                  <Label id="gr-context" optional>Context</Label>
                  <input id="gr-context" value={form.relationshipContext} maxLength={200} onChange={(event) => setForm({ relationshipContext: event.target.value })} placeholder="e.g. Long standing partner, key client…" className={cn(control, "border-line")} />
                </div>
              </div>
            </Section>

            <Section icon={<Star size={24} />} title="Gift Preferences" subtitle="Share any preferences or interests, if known.">
              <div className="grid gap-5 md:grid-cols-[1fr_auto]">
                <div>
                  <p id="gr-interests" className="mb-2 text-sm font-medium text-ink">Interests / Preferences</p>
                  <div role="group" aria-labelledby="gr-interests" className="flex flex-wrap gap-2">
                    {[...INTERESTS, ...form.interests.filter((item) => !INTERESTS.includes(item))].map((item) => {
                      const on = form.interests.includes(item);
                      return <button key={item} type="button" aria-pressed={on} onClick={() => setForm({ interests: on ? form.interests.filter((value) => value !== item) : [...form.interests, item].slice(0, 12) })} className={cn("flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition", on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-slate-50")}>{item}{on && <Check size={14} />}</button>;
                    })}
                    {customInterest === null ? <button type="button" onClick={() => setCustomInterest("")} className="flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50">Other <Plus size={14} /></button>
                      : <input autoFocus value={customInterest} maxLength={40} aria-label="Other interest" placeholder="Type and press Enter" onChange={(event) => setCustomInterest(event.target.value)} onBlur={() => setCustomInterest(null)}
                        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const text = customInterest.trim(); if (text && !form.interests.some((item) => item.toLowerCase() === text.toLowerCase())) setForm({ interests: [...form.interests, text].slice(0, 12) }); setCustomInterest(null); } if (event.key === "Escape") { event.stopPropagation(); setCustomInterest(null); } }}
                        className="min-h-10 w-44 rounded-full border border-brand bg-white px-4 text-sm outline-none focus:ring-4 focus:ring-brand/15" />}
                  </div>
                </div>
                <div>
                  <p id="gr-style" className="mb-2 text-sm font-medium text-ink">Preferred Gift Style</p>
                  <div role="radiogroup" aria-labelledby="gr-style" className="grid grid-cols-3 gap-2">
                    {GIFT_STYLES.map((item) => {
                      const on = form.giftStyle === item.value;
                      const Icon = item.value === "PREMIUM" ? Gift : item.value === "THOUGHTFUL" ? Heart : Star;
                      return <button key={item.value} type="button" role="radio" aria-checked={on} onClick={() => setForm({ giftStyle: on ? "" : item.value })} className={cn("relative flex min-h-[5.5rem] min-w-[6.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition", on ? "border-brand bg-white text-ink ring-2 ring-brand/30" : "border-line bg-white/70 text-ink hover:bg-white")}>
                        <span className={cn("absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full border", on ? "border-brand bg-brand text-white" : "border-slate-300")}>{on && <Check size={11} />}</span>
                        <Icon size={22} className="text-brand" />{item.label}
                      </button>;
                    })}
                  </div>
                </div>
              </div>
            </Section>

            <Section icon={<FileText size={24} />} title="Special Instructions" subtitle="Any specific instructions for TOFAA team.">
              <textarea id="gr-instructions" aria-label="Special instructions" value={form.specialInstructions} maxLength={500} rows={3} onChange={(event) => setForm({ specialInstructions: event.target.value })} placeholder="e.g. Prefer a premium brand, avoid certain categories, add a personal note…" className={cn(control, "resize-none border-line")} />
              <p className="mt-1 text-right text-xs text-muted">{form.specialInstructions.length} / 500</p>
            </Section>
          </div>
          <Summary rows={[
            { icon: <User size={17} />, label: "Recipient", value: String(recipient?.name ?? "") }, { icon: <Gift size={17} />, label: "Occasion", value: sourceName },
            { icon: <CalendarDays size={16} />, label: "Delivery Date", value: form.deliveryDate ? day(form.deliveryDate) : "" }, { icon: <span className="text-base font-bold">₹</span>, label: "Budget Range", value: budgetSummary },
            { icon: <MessageSquare size={17} />, label: "Initiated By", value: initiatedLabel },
          ]} />
        </div>}

        {step === 2 && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-4">
            <Section icon={<MapPin size={24} />} title="Delivery Address" subtitle="Where should we deliver the gift?">
              {form.deliveryAddress === null && !address ? <p className="mb-3 text-sm text-muted">This recipient has no address saved. Enter where the gift should go.</p> : null}
              <AddressRow value={address} onChange={(value) => setForm({ deliveryAddress: value })} startEditing={!address} />
            </Section>
            <div className="grid gap-4 md:grid-cols-2">
              <Section icon={<MessageSquare size={22} />} title="Personal Message" subtitle="Add a personal note with the gift.">
                <textarea aria-label="Personal message" value={form.message} maxLength={300} rows={4} onChange={(event) => setForm({ message: event.target.value })} placeholder="e.g. Warm birthday wishes from the team." className={cn(control, "resize-none border-line")} />
                <p className="mt-1 text-right text-xs text-muted">{form.message.length} / 300</p>
              </Section>
              <Section icon={<FileText size={22} />} title="Attach Reference" subtitle="Share any reference image or document.">
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" tabIndex={-1} aria-label="Attach reference file" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
                <div className="flex gap-3">
                  <div role="button" tabIndex={0} onClick={() => fileInput.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.current?.click(); } }}
                    onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}
                    className={cn("flex min-h-[7.5rem] flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 text-center text-sm transition", dragging ? "border-brand bg-brand-soft" : "border-line bg-slate-50/60 hover:bg-slate-50")}>
                    <UploadCloud size={24} className="text-brand" /><span className="text-ink">Drag &amp; drop or <span className="font-medium text-brand underline">browse</span></span><span className="text-xs text-muted">JPG, PNG or PDF (Max 5MB)</span>
                  </div>
                  {(file || savedFile) && <div className="relative flex h-[7.5rem] w-28 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-line bg-white p-2 text-center">
                    {preview ? <img src={preview} alt="Reference preview" className="h-full w-full rounded-lg object-cover" /> : <><FileText size={30} className="text-brand" /><span className="line-clamp-2 break-all text-xs text-ink">{file?.name ?? savedFile?.fileName}</span></>}
                    <button type="button" aria-label="Remove attachment" onClick={() => { if (savedFile) setRemoveSaved(true); setFile(null); setSavedFile(null); setDirty(true); }} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-white text-muted shadow-sm hover:text-rose-600"><X size={13} /></button>
                  </div>}
                </div>
                <FieldError id="gr-file-error" message={errors.file} />
              </Section>
              <Section icon={<Star size={22} />} title="Gift Purpose" subtitle="What is the intention behind this gift?">
                <div className="relative">
                  <select id="gr-purpose" aria-label="Gift purpose" value={form.giftPurpose} onChange={(event) => setForm({ giftPurpose: event.target.value })} className={cn(control, "appearance-none border-line pr-10", !form.giftPurpose && "text-slate-400")}>
                    <option value="">Select purpose</option>
                    {GIFT_PURPOSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
                </div>
              </Section>
              <Section icon={<FileText size={22} />} title="Special Instructions" subtitle="Any specific instructions for TOFAA team.">
                <textarea aria-label="Special instructions" value={form.specialInstructions} maxLength={500} rows={2} onChange={(event) => setForm({ specialInstructions: event.target.value })} placeholder="e.g. Prefer eco-friendly options, avoid alcohol…" className={cn(control, "resize-none border-line")} />
              </Section>
            </div>
            <p className="flex items-start gap-3 rounded-2xl border border-line/70 bg-emerald-50/40 px-5 py-4 text-sm text-ink"><ShieldCheck size={22} className="mt-0.5 shrink-0 text-brand" /><span><strong className="block">Compliance Note</strong><span className="text-muted">Gifts to certain individuals (e.g. public officials) may require additional compliance review.</span></span></p>
          </div>
          <Summary rows={[
            { icon: <User size={17} />, label: "Recipient", value: String(recipient?.name ?? "") }, { icon: <Gift size={17} />, label: "Occasion", value: sourceName },
            { icon: <CalendarDays size={16} />, label: "Delivery Date", value: form.deliveryDate ? day(form.deliveryDate) : "" }, { icon: <span className="text-base font-bold">₹</span>, label: "Budget Range", value: budgetSummary },
            { icon: <MessageSquare size={17} />, label: "Initiated By", value: initiatedLabel }, { icon: <Users size={17} />, label: "Relationship", value: form.relationship },
            { icon: <Star size={17} />, label: "Gift Style", value: GIFT_STYLES.find((item) => item.value === form.giftStyle)?.label }, { icon: <MessageSquare size={17} />, label: "Message", value: form.message.trim() },
          ]} />
        </div>}
      </div>

      <footer className="flex flex-col-reverse gap-3 border-t border-line/60 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        {step === 0 ? <Button variant="ghost" disabled={!!busy} onClick={requestClose}>Cancel</Button> : <Button variant="secondary" disabled={!!busy} onClick={() => setStep(step - 1)}><ArrowLeft size={17} /> Back</Button>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button variant="secondary" disabled={!!busy} onClick={() => void saveDraft()}>{busy === "draft" ? "Saving…" : "Save draft"}</Button>
          {step < 2 ? <Button type="submit" disabled={!!busy}>{step === 0 ? "Next" : "Continue to Additional Details"} <ArrowRight size={17} /></Button>
            : <Button type="submit" disabled={!!busy}>{busy === "submit" ? "Submitting…" : "Submit to TOFAA"} <ArrowRight size={17} /></Button>}
        </div>
      </footer>
    </form>}
  </Sheet>

  <Sheet open={confirmClose} onClose={() => setConfirmClose(false)} labelledBy="gr-confirm-close-title" className="max-w-md">
    <h2 id="gr-confirm-close-title" className="text-xl font-semibold text-ink">Close without saving?</h2>
    <p className="mt-2 text-sm text-muted">Your changes on this request will be lost. Use &ldquo;Save draft&rdquo; to keep them.</p>
    <div className="mt-6 flex items-center justify-end gap-3">
      <Button variant="secondary" className="shrink-0" onClick={() => setConfirmClose(false)}>Keep editing</Button>
      <Button variant="danger" className="shrink-0" onClick={() => { setConfirmClose(false); onClose(); }}>Discard changes</Button>
    </div>
  </Sheet>
  </>;
}

/** The delivery address with a Change button that turns it into an editable box. */
function AddressRow({ value, onChange, startEditing }: { value: string; onChange: (value: string) => void; startEditing: boolean }) {
  const [editing, setEditing] = useState(startEditing);
  return <div className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3">
    <MapPin size={18} className="mt-1 shrink-0 text-muted" />
    {editing ? <textarea autoFocus aria-label="Delivery address" value={value} rows={2} maxLength={600} onChange={(event) => onChange(event.target.value)} placeholder="Building, street, city and PIN code" className="min-h-14 w-full resize-none bg-transparent text-sm text-ink outline-none" />
      : <p className="min-w-0 flex-1 break-words py-1 text-sm text-ink">{value}</p>}
    <Button size="sm" variant="secondary" onClick={() => setEditing((current) => !current)}>{editing ? <><Check size={14} /> Done</> : <><Pencil size={14} /> Change</>}</Button>
  </div>;
}
