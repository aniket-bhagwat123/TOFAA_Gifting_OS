"use client";

import { useRef, useState } from "react";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moduleConfig } from "@/features/modules/module-config";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { useAppSelector } from "@/store/hooks";
import { RecipientCreatePanel } from "./wizard/recipient-create-panel";

type Row = Record<string, unknown>;

/**
 * Inside a form that picks recipients: add one for that form's client without leaving it (no need to say the client
 * again). With nobody yet (`empty`) it says so and offers the button; otherwise it is a small link when `link` is set.
 * `onAdded` gets the client's people afterwards. `onOpenChange` lets the form underneath ignore Escape meanwhile.
 */
export function NoPeople({ tenantId, empty, link = false, onAdded, onOpenChange }: {
  tenantId: string | null | undefined; empty: boolean; link?: boolean; onAdded: (people: Row[]) => void; onOpenChange?: (open: boolean) => void;
}) {
  const user = useAppSelector((state) => state.auth.user);
  const name = useAppSelector((state) => (state.modules.byKey.tenantOptions?.data as { items?: { id: string; name: string }[] } | undefined)?.items?.find((client) => client.id === tenantId)?.name);
  const [open, setOpen] = useState(false);
  const saved = useRef(false);
  const usable = !!user && !!tenantId && tenantId !== "all" && moduleConfig.recipients.roles.includes(user.platformRole);
  if (!usable) return null;
  const endpoints = { recipients: moduleConfig.recipients.endpoint(user, tenantId), groups: moduleConfig["recipient-groups"].endpoint(user, tenantId) };
  const show = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
  const close = () => {
    show(false);
    if (!saved.current) return;
    saved.current = false;
    void loadAllModuleRecords(endpoints.recipients).then(onAdded).catch(() => undefined);
  };

  // A form around this one must not take the panel's submit as its own.
  return <div onSubmit={(event) => event.stopPropagation()}>
    {empty ? <div role="status" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">{name ? `${name} has no recipients yet.` : "There are no recipients yet."}</p>
      <p className="mt-0.5 text-sm text-amber-800">Add the first one to continue.</p>
      <Button type="button" size="sm" className="mt-3" onClick={() => show(true)}><UserPlus size={15} /> Add a recipient{name ? ` to ${name}` : ""}</Button>
    </div> : link && <button type="button" onClick={() => show(true)} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"><Plus size={15} /> Add new recipient</button>}
    {open && <RecipientCreatePanel open zIndex="z-[85]" endpoints={endpoints} userId={user.id} onClose={close} onSaved={() => { saved.current = true; }} onViewProfile={() => undefined} doneLabel="Use in this form" />}
  </div>;
}
