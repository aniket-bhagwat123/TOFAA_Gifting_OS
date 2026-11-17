"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { InputField } from "@/components/ui/input-field";
import { RequiredMark } from "@/components/ui/required-mark";
import { cn } from "@/lib/utils";
import { PersonChip, PersonPicker } from "./person-picker";
import { type DuplicateFound } from "./wizard-save";
import { type DetailsData, type Errors, LINK_TYPES, type LinkType, type RecipientType, type RelationshipData, newKey } from "./wizard-types";
import { RELATIONSHIPS } from "../recipient-utils";
import type { RecipientGroup } from "../group-sheet";

const select = "min-h-[38px] w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

/** The photo is kept in the browser until the recipient is saved, then uploaded. Horizontal layout: avatar on left, controls on right. */
function PhotoPicker({ name, src, onPick }: { name: string; src: string | null; onPick: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const choose = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Choose a PNG, JPG or WebP image."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("That image is over 2 MB. Choose a smaller one."); return; }
    onPick(file);
  };
  return <div className="flex items-center gap-4">
    <Avatar name={name} src={src} className="h-12 w-12 shrink-0 text-base" />
    <div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Upload a profile photo" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => input.current?.click()}><ImagePlus size={15} /> {src ? "Change photo" : "Upload photo"}</Button>
        {src && <Button type="button" size="sm" variant="ghost" className="text-rose-700 hover:bg-rose-50" onClick={() => onPick(null)}><Trash2 size={14} /> Remove</Button>}
      </div>
      <p className="mt-1.5 text-xs text-muted">PNG, JPG or WebP, up to 2 MB.</p>
    </div>
  </div>;
}

// ------------------------------------------------------------------------------------------ step 1
export function DetailsStep({ data, errors, photoUrl, onChange, onPhoto, duplicates, onConfirmDifferent, confirmedDifferent, groups, groupData, onGroups }: {
  groups: RecipientGroup[]; groupData: Pick<RelationshipData, "groupIds" | "newGroupName">; onGroups: (patch: Partial<RelationshipData>) => void;
  data: DetailsData; errors: Errors; photoUrl: string | null; onChange: (patch: Partial<DetailsData>) => void; onPhoto: (file: File | null) => void;
  duplicates: DuplicateFound["matches"]; onConfirmDifferent: () => void; confirmedDifferent: boolean;
}) {
  const types: Array<{ value: RecipientType; label: string }> = [{ value: "EXTERNAL", label: "External" }, { value: "INTERNAL", label: "Internal" }];
  const reason = (code: string) => ({ SAME_MOBILE: "Same mobile number", SAME_EMAIL: "Same email", SAME_NAME: "Same name" }[code] ?? code);
  return <>
    <PhotoPicker name={data.name} src={photoUrl} onPick={onPhoto} />
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><InputField label="Full name" required placeholder="Enter full name" autoComplete="off" value={data.name} onChange={(event) => onChange({ name: event.target.value })} error={errors.name} /></div>
      <InputField label="Mobile number" required type="tel" inputMode="tel" placeholder="Enter mobile number" value={data.mobile} onChange={(event) => onChange({ mobile: event.target.value })} error={errors.mobile} />
      <InputField label="Email address (optional)" type="email" placeholder="Enter email address" value={data.email} onChange={(event) => onChange({ email: event.target.value })} error={errors.email} />
      <div className="sm:col-span-2"><GroupPicker groups={groups} groupIds={groupData.groupIds} newGroupName={groupData.newGroupName} onChange={onGroups} /></div>
    </div>

    <fieldset className="mt-5">
      <legend className="text-sm font-medium text-ink">Recipient type<RequiredMark /></legend>
      <div className="mt-2 flex flex-wrap gap-2.5">
        {types.map((type) => <label key={type.value} className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 rounded-full border px-4 text-sm font-medium", data.recipientType === type.value ? "border-brand/50 bg-brand-soft text-brand" : "border-line bg-white text-ink hover:bg-slate-50")}>
          <input type="radio" name="recipient-type" checked={data.recipientType === type.value} onChange={() => onChange({ recipientType: type.value })} className="h-4 w-4 accent-brand" />{type.label}
        </label>)}
      </div>
    </fieldset>
    {data.recipientType === "EXTERNAL" && <div className="mt-4 sm:max-w-[calc(50%-0.5rem)]"><InputField label="Company / organisation (optional)" placeholder="Enter company / organisation" value={data.company} onChange={(event) => onChange({ company: event.target.value })} /></div>}

    {duplicates.length > 0 && !confirmedDifferent && <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16} /> This person may already be in your recipients</p>
      <ul className="mt-3 space-y-2">
        {duplicates.map((match) => <li key={match.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
          <span><span className="font-semibold capitalize text-ink">{match.name}</span><span className="text-muted"> · {[match.mobileNumber, match.email, match.city].filter(Boolean).join(" · ") || "No contact details"}</span></span>
          <span className="flex flex-wrap gap-1">{match.reasons.map((code) => <span key={code} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{reason(code)}</span>)}</span>
        </li>)}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onConfirmDifferent}>This is a different person — continue</Button>
      </div>
      <p className="mt-2 text-xs text-amber-800">To avoid duplicates, cancel and open the existing recipient instead.</p>
    </div>}
  </>;
}

// ------------------------------------------------------------------------------------------ step 2
/** "Add to the group": pick from the existing groups, or type a new name to create the group when the recipient is saved. */
function GroupPicker({ groups, groupIds, newGroupName, onChange }: { groups: RecipientGroup[]; groupIds: string[]; newGroupName: string; onChange: (patch: Partial<RelationshipData>) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const typed = query.trim();
  const available = groups.filter((g) => !groupIds.includes(g.id) && g.name.toLowerCase().includes(typed.toLowerCase()));
  const exact = groups.some((g) => g.name.trim().toLowerCase() === typed.toLowerCase()) || newGroupName.trim().toLowerCase() === typed.toLowerCase();
  const pick = (id: string) => { onChange({ groupIds: [...groupIds, id] }); setQuery(""); };
  const create = () => { onChange({ newGroupName: typed }); setQuery(""); setOpen(false); };
  const selected = groups.filter((g) => groupIds.includes(g.id));
  return <div>
    <label htmlFor="group-picker" className="block text-sm font-medium text-ink">Add to the group</label>
    {(selected.length > 0 || newGroupName.trim()) && <div className="mt-2 flex flex-wrap gap-2">
      {selected.map((g) => <span key={g.id} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-sm font-medium text-brand">{g.name}<button type="button" aria-label={`Remove ${g.name}`} onClick={() => onChange({ groupIds: groupIds.filter((id) => id !== g.id) })} className="rounded-full p-0.5 hover:bg-white/70"><X size={13} /></button></span>)}
      {newGroupName.trim() && <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-sm font-medium text-amber-800">{newGroupName.trim()} <span className="text-xs font-normal">(new)</span><button type="button" aria-label="Remove new group" onClick={() => onChange({ newGroupName: "" })} className="rounded-full p-0.5 hover:bg-white/70"><X size={13} /></button></span>}
    </div>}
    <div className="relative mt-2">
      <input id="group-picker" autoComplete="off" value={query} placeholder={groups.length ? "Select a group or enter a new name" : "Enter group name"}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (available.length && !typed) return; if (typed && !exact && !available.length) create(); else if (available[0]) pick(available[0].id); } if (event.key === "Escape") setOpen(false); }}
        className="min-h-[38px] w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/25" />
      {open && (available.length > 0 || (typed && !exact)) && <ul role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg">
        {available.map((g) => <li key={g.id}><button type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(g.id)} className="flex w-full px-3 py-2 text-left text-sm text-ink hover:bg-slate-50">{g.name}</button></li>)}
        {typed && !exact && <li><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={create} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand hover:bg-brand-soft/60"><Plus size={14} />Create group “{typed}”</button></li>}
      </ul>}
    </div>
    <p className="mt-1 text-xs text-muted">Can&apos;t find the group? Type its name and choose Create. It is added to Groups when you save.</p>
  </div>;
}

export function RelationshipStep({ data, groups, recipientsEndpoint, onChange }: {
  data: RelationshipData; groups: RecipientGroup[]; recipientsEndpoint: string; onChange: (patch: Partial<RelationshipData>) => void;
}) {
  const toggleGroup = (id: string) => onChange({ groupIds: data.groupIds.includes(id) ? data.groupIds.filter((g) => g !== id) : [...data.groupIds, id] });
  const setLink = (key: string, patch: Partial<RelationshipData["links"][number]>) => onChange({ links: data.links.map((link) => (link.key === key ? { ...link, ...patch } : link)) });
  return <>
    <div className="grid gap-5">
      <div className="max-w-sm space-y-1.5">
        <label htmlFor="rel" className="block text-sm font-medium text-ink">Relationship to your organisation</label>
        <select id="rel" value={data.relationship} onChange={(event) => onChange({ relationship: event.target.value })} className={select}>
          <option value="">Not set</option>
          {RELATIONSHIPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      <div>
        <p className="text-sm font-medium text-ink">Groups</p>
        <p className="text-xs text-muted">Choose any number of existing groups, or create a new one.</p>
        {groups.length ? <div className="mt-2 flex flex-wrap gap-2">
          {groups.map((group) => <button key={group.id} type="button" aria-pressed={data.groupIds.includes(group.id)} onClick={() => toggleGroup(group.id)} className={cn("press min-h-9 rounded-full border px-3.5 text-sm font-medium", data.groupIds.includes(group.id) ? "border-brand/50 bg-brand-soft text-brand" : "border-line bg-white text-ink hover:bg-slate-50")}>{group.name} <span className="text-xs opacity-70">{group.recipientIds.length}</span></button>)}
        </div> : <p className="mt-2 text-sm text-muted">No groups yet.</p>}
        <div className="mt-3 max-w-sm"><InputField label="Create a new group" placeholder="Enter group name" value={data.newGroupName} onChange={(event) => onChange({ newGroupName: event.target.value })} hint="This person becomes its first member." /></div>
      </div>

      <div>
        <p className="text-sm font-medium text-ink">Linked people</p>
        <p className="text-xs text-muted">Connect this person to someone already in your recipients, such as a spouse or colleague.</p>
        <div className="mt-2 space-y-2.5">
          {data.links.map((link) => <div key={link.key} className="grid items-start gap-2 rounded-xl border border-line/70 p-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
            {link.person ? <div className="flex min-h-9 items-center"><PersonChip person={link.person} onRemove={() => setLink(link.key, { person: null })} /></div>
              : <PersonPicker endpoint={recipientsEndpoint} label="Find a recipient to link" exclude={data.links.flatMap((l) => (l.person ? [l.person.id] : []))} onPick={(person) => setLink(link.key, { person })} />}
            <select aria-label="Relationship type" value={link.type} onChange={(event) => setLink(link.key, { type: event.target.value as LinkType })} className={select}>
              {LINK_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <Button size="sm" variant="ghost" aria-label="Remove link" className="text-rose-700 hover:bg-rose-50" onClick={() => onChange({ links: data.links.filter((l) => l.key !== link.key) })}><Trash2 size={16} /></Button>
          </div>)}
          <Button size="sm" variant="secondary" onClick={() => onChange({ links: [...data.links, { key: newKey(), person: null, type: "SPOUSE" }] })}><Plus size={15} /> Link a person</Button>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3">
        <input type="checkbox" checked={data.isPrimary} onChange={(event) => onChange({ isPrimary: event.target.checked })} className="mt-0.5 h-4 w-4 accent-brand" />
        <span><span className="block text-sm font-medium text-ink">Primary contact</span><span className="block text-xs text-muted">Marks this person as the main contact for their family or group.</span></span>
      </label>
    </div>
  </>;
}
