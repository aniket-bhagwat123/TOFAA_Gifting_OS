"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
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
  budget: row.budget === null || row.budget === undefined ? "" : String(Number(row.budget)), remark: String(row.remark ?? "")
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

  return <Sheet open={!!target} locked={isSubmitting} onClose={onClose} labelledBy="recipient-dialog-title" className="max-w-3xl">
    <h2 id="recipient-dialog-title" className="text-xl font-semibold text-ink">{adding ? "Add recipient" : "Edit recipient"}</h2>
    {row?.id && <div className="mt-4"><ImageUpload name={String(row.name ?? "")} src={photo} label="Choose a photo for this person"
      onUpload={async (file) => { const saved = await sendImage<{ avatarUrl?: string | null }>("put", `${endpoint}/${row.id}/avatar`, file); setPhoto(saved.avatarUrl ?? null); onPhotoChanged?.(); toast.success("Photo saved."); }}
      onRemove={async () => { await deleteImage(`${endpoint}/${row.id}/avatar`); setPhoto(null); onPhotoChanged?.(); toast.success("Photo removed."); }} /></div>}
    <form noValidate onSubmit={submit} className="mt-5">
      <RecipientFields register={register} control={control} errors={errors} setValue={setValue} budget={budget} birthdayRequired={adding} showBudget={!adding} />
      {adding
        ? <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="secondary" disabled={isSubmitting || !endpoint} onClick={() => { addAnother.current = true; }}>Save and add another</Button>
          <Button type="submit" disabled={isSubmitting || !endpoint} onClick={() => { addAnother.current = false; }}>{isSubmitting ? "Saving…" : "Save recipient"}</Button>
        </div>
        : <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" className="text-rose-700 hover:bg-rose-50" disabled={isSubmitting} onClick={() => row && onDelete(row)}>Delete recipient</Button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row"><Button type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>Cancel</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save changes"}</Button></div>
        </div>}
    </form>
  </Sheet>;
}
