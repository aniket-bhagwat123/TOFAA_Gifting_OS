"use client";

import { useRef, type ReactNode } from "react";
import { AlertTriangle, Briefcase, Building2, Camera, CheckCircle2, ChevronDown, Info, MapPin, User, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DuplicateFound } from "./wizard-save";
import { type DetailsData, type Errors, type RecipientType } from "./wizard-types";

const COUNTRY_CODES = ["+91", "+1", "+44", "+971", "+65", "+61"];
const BASE_CITIES = ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Gurugram"];
const field = "h-12 w-full rounded-xl border border-line bg-white px-4 text-[0.9375rem] text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/25";

/** Splits "+919876543210" into its country code and the rest, so each can sit in its own control. */
function splitMobile(value: string): { code: string; number: string } {
  const text = value.replace(/[\s()-]/g, "");
  const code = [...COUNTRY_CODES].sort((a, b) => b.length - a.length).find((c) => text.startsWith(c));
  return code ? { code, number: text.slice(code.length) } : { code: "+91", number: text.replace(/^\+/, "") };
}

function Field({ label, htmlFor, required, error, children }: { label: string; htmlFor?: string; required?: boolean; error?: string; children: ReactNode }) {
  return <div className="min-w-0">
    <label htmlFor={htmlFor} className="mb-2 block text-[0.9375rem] font-semibold text-ink">{label}{required && <span className="ml-0.5 text-rose-500" aria-hidden>*</span>}</label>
    {children}
    {error && <p role="alert" className="mt-1.5 text-sm text-rose-600">{error}</p>}
  </div>;
}

/** An input with an icon on the left (and optionally something on the right). */
function IconInput({ icon, trailing, className, ...props }: { icon: ReactNode; trailing?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div className="relative">
    <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
    <input {...props} className={cn(field, "pl-11", trailing && "pr-11", className)} />
    {trailing && <span className="absolute right-4 top-1/2 -translate-y-1/2">{trailing}</span>}
  </div>;
}

/** Round photo area with a camera button. The photo stays in the browser until the recipient is saved. */
function PhotoPicker({ photoUrl, onPick }: { photoUrl: string | null; onPick: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const choose = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Choose a PNG, JPG or WebP image."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("That image is over 2 MB. Choose a smaller one."); return; }
    onPick(file);
  };
  return <div className="flex flex-col items-center text-center">
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Upload a profile photo" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
    <div className="relative">
      <span aria-hidden className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-brand-soft/70 text-brand ring-1 ring-line/70">
        {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <UserCircle size={64} strokeWidth={1.3} />}
      </span>
      <button type="button" onClick={() => input.current?.click()} aria-label={photoUrl ? "Change photo" : "Upload photo"} className="press absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-brand text-white shadow-sm hover:bg-brand-dark"><Camera size={18} /></button>
    </div>
    <button type="button" onClick={() => input.current?.click()} className="mt-3 text-base font-medium text-ink hover:text-brand">{photoUrl ? "Change Photo" : "Upload Photo"}</button>
    <p className="mt-0.5 text-xs text-muted">JPG, PNG (max 2MB)</p>
    {photoUrl && <button type="button" onClick={() => onPick(null)} className="mt-1 text-xs font-medium text-rose-700 hover:underline">Remove</button>}
  </div>;
}

/** Step 1 – Recipient Details. Only the full name is required. */
export function DetailsStepPage({ data, errors, photoUrl, cities, onChange, onPhoto, duplicates, confirmedDifferent, onConfirmDifferent }: {
  data: DetailsData; errors: Errors; photoUrl: string | null; cities: string[]; onChange: (patch: Partial<DetailsData>) => void; onPhoto: (file: File | null) => void;
  duplicates: DuplicateFound["matches"]; confirmedDifferent: boolean; onConfirmDifferent: () => void;
}) {
  const { code, number } = splitMobile(data.mobile);
  const setMobile = (nextCode: string, nextNumber: string) => onChange({ mobile: nextNumber.trim() ? `${nextCode}${nextNumber.replace(/[^\d\s-]/g, "")}` : "" });
  const cityList = [...new Set([...cities, ...BASE_CITIES])];
  const types: Array<{ value: RecipientType; label: string; Icon: typeof User }> = [{ value: "INDIVIDUAL", label: "Individual", Icon: User }, { value: "BUSINESS", label: "Business Contact", Icon: Building2 }];
  const reason = (reasonCode: string) => ({ SAME_MOBILE: "Same mobile number", SAME_EMAIL: "Same email", SAME_NAME: "Same name" }[reasonCode] ?? reasonCode);

  return <div className="grid gap-8 lg:grid-cols-[10rem_minmax(0,1fr)]">
    <PhotoPicker photoUrl={photoUrl} onPick={onPhoto} />
    <div className="space-y-6">
      <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Full Name" htmlFor="wz-name" required error={errors.name}>
          <IconInput id="wz-name" icon={<User size={18} />} placeholder="e.g. Sachin Tendulkar" autoComplete="off" value={data.name} onChange={(event) => onChange({ name: event.target.value })} aria-invalid={!!errors.name}
            trailing={data.name.trim().length >= 2 && !errors.name ? <CheckCircle2 size={20} className="text-emerald-500" aria-label="Looks good" /> : undefined} />
        </Field>
        <Field label="Mobile Number" htmlFor="wz-mobile" error={errors.mobile}>
          <div className={cn("flex h-12 overflow-hidden rounded-xl border bg-white transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25", errors.mobile ? "border-rose-400" : "border-line")}>
            <div className="relative flex shrink-0 items-center border-r border-line/80">
              <select aria-label="Country code" value={code} onChange={(event) => setMobile(event.target.value, number)} className="h-full appearance-none bg-transparent pl-4 pr-8 text-[0.9375rem] text-ink outline-none" style={{ border: 0, boxShadow: "none", borderRadius: 0 }}>
                {COUNTRY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden className="pointer-events-none absolute right-3 text-slate-500" />
            </div>
            <input id="wz-mobile" type="tel" inputMode="tel" placeholder="98765 43210" value={number} onChange={(event) => setMobile(code, event.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-4 text-[0.9375rem] text-ink outline-none placeholder:text-slate-400" style={{ border: 0, boxShadow: "none", borderRadius: 0 }} />
          </div>
        </Field>
        <Field label="Email Address" htmlFor="wz-email" error={errors.email}>
          <input id="wz-email" type="email" placeholder="name@company.com" autoComplete="off" value={data.email} onChange={(event) => onChange({ email: event.target.value })} className={cn(field, errors.email && "border-rose-400")} />
        </Field>
        <Field label="City" htmlFor="wz-city">
          <IconInput id="wz-city" icon={<MapPin size={18} />} trailing={<ChevronDown size={15} className="pointer-events-none text-slate-500" />} list="wz-cities" placeholder="e.g. Mumbai" autoComplete="off" value={data.city} onChange={(event) => onChange({ city: event.target.value })} />
          <datalist id="wz-cities">{cityList.map((city) => <option key={city} value={city} />)}</datalist>
        </Field>
        <Field label="Company / Organisation" htmlFor="wz-company">
          <IconInput id="wz-company" icon={<Building2 size={18} />} placeholder="e.g. BCCI" autoComplete="off" value={data.company} onChange={(event) => onChange({ company: event.target.value })} />
        </Field>
        <Field label="Designation" htmlFor="wz-designation" error={errors.designation}>
          <IconInput id="wz-designation" icon={<Briefcase size={18} />} placeholder="e.g. VP Marketing" autoComplete="off" value={data.designation} onChange={(event) => onChange({ designation: event.target.value })} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-[0.9375rem] font-semibold text-ink">Recipient Type<span className="ml-0.5 text-rose-500" aria-hidden>*</span></legend>
        <div className="flex flex-wrap gap-3">
          {types.map(({ value, label, Icon }) => {
            const on = data.recipientType === value;
            return <label key={value} className={cn("flex h-12 cursor-pointer items-center gap-3 rounded-full border px-5 text-sm font-semibold transition", on ? "border-brand/40 bg-brand-soft text-ink" : "border-line bg-white text-ink hover:bg-slate-50")}>
              <input type="radio" name="wz-recipient-type" checked={on} onChange={() => onChange({ recipientType: value })} className="sr-only" />
              <span aria-hidden className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2", on ? "border-brand bg-brand" : "border-slate-300 bg-white")}>{on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
              <Icon size={18} className={on ? "text-brand" : "text-slate-500"} />{label}
            </label>;
          })}
        </div>
      </fieldset>

      {duplicates.length > 0 && !confirmedDifferent && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16} /> This person may already be in your recipients</p>
        <ul className="mt-3 space-y-2">
          {duplicates.map((match) => <li key={match.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
            <span><span className="font-semibold capitalize text-ink">{match.name}</span><span className="text-muted"> · {[match.mobileNumber, match.email, match.city].filter(Boolean).join(" · ") || "No contact details"}</span></span>
            <span className="flex flex-wrap gap-1">{match.reasons.map((c) => <span key={c} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{reason(c)}</span>)}</span>
          </li>)}
        </ul>
        <button type="button" onClick={onConfirmDifferent} className="press mt-3 inline-flex h-10 items-center rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50">This is a different person — continue</button>
        <p className="mt-2 text-xs text-amber-900">To avoid duplicates, save and exit, then open the existing recipient instead.</p>
      </div>}

      <p className="flex items-center gap-3 rounded-xl bg-brand-soft/60 px-4 py-3.5 text-sm text-ink"><Info size={18} className="shrink-0 text-brand" /> You can link this recipient to a family or group in the next step.</p>
    </div>
  </div>;
}
