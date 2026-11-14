"use client";

import { useEffect, useState } from "react";
import { Building2, CalendarPlus, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { RequiredMark } from "@/components/ui/required-mark";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormPanel } from "@/components/ui/form-panel";
import { cn } from "@/lib/utils";
import { RELATIONSHIPS, inputClass } from "@/components/gift-requests/shared";
import { mutateModule } from "@/features/modules/module.service";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { getApiErrorMessage } from "@/services/api-client";
import type { OverviewItem, Priority } from "./types";

type Mode = "RECIPIENT" | "COMPANY";
const OCCASION_TYPES = ["Birthday", "Anniversary", "Work Anniversary", "Other"];
const COMPANY_CATEGORIES = ["Annual Event", "Festival", "Company Milestone", "Celebration", "Other"];
const PRIORITIES: Array<{ value: Priority; label: string }> = [{ value: "NORMAL", label: "Normal" }, { value: "HIGH", label: "High" }, { value: "VIP", label: "VIP" }];
const DESCRIPTION_MAX = 200;
const blank = { mode: "RECIPIENT" as Mode, recipientId: "", relationship: "", occasionType: "", customName: "", date: "", repeat: false, priority: "NORMAL" as Priority, notes: "", eventName: "", category: "", description: "" };
type Form = typeof blank;

const sectionTitle = "text-base font-semibold text-ink";
const fieldLabel = "mb-1.5 block text-sm font-medium text-ink";

function Pills({ value, options, onChange, label }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; label: string }) {
  return <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)} className={cn("press inline-flex min-h-10 items-center gap-1.5 rounded-full border px-5 text-sm font-semibold", value === option.value ? "border-brand bg-brand-soft text-brand" : "border-line bg-white text-slate-700 hover:bg-slate-50")}>{value === option.value && <Check size={15} aria-hidden />}{option.label}</button>)}
  </div>;
}

/** Add an occasion (a date for one person, or for the whole company), or edit one the client created. */
export function AddOccasionPanel({ open, editing, prefilledDate, tenantId, onClose, onSaved }: {
  open: boolean; editing: OverviewItem | null; prefilledDate?: string; tenantId: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [recipients, setRecipients] = useState<Record<string, unknown>[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => { setForm((current) => ({ ...current, ...patch })); setErrors({}); };

  // Start fresh each time the panel opens; when editing, start from what is saved.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (!editing) { setForm(prefilledDate ? { ...blank, date: prefilledDate } : blank); return; }
    const known = OCCASION_TYPES.includes(editing.label);
    setForm({
      ...blank, mode: editing.sourceType, recipientId: editing.recipientId ?? "", relationship: editing.relationship ?? "",
      occasionType: editing.sourceType === "RECIPIENT" ? (known ? editing.label : "Other") : "", customName: editing.sourceType === "RECIPIENT" && !known ? editing.label : "",
      date: editing.sourceDate ?? editing.date, repeat: editing.repeatAnnually, priority: editing.priority, notes: editing.notes ?? "",
      eventName: editing.sourceType === "COMPANY" ? editing.name : "", category: editing.sourceType === "COMPANY" ? editing.label : "", description: editing.description ?? "",
    });
  }, [open, editing, prefilledDate]);

  useEffect(() => {
    if (!open || recipients) return;
    let cancelled = false;
    loadAllModuleRecords(`/tenants/${tenantId}/recipients`)
      .then((rows) => { if (!cancelled) setRecipients(rows); })
      .catch((err) => { if (!cancelled) setLoadError(getApiErrorMessage(err)); });
    return () => { cancelled = true; };
  }, [open, recipients, tenantId]);

  const company = form.mode === "COMPANY";
  const categories = editing && form.category && !COMPANY_CATEGORIES.includes(form.category) ? [...COMPANY_CATEGORIES, form.category] : COMPANY_CATEGORIES;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (company) {
      if (!form.eventName.trim()) next.eventName = "Enter the event name.";
      if (!form.category) next.category = "Choose a category.";
    } else {
      if (!form.recipientId) next.recipientId = "Choose a recipient.";
      if (!form.occasionType) next.occasionType = "Choose an occasion.";
      if (form.occasionType === "Other" && !form.customName.trim()) next.customName = "Name the occasion.";
    }
    if (!form.date) next.date = "Pick a date.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const common = { repeatAnnually: form.repeat, priority: form.priority, notes: form.notes.trim() || undefined };
      if (company) {
        const body = { occasionName: form.eventName.trim(), occasionDate: form.date, category: form.category, description: form.description.trim() || undefined, ...common };
        if (editing?.occasionId) await mutateModule("patch", `/tenants/${tenantId}/occasions/${editing.occasionId}`, body);
        else await mutateModule("post", `/tenants/${tenantId}/occasions`, body);
      } else {
        const label = form.occasionType === "Other" ? form.customName.trim() : form.occasionType;
        const body = { eventName: label, eventDate: form.date, occasionType: label, relationship: form.relationship || undefined, ...common };
        if (editing?.eventId) await mutateModule("patch", `/tenants/${tenantId}/events/${editing.eventId}`, body);
        else await mutateModule("post", `/tenants/${tenantId}/recipients/${form.recipientId}/events`, body);
      }
      toast.success(editing ? "Occasion updated." : "Occasion saved.");
      onSaved();
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const error = (key: string) => errors[key] ? <p role="alert" className="mt-1 text-sm text-rose-600">{errors[key]}</p> : null;
  const HeaderIcon = company ? Building2 : CalendarPlus;

  return <FormPanel open={open} onClose={onClose} width="md" locked={saving} onSubmit={save} icon={<HeaderIcon size={26} />} title={editing ? "Edit Occasion" : "Add Occasion"} description={editing ? "Change the details of this occasion." : "Add an important date to your company's gifting calendar."}
    submitLabel={editing ? "Save changes" : "Save Occasion"}>
      {!editing && <div role="tablist" aria-label="Occasion type" className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
        {([["RECIPIENT", "Recipient Occasion"], ["COMPANY", "Company Occasion"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={form.mode === value} onClick={() => set({ mode: value })} className={cn("press min-h-11 rounded-xl px-3 text-sm font-semibold", form.mode === value ? "border border-brand bg-white text-brand shadow-sm" : "text-slate-700")}>{label}</button>)}
      </div>}

      {company ? <>
        <section className="space-y-4"><h3 className={sectionTitle}>1. Event Details</h3>
          <div><label htmlFor="occ-name" className={fieldLabel}>Event Name<RequiredMark /></label>
            <input id="occ-name" value={form.eventName} onChange={(event) => set({ eventName: event.target.value })} maxLength={150} placeholder="e.g. Annual Day Celebration" aria-invalid={!!errors.eventName} className={cn(inputClass, errors.eventName && "border-rose-400")} />{error("eventName")}</div>
          <div><label htmlFor="occ-category" className={fieldLabel}>Event Category<RequiredMark /></label>
            <select id="occ-category" value={form.category} onChange={(event) => set({ category: event.target.value })} aria-invalid={!!errors.category} className={cn(inputClass, errors.category && "border-rose-400")}><option value="">Select category</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select>{error("category")}</div>
          <div><label htmlFor="occ-description" className={fieldLabel}>Description <span className="font-normal text-muted">(Optional)</span></label>
            <textarea id="occ-description" rows={3} maxLength={DESCRIPTION_MAX} value={form.description} onChange={(event) => set({ description: event.target.value })} placeholder="Add more details about the event…" className={inputClass} /><p className="mt-1 text-right text-xs text-muted">{form.description.length}/{DESCRIPTION_MAX}</p></div>
        </section>
        <section className="space-y-3 border-t border-line/70 pt-5"><h3 className={sectionTitle}>2. Event Date</h3>
          <DatePickerField id="occ-date" label="Event Date" required value={form.date} onChange={(value) => set({ date: value })} error={errors.date} minDate={new Date(new Date().getFullYear() - 1, 0, 1)} />
          <label className="flex items-center gap-2.5 text-sm text-ink"><input type="checkbox" checked={form.repeat} onChange={(event) => set({ repeat: event.target.checked })} className="h-5 w-5 accent-brand" />Repeat annually</label>
        </section>
      </> : <>
        <section className="space-y-4"><h3 className={sectionTitle}>1. Recipient Details</h3>
          <div><span id="occ-recipient-label" className={fieldLabel}>Recipient<RequiredMark /></span>
            {editing ? <p className="min-h-10 rounded-[9px] border border-line bg-slate-50 px-3 py-2 text-sm capitalize text-ink">{editing.name}</p>
              : <SearchableSelect name="recipientId" labelId="occ-recipient-label" options={(recipients ?? []).map((row) => ({ id: String(row.id), label: String(row.name ?? "Unnamed"), searchText: String(row.mobileNumber ?? "") }))} value={form.recipientId} loading={!recipients && !loadError} loadError={loadError} placeholder="Search and select recipient…" error={errors.recipientId} required onChange={(value) => set({ recipientId: value })} />}
            {error("recipientId")}</div>
          <div><label htmlFor="occ-relationship" className={fieldLabel}>Relationship</label>
            <select id="occ-relationship" value={form.relationship} onChange={(event) => set({ relationship: event.target.value })} className={inputClass}><option value="">Select relationship</option>{RELATIONSHIPS.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
        </section>
        <section className="space-y-4 border-t border-line/70 pt-5"><h3 className={sectionTitle}>2. Occasion Details</h3>
          <div><label htmlFor="occ-type" className={fieldLabel}>Occasion<RequiredMark /></label>
            <select id="occ-type" value={form.occasionType} onChange={(event) => set({ occasionType: event.target.value })} aria-invalid={!!errors.occasionType} className={cn(inputClass, errors.occasionType && "border-rose-400")}><option value="">Select occasion</option>{OCCASION_TYPES.map((name) => <option key={name} value={name}>{name}</option>)}</select>{error("occasionType")}</div>
          {form.occasionType === "Other" && <div><label htmlFor="occ-custom" className={fieldLabel}>Occasion name<RequiredMark /></label>
            <input id="occ-custom" value={form.customName} onChange={(event) => set({ customName: event.target.value })} maxLength={150} placeholder="e.g. Promotion" className={cn(inputClass, errors.customName && "border-rose-400")} />{error("customName")}</div>}
          <DatePickerField id="occ-date" label="Occasion Date" required value={form.date} onChange={(value) => set({ date: value })} error={errors.date} minDate={new Date(new Date().getFullYear() - 1, 0, 1)} />
          <label className="flex items-center gap-2.5 text-sm text-ink"><input type="checkbox" checked={form.repeat} onChange={(event) => set({ repeat: event.target.checked })} className="h-5 w-5 accent-brand" />Repeat every year</label>
        </section>
      </>}

      <section className="space-y-3 border-t border-line/70 pt-5"><h3 className={sectionTitle}>{company ? "3. Planning Preferences" : "3. Priority & Notes"}</h3>
        <div><span className={fieldLabel}>Priority</span><Pills label="Priority" value={form.priority} options={PRIORITIES} onChange={(value) => set({ priority: value as Priority })} /></div>
        <div><label htmlFor="occ-notes" className={fieldLabel}>Internal Notes <span className="font-normal text-muted">(Optional)</span></label>
          <textarea id="occ-notes" rows={3} maxLength={2000} value={form.notes} onChange={(event) => set({ notes: event.target.value })} placeholder="Add any useful context…" className={inputClass} /></div>
      </section>
  </FormPanel>;
}
