import type { InputHTMLAttributes } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "@/lib/utils";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  registration?: UseFormRegisterReturn;
  error?: string;
  hint?: string;
};
export function InputField({ label, registration, error, hint, className, id, ...props }: Props) {
  const fieldId = id || props.name;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-ink">{label}{props.required && <span className="ml-1 text-rose-500">*</span>}</label>
      <input id={fieldId} className={cn("w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10", error ? "border-rose-400" : "border-line", className)} {...registration} {...props} />
      {error ? <p className="text-xs text-rose-600">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
