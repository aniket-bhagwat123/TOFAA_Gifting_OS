"use client";

import { useEffect, useId, useState } from "react";
import { Users, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RequiredMark } from "@/components/ui/required-mark";
import { RecipientMultiSelect } from "@/components/modules/recipient-multi-select";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";

export interface RecipientGroup { id: string; name: string; recipientIds: string[]; updatedAt?: string }

/** Create (group = "new") or edit/delete a recipient group — centered modal dialog. */
export function GroupSheet({ group, endpoint, recipients, presetIds, loadingRecipients = false, onClose, onSaved }: {
  group: RecipientGroup | "new" | null; endpoint: string; recipients: Record<string, unknown>[];
  presetIds?: string[]; loadingRecipients?: boolean; onClose: () => void; onSaved: () => void;
}) {
  const editing = group && group !== "new" ? group : null;
  const titleId = useId();
  const [name, setName] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ name?: string; ids?: string }>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setName(editing?.name ?? "");
    setIds(editing?.recipientIds ?? presetIds ?? []);
    setErrors({});
    setConfirmDelete(false);
  }, [group]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <Sheet open={!!group} onClose={onClose} labelledBy={titleId} locked={busy} className="max-w-lg">
      {confirmDelete ? (
        <>
          <h2 id={titleId} className="text-xl font-semibold text-ink">Delete this group?</h2>
          <p className="mt-2 text-sm text-muted">Delete &ldquo;{editing?.name}&rdquo;? The recipients stay; only the group is removed.</p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep group</Button>
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Yes, delete"}</Button>
          </div>
        </>
      ) : (
        <form noValidate onSubmit={(e) => void save(e)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Users size={22} /></span>
              <div>
                <h2 id={titleId} className="text-xl font-semibold text-ink">{editing ? "Edit Group" : "New Group"}</h2>
                <p className="text-sm text-muted">{editing ? "Change the name or recipients." : "Put people together to plan gifts as a group."}</p>
              </div>
            </div>
            <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-black/5 disabled:opacity-50"><X size={18} /></button>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="group-name" className="block text-sm font-semibold text-ink">Group name<RequiredMark /></label>
              <input
                id="group-name" value={name} autoFocus
                onChange={(e) => { setName(e.target.value); setErrors((c) => ({ ...c, name: undefined })); }}
                placeholder="e.g. Key clients"
                className={`min-h-11 w-full rounded-xl border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 ${errors.name ? "border-rose-400" : "border-line"}`}
              />
              {errors.name && <p role="alert" className="text-sm text-rose-600">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <span id="group-people-label" className="block text-sm font-semibold text-ink">Recipients<RequiredMark /></span>
              <RecipientMultiSelect
                options={recipients} selectedIds={ids} loading={loadingRecipients}
                loadError={null} error={errors.ids} labelId="group-people-label"
                onChange={(id, selected) => { setIds((c) => selected ? [...c, id] : c.filter((v) => v !== id)); setErrors((c) => ({ ...c, ids: undefined })); }}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            {editing
              ? <Button type="button" variant="ghost" className="text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete group</Button>
              : <span />}
            <div className="flex gap-3">
              <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create group"}</Button>
            </div>
          </div>
        </form>
      )}
    </Sheet>
  );
}
