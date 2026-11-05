"use client";

import { useId, useState } from "react";
import { Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RequiredMark } from "@/components/ui/required-mark";
import { generatePassword, passwordRules, passwordStrength } from "@/lib/password";

const barColors = ["bg-slate-200", "bg-rose-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

/**
 * Password input with a show/hide preview. Optionally offers a one-tap strong
 * password generator, copy button, strength meter and a checklist of what's missing.
 */
export function PasswordField({ label, value, onChange, error, autoComplete = "new-password", showStrength = false, allowGenerate = false, placeholder, autoFocus, hint, defaultVisible = false, required = false }: {
  label: string; value: string; onChange: (value: string) => void; error?: string; autoComplete?: string;
  showStrength?: boolean; allowGenerate?: boolean; placeholder?: string; autoFocus?: boolean; hint?: string; defaultVisible?: boolean; required?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(defaultVisible);
  const [copied, setCopied] = useState(false);
  const strength = passwordStrength(value);

  const generate = () => { onChange(generatePassword()); setVisible(true); setCopied(false); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); toast.success("Password copied"); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error("Couldn't copy. Please select and copy it manually."); }
  };

  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium text-ink"><span>{label}{required && <RequiredMark />}</span></label>
    <div className="relative">
      <input id={id} aria-required={required || undefined} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} placeholder={placeholder} spellCheck={false} aria-invalid={error ? "true" : undefined} aria-describedby={error ? `${id}-error` : undefined}
        className={cn("min-h-12 w-full rounded-xl border bg-white py-3 pl-4 pr-14 text-base text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/15", visible && "font-mono tracking-wide", error ? "border-rose-400" : "border-line")} />
      <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} className="press absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 hover:text-ink">{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
    </div>
    {hint && !error && <p className="text-sm text-muted">{hint}</p>}
    {error && <p id={`${id}-error`} role="alert" className="text-sm text-rose-600">{error}</p>}

    {allowGenerate && <div className="flex flex-wrap gap-2">
      <button type="button" onClick={generate} className="press inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-medium text-ink hover:bg-slate-50"><RefreshCw size={15} /> Generate strong password</button>
      {value && <button type="button" onClick={copy} className="press inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-medium text-ink hover:bg-slate-50">{copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}</button>}
    </div>}

    {showStrength && value && <div aria-live="polite">
      <div className="flex items-center gap-3"><div className="flex flex-1 gap-1.5" aria-hidden>{[1, 2, 3, 4].map((step) => <span key={step} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", strength.score >= step ? barColors[strength.score] : "bg-slate-200")} />)}</div><span className="w-16 text-right text-sm font-medium text-slate-600">{strength.label}</span></div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">{passwordRules(value).map((rule) => <li key={rule.id} className={cn("flex items-center gap-2 text-sm", rule.met ? "text-emerald-700" : "text-muted")}><span className={cn("flex h-4 w-4 items-center justify-center rounded-full", rule.met ? "bg-emerald-100" : "bg-slate-100")}>{rule.met && <Check size={11} />}</span>{rule.label}</li>)}</ul>
    </div>}
  </div>;
}
