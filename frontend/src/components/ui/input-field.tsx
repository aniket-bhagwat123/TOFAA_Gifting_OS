import type { InputHTMLAttributes } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "@/lib/utils";
import { RequiredMark } from "@/components/ui/required-mark";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  registration?: UseFormRegisterReturn;
  error?: string;
  hint?: string;
};
export function InputField({ label, registration, error, hint, className, id, required, ...props }: Props) {
  const fieldId = id || props.name || registration?.name;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="flex items-baseline justify-between text-sm font-medium text-ink">
        <span>{label}{required && <RequiredMark />}</span>
      </label>
      <input id={fieldId} aria-required={required || undefined} aria-invalid={error ? "true" : undefined} aria-describedby={describedBy} className={cn("min-h-12 w-full rounded-xl border bg-white px-4 py-3 text-base text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/15", error ? "border-rose-400" : "border-line", className)} {...registration} {...props} />
      {error ? <p id={`${fieldId}-error`} role="alert" className="text-sm text-rose-600">{error}</p> : hint ? <p id={`${fieldId}-hint`} className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
