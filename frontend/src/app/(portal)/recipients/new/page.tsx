"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { recipientSchema } from "@/features/forms/schemas";
import { z } from "zod";
import { InputField } from "@/components/ui/input-field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { createRecord } from "@/features/forms/form.service";
import { getApiErrorMessage, getApiFieldErrors } from "@/services/api-client";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Values = z.infer<typeof recipientSchema>;
type FormInput = z.input<typeof recipientSchema>;
export default function NewRecipientPage() {
  const router = useRouter();
  const tenantId = useAppSelector((state) => state.auth.user?.tenant?.id || state.modules.selectedTenantId);
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, Values>({ resolver: zodResolver(recipientSchema), defaultValues: { name: "", mobileNumber: "", addressLine1: "", city: "", postalCode: "", dateOfBirth: "", anniversaryDate: "", remark: "" } });
  const onSubmit = async (values: Values) => {
    try {
      if (!tenantId) throw new Error("Your account is not linked to a tenant.");
      const { addressLine1, city, postalCode, ...recipient } = values;
      await createRecord(`/tenants/${tenantId}/recipients`, { ...recipient, anniversaryDate: recipient.anniversaryDate || null, remark: recipient.remark || null, address: { addressLine1, city, postalCode, country: "IN" } });
      toast.success("Recipient created successfully"); router.push("/recipients");
    } catch (error) {
      Object.entries(getApiFieldErrors(error)).forEach(([field, message]) => setError(field as keyof Values, { message }));
      toast.error(getApiErrorMessage(error));
    }
  };
  return <><PageHeader title="Add recipient" description="Create a recipient record for your organization." /><Card className="max-w-3xl p-6">
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <InputField label="Full name" placeholder="e.g. Rohan Mehta" registration={register("name")} error={errors.name?.message} required />
        <InputField label="Mobile number" placeholder="+919876543210" registration={register("mobileNumber")} error={errors.mobileNumber?.message} required />
        <InputField label="Address" placeholder="Street address" registration={register("addressLine1")} error={errors.addressLine1?.message} required />
        <InputField label="City" placeholder="City" registration={register("city")} error={errors.city?.message} required />
        <InputField label="Postal code" placeholder="6-digit postal code" registration={register("postalCode")} error={errors.postalCode?.message} required />
        <Controller control={control} name="dateOfBirth" render={({ field }) => <DatePickerField id="dateOfBirth" label="Date of birth" value={String(field.value ?? "")} onChange={field.onChange} onBlur={field.onBlur} error={errors.dateOfBirth?.message} required />} />
        <Controller control={control} name="anniversaryDate" render={({ field }) => <DatePickerField id="anniversaryDate" label="Anniversary" value={String(field.value ?? "")} onChange={field.onChange} onBlur={field.onBlur} error={errors.anniversaryDate?.message} />} />
        <InputField label="Budget (INR)" type="number" registration={register("budget")} error={errors.budget?.message} required />
        <InputField label="Remark" placeholder="Optional note" registration={register("remark")} error={errors.remark?.message} />
      </div>
      <div className="flex justify-end gap-3 border-t border-line pt-5"><Link href="/recipients"><Button type="button" variant="secondary">Cancel</Button></Link><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Create recipient"}</Button></div>
    </form>
  </Card></>;
}
