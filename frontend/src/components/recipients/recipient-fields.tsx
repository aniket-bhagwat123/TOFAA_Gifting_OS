"use client";

import { Controller, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import type { z } from "zod";
import type { recipientSchema } from "@/features/forms/schemas";
import { InputField } from "@/components/ui/input-field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { formatCurrency } from "@/lib/utils";

export type RecipientFormInput = z.input<typeof recipientSchema>;
export const emptyRecipient: RecipientFormInput = { name: "", mobileNumber: "", addressLine1: "", city: "", postalCode: "", dateOfBirth: "", anniversaryDate: "", budget: "", remark: "" };
const budgetPresets = [2500, 5000, 10000, 25000];

/** The recipient form body, shared by the Add and Edit dialogs. The budget is only asked for when editing. */
export function RecipientFields({ register, control, errors, setValue, budget = "", birthdayRequired = true, showBudget = false }: {
  register: UseFormRegister<RecipientFormInput>; control: Control<RecipientFormInput, unknown, any>; errors: FieldErrors<RecipientFormInput>;
  setValue: UseFormSetValue<RecipientFormInput>; budget?: string; birthdayRequired?: boolean; showBudget?: boolean;
}) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <InputField label="Full name" required placeholder="e.g. Rohan Mehta" autoComplete="off" registration={register("name")} error={errors.name?.message} />
    <InputField label="Mobile number" required type="tel" inputMode="tel" placeholder="+91 98765 43210" registration={register("mobileNumber")} error={errors.mobileNumber?.message} />
    <Controller control={control} name="dateOfBirth" render={({ field }) => <DatePickerField id="dateOfBirth" label="Birthday" value={String(field.value ?? "")} onChange={field.onChange} onBlur={field.onBlur} error={errors.dateOfBirth?.message} required={birthdayRequired} maxDate={new Date()} />} />
    <Controller control={control} name="anniversaryDate" render={({ field }) => <DatePickerField id="anniversaryDate" label="Anniversary" value={String(field.value ?? "")} onChange={field.onChange} onBlur={field.onBlur} error={errors.anniversaryDate?.message} />} />
    <div className="sm:col-span-2"><InputField label="Address" required placeholder="House no., street, area" autoComplete="off" registration={register("addressLine1")} error={errors.addressLine1?.message} /></div>
    <InputField label="City" required placeholder="e.g. Mumbai" autoComplete="off" registration={register("city")} error={errors.city?.message} />
    <InputField label="PIN code" required inputMode="numeric" maxLength={6} placeholder="6 digits" autoComplete="off" registration={register("postalCode")} error={errors.postalCode?.message} />
    <div className="sm:col-span-2 lg:col-span-1"><InputField label="Notes" placeholder="e.g. Loves single-malt" registration={register("remark")} error={errors.remark?.message} /></div>
    {showBudget && <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-3">
      <div className="w-full sm:w-60"><InputField label="Budget (₹)" type="number" inputMode="numeric" min={0} placeholder="e.g. 5000" registration={register("budget")} error={errors.budget?.message} /></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick budget choices">
        {budgetPresets.map((amount) => <button key={amount} type="button" aria-pressed={budget === String(amount)} onClick={() => setValue("budget", String(amount), { shouldValidate: true, shouldDirty: true })} className={`press min-h-10 rounded-full border px-4 text-sm font-medium ${budget === String(amount) ? "border-brand bg-brand/10 text-brand" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}>{formatCurrency(amount)}</button>)}
      </div>
    </div>}
  </div>;
}
