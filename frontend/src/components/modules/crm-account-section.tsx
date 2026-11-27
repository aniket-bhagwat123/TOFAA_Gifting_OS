"use client";

import { useEffect, useState } from "react";
import { FormSection } from "@/components/ui/form-panel";
import { getModuleRecords } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";

type Account = { owner?: { fullName?: string | null; email?: string | null } | null; contacts: { name: string; designation?: string | null; phone?: string | null; email?: string | null }[] };

/** What TOFAA CRM keeps about this client: the TOFAA account owner and business contacts. Changed in the CRM. */
export function CrmAccountSection({ tenantId, number }: { tenantId: string; number: number }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;
    setAccount(null); setProblem("");
    getModuleRecords(`/tenants/${tenantId}/crm-account`, {})
      .then((data) => { if (!cancelled) setAccount(data as Account); })
      .catch((error) => { if (!cancelled) setProblem(getApiErrorMessage(error)); });
    return () => { cancelled = true; };
  }, [tenantId]);

  return <FormSection number={number} title="From TOFAA CRM" hint="The account owner and contacts are changed in TOFAA CRM.">
    {problem ? <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-muted">{problem}</p>
      : !account ? <p className="text-sm text-muted">Loading…</p>
        : <div className="space-y-3 text-sm">
          <p className="flex flex-wrap justify-between gap-2"><span className="text-muted">Account owner (TOFAA)</span><span className="font-medium text-ink">{account.owner?.fullName ?? "Not assigned"}</span></p>
          {account.contacts.length ? <ul className="divide-y divide-line/60 rounded-xl border border-line/70">
            {account.contacts.map((contact, index) => <li key={`${contact.name}-${index}`} className="px-4 py-2.5">
              <p className="font-medium text-ink">{contact.name}{contact.designation ? <span className="font-normal text-muted"> · {contact.designation}</span> : null}</p>
              <p className="text-xs text-muted">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "No phone or email"}</p>
            </li>)}
          </ul> : <p className="rounded-xl bg-slate-50 px-4 py-3 text-muted">No contacts in the CRM yet.</p>}
        </div>}
  </FormSection>;
}
