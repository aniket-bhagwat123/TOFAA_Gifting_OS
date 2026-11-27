"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/store/hooks";
import { ALL_CLIENTS, type ClientOption, setClientChooser } from "@/services/all-clients";

/** "Which client is this for?" Above every panel and dialog. */
function ClientDialog({ clients, onPick, onCancel }: { clients: ClientOption[]; onPick: (tenantId: string) => void; onCancel: () => void }) {
  const [choice, setChoice] = useState("");
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => { // Escape closes only this question
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopImmediatePropagation(); cancel.current(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  return createPortal(<div className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4">
    <div role="dialog" aria-modal="true" aria-labelledby="client-chooser-title" className="w-full max-w-sm animate-rise-in rounded-2xl bg-white p-6 shadow-xl">
      <h2 id="client-chooser-title" className="text-lg font-semibold text-ink">Which client is this for?</h2>
      <p className="mt-1 text-sm text-muted">You are viewing all clients.</p>
      <select autoFocus aria-label="Client" value={choice} onChange={(event) => setChoice(event.target.value)} className="mt-4 min-h-10 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25">
        <option value="" disabled>Choose a client</option>
        {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
      </select>
      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={!choice} onClick={() => onPick(choice)}>Continue</Button>
      </div>
    </div>
  </div>, document.body);
}

const useClientList = () => useAppSelector((state) => (state.modules.byKey.tenantOptions?.data as { items?: ClientOption[] } | undefined)?.items) ?? [];

/**
 * For a form that creates or imports: under "All clients" it asks which client first, so the form shows only that
 * client's data. `active` is whether the form is wanted; `fixed` is the client already known (the record being edited).
 * Open the form once `ready`, giving it `tenantId` when set (unset = one client is already being viewed). Render `dialog`.
 */
export function useClientFirst({ active, fixed, onCancel }: { active: boolean; fixed?: string | null; onCancel: () => void }) {
  const all = useAppSelector((state) => state.modules.selectedTenantId) === ALL_CLIENTS;
  const clients = useClientList();
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => { if (!active) setChosen(null); }, [active]);
  const known = fixed && fixed !== ALL_CLIENTS ? fixed : null;
  const tenantId = all && active ? known ?? chosen ?? undefined : undefined;
  const name = !known && chosen ? clients.find((client) => client.id === chosen)?.name : undefined;
  const dialog = !all || !active ? null
    : !tenantId ? <ClientDialog clients={clients} onPick={setChosen} onCancel={onCancel} />
      : name ? createPortal(<p role="status" className="pointer-events-none fixed left-1/2 top-3 z-[95] -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white shadow-lg">Client: {name}</p>, document.body)
        : null;
  return { ready: !all || !!tenantId, tenantId, dialog };
}

/** The safety net: something new saved from "All clients" whose client nothing else says is asked about here. */
export function ClientChooser() {
  const clients = useClientList();
  const [open, setOpen] = useState(false);
  const answer = useRef<((tenantId: string | null) => void) | null>(null);
  useEffect(() => {
    setClientChooser(() => new Promise((resolve) => { answer.current = resolve; setOpen(true); }));
    return () => setClientChooser(null);
  }, []);
  const close = (tenantId: string | null) => { setOpen(false); answer.current?.(tenantId); answer.current = null; };
  return open ? <ClientDialog clients={clients} onPick={close} onCancel={() => close(null)} /> : null;
}
