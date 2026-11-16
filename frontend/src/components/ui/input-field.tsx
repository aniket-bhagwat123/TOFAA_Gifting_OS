import type { InputHTMLAttributes, ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "@/lib/utils";
import { RequiredMark } from "@/components/ui/required-mark";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  registration?: UseFormRegisterReturn;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
};
export function InputField({ label, registration, error, hint, icon, trailing, className, id, required, ...props }: Props) {
  const fieldId = id || props.name || registration?.name;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="flex items-baseline justify-between text-xs font-medium text-ink">
        <span>{label}{required && <RequiredMark />}</span>
      </label>
      <div className="relative">{icon && <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>}
      <input id={fieldId} aria-required={required || undefined} aria-invalid={error ? "true" : undefined} aria-describedby={describedBy} className={cn("min-h-[38px] w-full rounded-md border bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/25", error ? "border-rose-400" : "border-line", icon && "pl-10", trailing && "pr-10", className)} {...registration} {...props} />{trailing && <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span>}</div>
      {error ? <p id={`${fieldId}-error`} role="alert" className="text-xs text-rose-600">{error}</p> : hint ? <p id={`${fieldId}-hint`} className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
