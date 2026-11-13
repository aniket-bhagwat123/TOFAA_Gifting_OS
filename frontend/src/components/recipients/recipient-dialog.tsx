"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPen } from "lucide-react";
import { toast } from "sonner";
import { FormPanel, FormSection } from "@/components/ui/form-panel";
import { Button } from "@/components/ui/button";
import { ImageUpload, deleteImage, sendImage } from "@/components/ui/image-upload";
import { recipientCreateSchema, recipientEditSchema } from "@/features/forms/schemas";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage, getApiFieldErrors } from "@/services/api-client";
import { RecipientFields, emptyRecipient, type RecipientFormInput } from "./recipient-fields";

export type RecipientRow = Record<string, unknown> & { id?: string; address?: { addressLine1?: string; city?: string; postalCode?: string } };
/** A recipient to edit, or "new" to add one. */
export type RecipientTarget = RecipientRow | "new";

const valuesFrom = (row: RecipientRow): RecipientFormInput => ({
  name: String(row.name ?? ""), mobileNumber: String(row.mobileNumber ?? ""),
  addressLine1: String(row.address?.addressLine1 ?? ""), city: String(row.address?.city ?? ""), postalCode: String(row.address?.postalCode ?? ""),
  dateOfBirth: String(row.dateOfBirth ?? ""), anniversaryDate: String(row.anniversaryDate ?? ""),
  budget: row.budget === null || row.budget === undefined ? "" : String(Number(row.budget)), remark: String(row.remark ?? ""),
  relationship: String(row.relationship ?? ""), designation: String(row.designation ?? ""), isPrimary: row.isPrimary === true
});

/** One dialog for adding and editing a recipient. Only editing shows the budget. */
export function RecipientDialog({ target, endpoint, onClose, onSaved, onDelete, onPhotoChanged }: {
  target: RecipientTarget | null; endpoint: string; onClose: () => void; onSaved: (addAnother: boolean) => void; onDelete: (row: RecipientRow) => void; onPhotoChanged?: () => void;
}) {
  const adding = target === "new";
  const row = target && target !== "new" ? target : null;
  const addAnother = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { setPhoto(row ? ((row.avatarUrl as string | null | undefined) ?? null) : null); }, [row]);
  const { register, control, handleSubmit, setError, setValue, watch, reset, setFocus, formState: { errors, isSubmitting } } = useForm<RecipientFormInput>({ resolver: zodResolver((adding ? recipientCreateSchema : recipientEditSchema) as never) as never, defaultValues: emptyRecipient });
  useEffect(() => {
    if (adding) reset(emptyRecipient);
    else if (row) reset(valuesFrom(row));
  }, [adding, row, reset]);
  const budget = String(watch("budget") ?? "");

  const submit = handleSubmit(async (values) => {
    try {
      const body: Record<string, unknown> = {
        name: values.name, mobileNumber: values.mobileNumber, anniversaryDate: values.anniversaryDate || null, remark: values.remark || null,
        relationship: values.relationship || null, designation: values.designation?.trim() || null, isPrimary: values.isPrimary === true,
        address: { addressLine1: values.addressLine1, city: values.city, postalCode: values.postalCode, country: "IN" }
      };
      if (values.dateOfBirth) body.dateOfBirth = values.dateOfBirth;
      if (adding) {
        await mutateModule("post", endpoint, body);
        toast.success(addAnother.current ? `${values.name} saved. Add the next person.` : `${values.name} saved.`);
        if (addAnother.current) { reset(emptyRecipient); setFocus("name"); }
        onSaved(addAnother.current);
        return;
      }
      if (!row?.id) return;
      if (values.budget !== "" && values.budget !== undefined) body.budget = Number(values.budget);
      await mutateModule("patch", `${endpoint}/${row.id}`, body);
      toast.success("Changes saved.");
      onSaved(false);
    } catch (error) {
      Object.entries(getApiFieldErrors(error)).forEach(([field, message]) => setError(field as keyof RecipientFormInput, { message }));
      toast.error(getApiErrorMessage(error));
    }
  });

  const footer = adding
    ? <div className="flex flex-wrap gap-3">
      <Button type="button" variant="secondary" className="flex-1" disabled={isSubmitting} onClick={onClose}>Cancel</Button>
      <Button type="submit" variant="secondary" className="flex-1" disabled={isSubmitting || !endpoint} onClick={() => { addAnother.current = true; }}>Save and add another</Button>
      <Button type="submit" className="flex-1" disabled={isSubmitting || !endpoint} onClick={() => { addAnother.current = false; }}>{isSubmitting ? "Saving…" : "Save recipient"}</Button>
    </div>
    : <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="ghost" className="text-rose-700 hover:bg-rose-50" disabled={isSubmitting} onClick={() => row && onDelete(row)}>Delete</Button>
      <div className="flex gap-3"><Button type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>Cancel</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save changes"}</Button></div>
    </div>;

  return <FormPanel open={!!target} onClose={onClose} width="xl" locked={isSubmitting} onSubmit={(event) => void submit(event)} icon={<UserPen size={26} />}
    title={adding ? "Add Recipient" : "Edit Recipient"} description={adding ? "Add a person you send gifts to." : String(row?.name ?? "Update this recipient's details.")} footer={footer}>
    {row?.id && <ImageUpload name={String(row.name ?? "")} src={photo} label="Choose a photo for this person"
      onUpload={async (file) => { const saved = await sendImage<{ avatarUrl?: string | null }>("put", `${endpoint}/${row.id}/avatar`, file); setPhoto(saved.avatarUrl ?? null); onPhotoChanged?.(); toast.success("Photo saved."); }}
      onRemove={async () => { await deleteImage(`${endpoint}/${row.id}/avatar`); setPhoto(null); onPhotoChanged?.(); toast.success("Photo removed."); }} />}
    <FormSection title="Details">
      <RecipientFields register={register} control={control} errors={errors} setValue={setValue} budget={budget} birthdayRequired={adding} showBudget={!adding} />
    </FormSection>
  </FormPanel>;
}
