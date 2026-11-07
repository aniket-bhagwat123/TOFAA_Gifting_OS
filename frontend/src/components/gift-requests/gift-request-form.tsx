"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { RequiredMark } from "@/components/ui/required-mark";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Spinner } from "@/components/ui/spinner";
import { type GiftRequest, creditsFor, inputClass, num, shortDay, useTenantId } from "./shared";

type Source = "occasion" | "event";
type Errors = Partial<Record<"recipientId" | "source" | "budget", string>>;

const Field = ({ label, optional, error, hint, children }: { label: string; optional?: boolean; error?: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-ink">{label}{optional && <span className="ml-1.5 font-normal text-muted">(optional)</span>}{children}</label>
    {hint && !error && <p className="text-xs text-muted">{hint}</p>}
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
  </div>
);
export function GiftRequestForm({ requestId }: { requestId?: string }) {
  const { user, tenantId, isClient } = useTenantId();
  const router = useRouter();
  const params = useSearchParams();
  const editing = !!requestId;

  const [recipients, setRecipients] = useState<Record<string, unknown>[]>([]);
  const [occasions, setOccasions] = useState<Record<string, unknown>[]>([]);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unitPriceMinor, setUnitPriceMinor] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [source, setSource] = useState<Source>("occasion");
  const [occasionId, setOccasionId] = useState("");
  const [eventId, setEventId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [purpose, setPurpose] = useState("");
  const [preferences, setPreferences] = useState("");
  const [message, setMessage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [budget, setBudget] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState<"draft" | "send" | null>(null);

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
          setTitle(request.title); setRecipientId(request.recipientId); setPurpose(request.purpose);
          setPreferences(request.giftPreferences ?? ""); setMessage(request.message ?? ""); setInstructions(request.specialInstructions ?? "");
          setDeliveryDate(request.deliveryDate ?? ""); setBudget(request.requestedBudget ? String(Number(request.requestedBudget)) : "");
          if (request.eventId) { setSource("event"); setEventId(request.eventId); } else { setSource("occasion"); setOccasionId(request.occasionId ?? ""); }
        } else {
          // Opened from "Send gift" on an upcoming birthday or event.
          const presetRecipient = params.get("recipientId");
          const presetEvent = params.get("eventId");
          const event = presetEvent ? eventRows.find((row) => String(row.id) === presetEvent) : undefined;
          const person = recipientRows.find((row) => String(row.id) === (presetRecipient ?? String(event?.recipientId ?? "")));
          if (person) setRecipientId(String(person.id));
          if (event) {
            setSource("event"); setEventId(String(event.id));
            if (event.eventDate) setDeliveryDate(String(event.eventDate));
            setTitle(`${String(event.eventName)}${person ? ` gift for ${String(person.name)}` : ""}`);
            setPurpose(`A thoughtful gift for ${String(event.eventName).toLowerCase()}`);
          }
        }
      } catch (err) { if (!cancelled) setLoadError(getApiErrorMessage(err)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, tenantId, requestId]);

  const eventOptions = useMemo(() => events.filter((event) => !recipientId || !event.recipientId || String(event.recipientId) === recipientId), [events, recipientId]);
  const budgetValue = Number(budget);
  const credits = budget && Number.isFinite(budgetValue) && budgetValue > 0 ? creditsFor(budgetValue, unitPriceMinor) : null;
  const clear = (key: keyof Errors) => setErrors((current) => ({ ...current, [key]: undefined }));

  const validate = () => {
    const next: Errors = {};
    if (!recipientId) next.recipientId = "Please choose who the gift is for.";
    if (source === "occasion" ? !occasionId : !eventId) next.source = "Please choose an occasion or event.";
    if (budget && (!Number.isFinite(budgetValue) || budgetValue < 0)) next.budget = "Enter a valid amount.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async (mode: "draft" | "send") => {
    if (!validate() || !tenantId) return;
    setSaving(mode);
    const base = `/tenants/${tenantId}/gift-requests`;
    // Title and purpose are optional on screen; fill them in from the occasion or event and the recipient.
    const person = String(recipients.find((row) => String(row.id) === recipientId)?.name ?? "");
    const picked = source === "occasion" ? occasions.find((row) => String(row.id) === occasionId)?.occasionName : events.find((row) => String(row.id) === eventId)?.eventName;
    const occasionName = String(picked ?? "Gift");
    const finalTitle = title.trim() || `${occasionName} gift${person ? ` for ${person}` : ""}`;
    const finalPurpose = purpose.trim() || `A thoughtful gift for ${occasionName.toLowerCase()}`;
    const body: Record<string, unknown> = {
      title: finalTitle, recipientId, purpose: finalPurpose,
      eventId: source === "event" ? eventId : null, occasionId: source === "occasion" ? occasionId : null,
      requestedBudget: budget ? budgetValue : null, requestedCredits: credits ?? null,
      deliveryDate: deliveryDate || null,
      giftPreferences: preferences.trim() || null, message: message.trim() || null, specialInstructions: instructions.trim() || null,
    };
    try {
      let id = requestId;
      if (editing) await mutateModule("patch", `${base}/${requestId}`, body);
      else {
        const created = await mutateModule("post", base, Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null))) as { id: string };
        id = created.id;
      }
      if (mode === "send") await mutateModule("post", `${base}/${id}/submit`, {});
      toast.success(mode === "send" ? "Sent to TOFAA. We'll come back with a proposal." : "Draft saved.");
      router.replace(`/requests/${id}`);
    } catch (err) { toast.error(getApiErrorMessage(err)); setSaving(null); }
  };

  if (!tenantId) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">{isClient ? "Your account isn't linked to an organisation yet. Please contact TOFAA." : "Choose a client from the “Viewing” menu at the top first."}</div>;
  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (loadError) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-800">{loadError}</div>;

  const compact = "min-h-11 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15";
  const backHref = requestId ? `/requests/${requestId}` : "/requests";
  const sourceOptions = [
    ...occasions.map((item) => ({ id: `occasion:${String(item.id)}`, label: `Occasion · ${String(item.occasionName)}${item.occasionDate ? ` · ${shortDay(String(item.occasionDate))}` : ""}` })),
    ...eventOptions.map((item) => ({ id: `event:${String(item.id)}`, label: `Event · ${String(item.eventName)}${item.eventDate ? ` · ${shortDay(String(item.eventDate))}` : ""}` })),
  ];
  const sourceValue = source === "occasion" ? (occasionId ? `occasion:${occasionId}` : "") : (eventId ? `event:${eventId}` : "");
  const pickSource = (value: string) => {
    const [kind, id] = value.split(":");
    if (kind === "event") { setSource("event"); setEventId(id); setOccasionId(""); } else { setSource("occasion"); setOccasionId(id); setEventId(""); }
    clear("source");
  };

  return <form noValidate onSubmit={(event) => { event.preventDefault(); void save("send"); }} className="mx-auto flex w-full max-w-5xl flex-col gap-4 lg:h-[calc(100dvh-8.5rem)]">
    <div className="space-y-1">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"><ChevronLeft size={16} /> {requestId ? "Back to request" : "Gifting Activity"}</Link>
      <h2 className="text-2xl font-bold text-ink">{editing ? "Edit gift request" : "New gift request"}</h2>
      <p className="text-sm text-muted">Tell the TOFAA team who the gift is for. They will come back with options to choose from.</p>
    </div>

    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 content-start gap-x-8 gap-y-5 overflow-y-auto p-6 sm:p-8 lg:grid-cols-2">
      <div className="space-y-1.5">
        <span id="gr-recipient" className="block text-sm font-medium text-ink">Who is it for?<RequiredMark /></span>
        <SearchableSelect name="recipientId" labelId="gr-recipient" options={recipients.map((recipient) => ({ id: String(recipient.id), label: String(recipient.name ?? "Unnamed"), searchText: String(recipient.mobileNumber ?? "") }))} value={recipientId} loading={false} loadError={null} placeholder="Select a recipient" error={errors.recipientId} required onChange={(value) => { setRecipientId(value); setEventId(""); clear("recipientId"); }} />
        {errors.recipientId && <p id="gr-recipient-error" role="alert" className="text-sm text-rose-600">{errors.recipientId}</p>}
        {!recipients.length && <p className="text-xs text-muted">No recipients yet. <Link href="/recipients?new=1" className="font-medium text-brand hover:underline">Add one first</Link>.</p>}
      </div>

      <div className="space-y-1.5">
        <span id="gr-source" className="block text-sm font-medium text-ink">Occasion or event<RequiredMark /></span>
        <SearchableSelect name="source" labelId="gr-source" options={sourceOptions} value={sourceValue} loading={false} loadError={null} placeholder="Select an occasion or event" error={errors.source} required onChange={pickSource} />
        {errors.source && <p id="gr-source-error" role="alert" className="text-sm text-rose-600">{errors.source}</p>}
      </div>

      <div className="contents">
        <DatePickerField id="gr-delivery" label="Deliver by" value={deliveryDate} onChange={setDeliveryDate} />
        <Field label="Budget (₹)" optional error={errors.budget} hint={credits !== null ? `About ${num(credits)} credits` : undefined}>
          <input type="number" min={0} step="any" inputMode="decimal" value={budget} onChange={(event) => { setBudget(event.target.value); clear("budget"); }} placeholder="e.g. 48000" className={`${compact} mt-1.5`} />
        </Field>
      </div>

      <details className="group rounded-xl lg:col-span-2 border border-line/70 px-4 py-3" open={editing}>
        <summary className="cursor-pointer select-none text-sm font-semibold text-ink">Add more details <span className="font-normal text-muted">(optional)</span></summary>
        <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <Field label="Request title" hint="Leave blank and we'll name it for you.">
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="e.g. Diwali hampers for the leadership team" className={`${compact} mt-1.5`} />
          </Field>
          <Field label="What is it for?">
            <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={2} maxLength={2000} placeholder="e.g. A festive thank-you for a strong year" className={`${compact} mt-1.5`} />
          </Field>
          <Field label="Gift preferences">
            <textarea value={preferences} onChange={(event) => setPreferences(event.target.value)} rows={2} maxLength={2000} placeholder="Likes, dislikes, dietary needs, things to avoid" className={`${compact} mt-1.5`} />
          </Field>
          <Field label="Message on the gift">
            <input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} placeholder="Wishing you light, joy and a brilliant year ahead." className={`${compact} mt-1.5`} />
          </Field>
          <Field label="Delivery instructions">
            <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={2} maxLength={2000} placeholder="e.g. Deliver to office reception, 10 AM – 5 PM" className={`${compact} mt-1.5`} />
          </Field>
        </div>
      </details>

      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-line/70 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-8">
        <Link href={backHref}><Button type="button" variant="ghost" className="w-full sm:w-auto" disabled={!!saving}>Cancel</Button></Link>
        <Button type="button" variant="secondary" disabled={!!saving} onClick={() => void save("draft")}>{saving === "draft" ? "Saving…" : "Save draft"}</Button>
        <Button type="submit" disabled={!!saving}>{saving === "send" ? "Sending…" : "Send to TOFAA"}</Button>
      </div>
    </Card>
  </form>;
}
