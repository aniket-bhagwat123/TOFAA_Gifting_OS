"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RequiredMark } from "@/components/ui/required-mark";
import { RecipientMultiSelect } from "@/components/modules/recipient-multi-select";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";

export interface RecipientGroup { id: string; name: string; recipientIds: string[]; updatedAt?: string }

/** Create (group = "new") or edit/delete a recipient group. */
export function GroupSheet({ group, endpoint, recipients, presetIds, loadingRecipients = false, onClose, onSaved }: {
  group: RecipientGroup | "new" | null; endpoint: string; recipients: Record<string, unknown>[];
  /** Recipients already chosen on the list, so a new group starts with them. */
  presetIds?: string[]; loadingRecipients?: boolean; onClose: () => void; onSaved: () => void;
}) {
  const editing = group && group !== "new" ? group : null;
  const [name, setName] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ name?: string; ids?: string }>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setName(editing?.name ?? ""); setIds(editing?.recipientIds ?? presetIds ?? []); setErrors({}); setConfirmDelete(false); }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Please give the group a name.";
    if (!ids.length) next.ids = "Choose at least one recipient.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await mutateModule(editing ? "put" : "post", editing ? `${endpoint}/${editing.id}` : endpoint, { name: name.trim(), recipientIds: ids });
      toast.success(editing ? "Group updated." : "Group created.");
      onSaved();
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    try { await mutateModule("delete", `${endpoint}/${editing.id}`); toast.success("Group deleted."); onSaved(); }
    catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setBusy(false); }
  };

  return <Sheet open={!!group} locked={busy} onClose={onClose} labelledBy="group-title" className="max-w-md">
    <h2 id="group-title" className="text-xl font-semibold text-ink">{editing ? "Edit group" : "New group"}</h2>
    {confirmDelete ? <div className="mt-4">
      <p className="text-base text-slate-700">Delete the group “{editing?.name}”? The recipients stay; only the group is removed.</p>
      <div className="mt-6 flex justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep group</Button><Button variant="danger" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Yes, delete"}</Button></div>
    </div> : <form noValidate onSubmit={save} className="mt-5 space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="group-name" className="block text-sm font-medium text-ink">Group name<RequiredMark /></label>
        <input id="group-name" value={name} onChange={(event) => { setName(event.target.value); setErrors((c) => ({ ...c, name: undefined })); }} placeholder="e.g. Key clients" autoFocus className={`min-h-12 w-full rounded-xl border bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 ${errors.name ? "border-rose-400" : "border-line"}`} />
        {errors.name && <p role="alert" className="text-sm text-rose-600">{errors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <span id="group-people-label" className="block text-sm font-medium text-ink">Recipients<RequiredMark /></span>
        <RecipientMultiSelect options={recipients} selectedIds={ids} loading={loadingRecipients} loadError={null} error={errors.ids} labelId="group-people-label" onChange={(id, selected) => { setIds((current) => selected ? [...current, id] : current.filter((value) => value !== id)); setErrors((c) => ({ ...c, ids: undefined })); }} />
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
        {editing ? <Button type="button" variant="ghost" className="text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete group</Button> : <span />}
        <div className="flex flex-col-reverse gap-3 sm:flex-row"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create group"}</Button></div>
      </div>
    </form>}
  </Sheet>;
}
