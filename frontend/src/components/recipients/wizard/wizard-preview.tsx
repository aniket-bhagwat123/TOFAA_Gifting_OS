"use client";

import { ArrowRight, Gift, Mail, Phone, Sparkles, User } from "lucide-react";
import { relationshipMeta } from "../recipient-utils";
import type { DetailsData, RelationshipData } from "./wizard-types";

const NEXT_STEP = [
  "Add relationship, occasions and preferences",
  "Add occasions and important dates",
  "Add gifting preferences and delivery addresses",
  "Review everything and save the recipient",
  "Save the recipient to finish",
];

/** A live summary of the person being added, shown beside the form on desktop. */
export function QuickPreview({ details, relationship, photoUrl, step }: { details: DetailsData; relationship: RelationshipData; photoUrl: string | null; step: number }) {
  const place = [relationshipMeta(relationship.relationship)?.label, details.city.trim()].filter(Boolean).join(" • ");
  const empty = <span className="text-muted">Not added yet</span>;
  return <section aria-label="Quick preview" className="overflow-hidden rounded-2xl border border-line/70 bg-white shadow-soft">
    <div className="p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold text-ink">Quick Preview</h3>
        <span className="rounded-full border border-brand/40 bg-brand-soft/50 px-3 py-1 text-xs font-semibold text-brand">New Recipient</span>
      </div>
      <div className="mt-5 flex flex-col items-center text-center">
        <span aria-hidden className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-brand ring-4 ring-white">
          {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <User size={56} strokeWidth={1.6} />}
        </span>
        <p className="mt-4 max-w-full break-words text-2xl font-semibold capitalize text-ink">{details.name.trim() || "New recipient"}</p>
        <p className="mt-1 text-sm text-muted">{place || "Relationship • City"}</p>
        {(details.designation.trim() || details.company.trim()) && <p className="mt-0.5 text-sm text-muted">{[details.designation.trim(), details.company.trim()].filter(Boolean).join(", ")}</p>}
      </div>
      <dl className="mt-5 space-y-3 border-t border-line/70 pt-5 text-sm text-ink">
        <div className="flex items-center gap-3"><Phone size={18} className="shrink-0 text-slate-500" /><dd className="min-w-0 truncate tabular-nums">{details.mobile.trim() || empty}</dd></div>
        <div className="flex items-center gap-3"><Mail size={18} className="shrink-0 text-slate-500" /><dd className="min-w-0 truncate">{details.email.trim() || empty}</dd></div>
      </dl>
      <div className="mt-5 flex items-start gap-3 border-t border-line/70 pt-5">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><ArrowRight size={20} /></span>
        <div><p className="text-sm font-semibold text-ink">Next Step</p><p className="mt-0.5 text-sm text-muted">{NEXT_STEP[Math.min(step, NEXT_STEP.length - 1)]}</p></div>
      </div>
    </div>
    <div aria-hidden className="relative flex h-28 items-end justify-center bg-amber-50/70">
      <Sparkles size={18} className="absolute left-[34%] top-5 text-amber-400" /><Sparkles size={14} className="absolute right-[32%] top-9 text-amber-400" />
      <Gift size={64} strokeWidth={1.4} className="mb-3 text-amber-500" />
    </div>
  </section>;
}
