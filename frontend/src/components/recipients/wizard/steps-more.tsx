"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { InputField } from "@/components/ui/input-field";
import { cn } from "@/lib/utils";
import { PersonChip, PersonPicker } from "./person-picker";
import {
  ADDRESS_LABELS, type AddressItem, type AddressLabel, type Errors, OCCASION_TYPES, type OccasionItem, type PreferencesData,
  newKey, occasionLabel, validateAddress, validateOccasion,
} from "./wizard-types";
import { longDate } from "../recipient-utils";

const select = "min-h-10 w-full rounded-[9px] border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";
const area = "min-h-20 w-full rounded-[9px] border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

// ------------------------------------------------------------------------------------------ step 3
const blankOccasion = (): OccasionItem => ({ key: newKey(), type: "Birthday", name: "", date: "", repeatAnnually: true, notes: "", participants: [] });

export interface OccasionsStepHandle { trySave: () => boolean }

export const OccasionsStep = forwardRef<OccasionsStepHandle, { items: OccasionItem[]; recipientsEndpoint: string; onChange: (items: OccasionItem[]) => void }>(
function OccasionsStep({ items, recipientsEndpoint, onChange }, ref) {
  const [draft, setDraft] = useState<OccasionItem | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const editing = draft ? items.some((item) => item.key === draft.key) : false;

  useImperativeHandle(ref, () => ({
    trySave: () => {
      if (!draft) return true;
      const found = validateOccasion(draft, items);
      setErrors(found);
      if (Object.keys(found).length) return false;
      onChange(editing ? items.map((item) => (item.key === draft.key ? draft : item)) : [...items, draft]);
      setDraft(null);
      return true;
    },
  }));

  const save = () => {
    if (!draft) return;
    const found = validateOccasion(draft, items);
    setErrors(found);
    if (Object.keys(found).length) return;
    onChange(editing ? items.map((item) => (item.key === draft.key ? draft : item)) : [...items, draft]);
    setDraft(null);
  };
  const pick = (type: string) => setDraft((current) => (current ? { ...current, type, repeatAnnually: type !== "Custom" ? true : current.repeatAnnually, participants: type === "Birthday" ? [] : current.participants } : current));

  return <>
    <div className="space-y-2.5">
      {items.map((item) => <div key={item.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{occasionLabel(item)} <span className="font-normal text-muted">· {longDate(item.date)}{item.repeatAnnually ? " · every year" : ""}</span></p>
          {item.participants.length > 0 && <p className="mt-0.5 text-xs text-muted">Shared with {item.participants.map((p) => p.name).join(", ")}</p>}
          {item.notes && <p className="mt-0.5 truncate text-xs text-muted">{item.notes}</p>}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" aria-label={`Edit ${occasionLabel(item)}`} onClick={() => { setErrors({}); setDraft(item); }}><Pencil size={15} /></Button>
          <Button size="sm" variant="ghost" aria-label={`Remove ${occasionLabel(item)}`} className="text-rose-700 hover:bg-rose-50" onClick={() => onChange(items.filter((o) => o.key !== item.key))}><Trash2 size={15} /></Button>
        </div>
      </div>)}
      {!items.length && !draft && <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-muted">No occasions added yet.</p>}
    </div>

    {draft ? <div className="mt-4 grid gap-4 rounded-xl border border-brand/30 bg-brand-soft/20 p-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label htmlFor="occ-type" className="block text-sm font-medium text-ink">Occasion type</label>
        <select id="occ-type" value={draft.type} onChange={(event) => pick(event.target.value)} className={select}>{OCCASION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>
        {errors.type && <p role="alert" className="text-sm text-rose-600">{errors.type}</p>}
      </div>
      {draft.type === "Custom" && <InputField label="Occasion name" required placeholder="e.g. Promotion" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} error={errors.name} />}
      <DatePickerField id="occ-date" label="Date" required value={draft.date} onChange={(value) => setDraft({ ...draft, date: value })} error={errors.date} />
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 self-end text-sm text-ink"><input type="checkbox" checked={draft.repeatAnnually} onChange={(event) => setDraft({ ...draft, repeatAnnually: event.target.checked })} className="h-4 w-4 accent-brand" /> Repeat every year</label>
      {draft.type !== "Birthday" && <div className="sm:col-span-2">
        <p className="text-sm font-medium text-ink">Shared with <span className="font-normal text-muted">(optional)</span></p>
        <p className="mb-2 text-xs text-muted">For an occasion that involves other people, such as a wedding anniversary. It is stored once.</p>
        <div className="flex flex-wrap gap-2">{draft.participants.map((person) => <PersonChip key={person.id} person={person} onRemove={() => setDraft({ ...draft, participants: draft.participants.filter((p) => p.id !== person.id) })} />)}</div>
        <div className="mt-2 max-w-sm"><PersonPicker endpoint={recipientsEndpoint} label="Add someone who shares this occasion" exclude={draft.participants.map((p) => p.id)} placeholder="Search to add a person…" onPick={(person) => setDraft({ ...draft, participants: [...draft.participants, person] })} /></div>
      </div>}
      <div className="sm:col-span-2"><InputField label="Notes" placeholder="Optional" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></div>
      <div className="flex gap-2 sm:col-span-2"><Button onClick={save}>{editing ? "Update occasion" : "Add occasion"}</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div>
    </div> : <Button className="mt-4" variant="secondary" onClick={() => { setErrors({}); setDraft(blankOccasion()); }}><Plus size={16} /> Add occasion</Button>}
  </>;
});

// ------------------------------------------------------------------------------------------ step 4
function TagInput({ label, values, placeholder, onChange }: { label: string; values: string[]; placeholder: string; onChange: (values: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...values, ...parts])].slice(0, 30));
    setText("");
  };
  return <div className="space-y-1.5">
    <label className="block text-sm font-medium text-ink">{label}</label>
    <div className="flex gap-2">
      <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); } }} onBlur={add} placeholder={placeholder} aria-label={label}
        className="min-h-10 w-full rounded-[9px] border border-line bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25" />
    </div>
    {values.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{values.map((value) => <span key={value} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-3 pr-1 text-sm text-ink">{value}<button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((v) => v !== value))} className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-black/5">×</button></span>)}</div>}
  </div>;
}

const blankAddress = (first: boolean): AddressItem => ({ key: newKey(), label: "OFFICE", line1: "", line2: "", city: "", postalCode: "", isDefault: first });

export function PreferencesStep({ prefs, addresses, onPrefs, onAddresses }: {
  prefs: PreferencesData; addresses: AddressItem[]; onPrefs: (patch: Partial<PreferencesData>) => void; onAddresses: (items: AddressItem[]) => void;
}) {
  const [draft, setDraft] = useState<AddressItem | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const editing = draft ? addresses.some((a) => a.key === draft.key) : false;
  const saveAddress = () => {
    if (!draft) return;
    const found = validateAddress(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    let next = editing ? addresses.map((a) => (a.key === draft.key ? draft : a)) : [...addresses, draft];
    if (draft.isDefault) next = next.map((a) => ({ ...a, isDefault: a.key === draft.key }));
    if (!next.some((a) => a.isDefault) && next.length) next[0] = { ...next[0], isDefault: true };
    onAddresses(next);
    setDraft(null);
  };
  const remove = (key: string) => { const next = addresses.filter((a) => a.key !== key); if (next.length && !next.some((a) => a.isDefault)) next[0] = { ...next[0], isDefault: true }; onAddresses(next); };

  return <>
    <div className="grid gap-4 sm:grid-cols-2">
      <TagInput label="Interests and hobbies" values={prefs.interests} placeholder="Type and press Enter, e.g. Cricket" onChange={(interests) => onPrefs({ interests })} />
      <TagInput label="Preferred brands" values={prefs.brands} placeholder="Type and press Enter" onChange={(brands) => onPrefs({ brands })} />
      <div className="space-y-1.5"><label htmlFor="gp" className="block text-sm font-medium text-ink">Gift preferences</label><textarea id="gp" value={prefs.giftPreferences} maxLength={2000} onChange={(event) => onPrefs({ giftPreferences: event.target.value })} placeholder="e.g. Prefers practical gifts" className={area} /></div>
      <div className="space-y-1.5"><label htmlFor="dp" className="block text-sm font-medium text-ink">Dietary preferences</label><textarea id="dp" value={prefs.dietary} maxLength={1000} onChange={(event) => onPrefs({ dietary: event.target.value })} placeholder="e.g. Vegetarian, no nuts" className={area} /></div>
      <div className="space-y-1.5"><label htmlFor="ga" className="block text-sm font-medium text-ink">Gifts to avoid</label><textarea id="ga" value={prefs.avoid} maxLength={1000} onChange={(event) => onPrefs({ avoid: event.target.value })} placeholder="e.g. Alcohol" className={area} /></div>
      <div className="space-y-1.5"><label htmlFor="si" className="block text-sm font-medium text-ink">Special instructions</label><textarea id="si" value={prefs.instructions} maxLength={2000} onChange={(event) => onPrefs({ instructions: event.target.value })} placeholder="e.g. Deliver to the front desk" className={area} /></div>
    </div>

    <h3 className="mb-2 mt-7 text-base font-semibold text-ink">Delivery addresses</h3>
    <div className="space-y-2.5">
      {addresses.map((address) => <div key={address.key} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line/70 px-4 py-3">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-ink">{ADDRESS_LABELS.find((l) => l.value === address.label)?.label}{address.isDefault && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand"><Star size={11} /> Default</span>}</p>
          <p className="text-muted">{[address.line1, address.line2, address.city, address.postalCode].filter(Boolean).join(", ")}</p>
        </div>
        <div className="flex gap-1">
          {!address.isDefault && <Button size="sm" variant="ghost" onClick={() => onAddresses(addresses.map((a) => ({ ...a, isDefault: a.key === address.key })))}>Make default</Button>}
          <Button size="sm" variant="ghost" aria-label="Edit address" onClick={() => { setErrors({}); setDraft(address); }}><Pencil size={15} /></Button>
          <Button size="sm" variant="ghost" aria-label="Remove address" className="text-rose-700 hover:bg-rose-50" onClick={() => remove(address.key)}><Trash2 size={15} /></Button>
        </div>
      </div>)}
      {!addresses.length && !draft && <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-muted">No delivery address added yet.</p>}
    </div>
    {draft ? <div className="mt-3 grid gap-4 rounded-xl border border-brand/30 bg-brand-soft/20 p-4 sm:grid-cols-2">
      <div className="space-y-1.5"><label htmlFor="al" className="block text-sm font-medium text-ink">Address type</label>
        <select id="al" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value as AddressLabel })} className={select}>{ADDRESS_LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select></div>
      <label className="flex min-h-10 cursor-pointer items-center gap-2.5 self-end text-sm text-ink"><input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })} className="h-4 w-4 accent-brand" /> Default delivery address</label>
      <div className="sm:col-span-2"><InputField label="Address" required placeholder="House no., street, area" value={draft.line1} onChange={(event) => setDraft({ ...draft, line1: event.target.value })} error={errors.line1} /></div>
      <div className="sm:col-span-2"><InputField label="Address line 2" placeholder="Landmark (optional)" value={draft.line2} onChange={(event) => setDraft({ ...draft, line2: event.target.value })} /></div>
      <InputField label="City" required value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} error={errors.city} />
      <InputField label="PIN code" required inputMode="numeric" maxLength={6} placeholder="6 digits" value={draft.postalCode} onChange={(event) => setDraft({ ...draft, postalCode: event.target.value })} error={errors.postalCode} />
      <div className="flex gap-2 sm:col-span-2"><Button onClick={saveAddress}>{editing ? "Update address" : "Add address"}</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div>
    </div> : <Button className={cn("mt-3")} variant="secondary" onClick={() => { setErrors({}); setDraft(blankAddress(!addresses.length)); }}><Plus size={16} /> Add address</Button>}
  </>;
}
