"use client";

import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { relationshipMeta, longDate } from "../recipient-utils";
import type { RecipientGroup } from "../group-sheet";
import { ADDRESS_LABELS, LINK_TYPES, type WizardData, occasionLabel } from "./wizard-types";

const none = <span className="text-muted">Not added</span>;

function Section({ title, step, onEdit, children }: { title: string; step: number; onEdit: (step: number) => void; children: ReactNode }) {
  return <section className="rounded-2xl border border-line/70 bg-white p-5">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <button type="button" onClick={() => onEdit(step)} className="press inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-sm font-semibold text-brand hover:bg-brand-soft/60"><Pencil size={14} /> Edit</button>
    </div>
    {children}
  </section>;
}
function Rows({ items }: { items: Array<[string, ReactNode]> }) {
  return <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
    {items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt><dd className="mt-0.5 break-words text-ink">{value}</dd></div>)}
  </dl>;
}

/** Step 5 – everything entered, section by section, each with an Edit button. */
export function ReviewStep({ data, groups, photoUrl, onEdit }: { data: WizardData; groups: RecipientGroup[]; photoUrl: string | null; onEdit: (step: number) => void }) {
  const d = data.details, r = data.relationship, p = data.preferences;
  const groupNames = [...r.groupIds.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean) as string[], ...(r.newGroupName.trim() ? [`${r.newGroupName.trim()} (new)`] : [])];
  const links = r.links.filter((link) => link.person);
  return <div className="space-y-4">
    <Section title="Recipient details" step={0} onEdit={onEdit}>
      <div className="flex items-start gap-4">
        <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-lg font-semibold text-brand">{photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : (d.name.trim()[0] ?? "?").toUpperCase()}</span>
        <div className="min-w-0 flex-1"><Rows items={[
          ["Full name", <span key="n" className="font-semibold capitalize">{d.name.trim()}</span>], ["Recipient type", d.recipientType === "BUSINESS" ? "Business contact" : "Individual"],
          ["Mobile", d.mobile.trim() || none], ["Email", d.email.trim() || none], ["City", d.city.trim() || none], ["Company", d.company.trim() || none], ["Designation", d.designation.trim() || none],
        ]} /></div>
      </div>
    </Section>

    <Section title="Relationship & group" step={1} onEdit={onEdit}>
      <Rows items={[
        ["Relationship", relationshipMeta(r.relationship)?.label ?? none], ["Primary contact", r.isPrimary ? "Yes" : "No"],
        ["Groups", groupNames.length ? groupNames.join(", ") : none],
        ["Linked recipients", links.length ? links.map((link) => `${link.person!.name} (${LINK_TYPES.find((t) => t.value === link.type)?.label ?? link.type})`).join(", ") : none],
      ]} />
    </Section>

    <Section title="Occasions" step={2} onEdit={onEdit}>
      {data.occasions.length ? <ul className="space-y-2 text-sm">{data.occasions.map((o) => <li key={o.key} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-ink">{occasionLabel(o)}</span><span className="tabular-nums text-ink">{longDate(o.date)}</span>
        <span className="text-muted">{[o.repeatAnnually ? "Repeats every year" : "One time", o.participants.length ? `with ${o.participants.map((x) => x.name).join(", ")}` : "", o.notes.trim()].filter(Boolean).join(" · ")}</span>
      </li>)}</ul> : <p className="text-sm">{none}</p>}
    </Section>

    <Section title="Preferences" step={3} onEdit={onEdit}>
      <Rows items={[
        ["Interests", p.interests.length ? p.interests.join(", ") : none], ["Preferred brands", p.brands.length ? p.brands.join(", ") : none],
        ["Gift preferences", p.giftPreferences.trim() || none], ["Dietary preferences", p.dietary.trim() || none],
        ["Gifts to avoid", p.avoid.trim() || none], ["Special instructions", p.instructions.trim() || none],
      ]} />
    </Section>

    <Section title="Delivery addresses" step={3} onEdit={onEdit}>
      {data.addresses.length ? <ul className="space-y-2 text-sm">{data.addresses.map((a) => <li key={a.key} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-ink">{ADDRESS_LABELS.find((l) => l.value === a.label)?.label}</span>
        <span className="text-ink">{[a.line1, a.line2, a.city, a.postalCode].filter((x) => x.trim()).join(", ")}</span>
        {a.isDefault && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">Default</span>}
      </li>)}</ul> : <p className="text-sm">{none}</p>}
    </Section>
  </div>;
}
