"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { recipientCreateSchema } from "@/features/forms/schemas";
import { createRecord } from "@/features/forms/form.service";
import { getApiErrorMessage } from "@/services/api-client";
import { parseCsv, toIsoDate } from "@/lib/csv";

const aliases: Record<string, string[]> = {
  name: ["name", "full name"],
  mobileNumber: ["mobile", "mobile number", "phone", "phone number"],
  addressLine1: ["address", "address line 1"],
  city: ["city"],
  postalCode: ["pin", "pin code", "pincode", "postal code"],
  dateOfBirth: ["birthday", "date of birth", "dob"],
  anniversaryDate: ["anniversary", "anniversary date"],
  remark: ["remark", "note", "notes"]
};
export const RECIPIENT_TEMPLATE = "Name,Mobile,Address,City,PIN code,Birthday,Anniversary,Remark\nRohan Mehta,+919876543210,12 Marine Drive,Mumbai,400020,1990-11-09,,Prefers single malt\n";

interface ParsedRow { line: number; name: string; payload?: Record<string, unknown>; error?: string }

function parseRecipients(text: string): { rows: ParsedRow[]; problem?: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], problem: "That file has no rows. Use the template as a starting point." };
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const column = (key: string) => header.findIndex((cell) => aliases[key].includes(cell));
  const missing = ["name", "mobileNumber", "addressLine1", "city", "postalCode"].filter((key) => column(key) < 0);
  if (missing.length) return { rows: [], problem: "Some columns are missing. Please use the template (Name, Mobile, Address, City, PIN code, …)." };
  const rows = table.slice(1).map((cells, index): ParsedRow => {
    const get = (key: string) => (column(key) >= 0 ? (cells[column(key)] ?? "").trim() : "");
    const candidate = {
      name: get("name"), mobileNumber: get("mobileNumber").replace(/[\s-]/g, ""), addressLine1: get("addressLine1"), city: get("city"), postalCode: get("postalCode"),
      dateOfBirth: toIsoDate(get("dateOfBirth")), anniversaryDate: toIsoDate(get("anniversaryDate")), remark: get("remark")
    };
    const result = recipientCreateSchema.safeParse(candidate);
    if (!result.success) return { line: index + 2, name: candidate.name || "(no name)", error: result.error.issues[0]?.message ?? "Invalid row" };
    const { addressLine1, city, postalCode, ...recipient } = result.data;
    return { line: index + 2, name: recipient.name, payload: { ...recipient, anniversaryDate: recipient.anniversaryDate || null, remark: recipient.remark || null, address: { addressLine1, city, postalCode, country: "IN" } } };
  });
  return { rows };
}

/** Import many recipients from a CSV: validated in the browser, then created one by one through the normal API. */
export function ImportCsvSheet({ open, endpoint, onClose, onDone }: { open: boolean; endpoint: string; onClose: () => void; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [problem, setProblem] = useState<string>();
  const [progress, setProgress] = useState<number | null>(null);
  const valid = rows.filter((row) => row.payload);
  const invalid = rows.filter((row) => row.error);
  const busy = progress !== null;

  const reset = () => { setFileName(""); setRows([]); setProblem(undefined); setProgress(null); if (input.current) input.current.value = ""; };
  const close = () => { if (busy) return; reset(); onClose(); };

  const choose = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    const result = parseRecipients(await file.text());
    setRows(result.rows); setProblem(result.problem);
  };

  const run = async () => {
    let done = 0; const failed: string[] = [];
    setProgress(0);
    for (const row of valid) {
      try { await createRecord(endpoint, row.payload); done++; }
      catch (error) { failed.push(`${row.name}: ${getApiErrorMessage(error)}`); }
      setProgress(done + failed.length);
    }
    setProgress(null);
    if (done) toast.success(`${done} recipient${done === 1 ? "" : "s"} added.`);
    if (failed.length) toast.error(`${failed.length} could not be added. ${failed[0]}`);
    if (done) onDone();
    if (!failed.length) { reset(); onClose(); }
  };

  return <Sheet open={open} locked={busy} onClose={close} labelledBy="import-title" className="max-w-xl">
    <h2 id="import-title" className="text-xl font-semibold text-ink">Import recipients from CSV</h2>
    <p className="mt-1 text-base text-muted">Add many recipients at once. Dates can be 2025-11-09 or 09/11/2025.</p>
    <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(RECIPIENT_TEMPLATE)}`} download="recipients-template.csv" className="press mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-medium text-ink hover:bg-slate-50"><Download size={16} /> Download template</a>

    <label className="mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-8 text-center transition hover:border-brand/50 hover:bg-brand/5">
      <FileUp size={26} className="text-brand" />
      <span className="text-base font-medium text-ink">{fileName || "Choose a CSV file"}</span>
      <span className="text-sm text-muted">{fileName ? "Choose a different file" : "Name, mobile, address, city and PIN code are required"}</span>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void choose(event.target.files?.[0])} />
    </label>

    {problem && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{problem}</p>}
    {rows.length > 0 && <div className="mt-5">
      <p className="text-base text-ink"><strong>{valid.length}</strong> ready to import{invalid.length > 0 && <>, <strong className="text-rose-700">{invalid.length}</strong> need fixing</>}</p>
      {invalid.length > 0 && <ul className="scroll-clean mt-3 max-h-40 space-y-1.5 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{invalid.map((row) => <li key={row.line}><span className="font-medium">Row {row.line} · {row.name}:</span> {row.error}</li>)}</ul>}
      {invalid.length > 0 && valid.length > 0 && <p className="mt-2 text-sm text-muted">Rows that need fixing will be skipped.</p>}
    </div>}

    {busy && <div className="mt-5" role="status"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(progress! / Math.max(valid.length, 1)) * 100}%` }} /></div><p className="mt-2 text-sm text-muted">Adding {progress} of {valid.length}…</p></div>}

    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:justify-end">
      <Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button>
      <Button disabled={busy || !valid.length} onClick={() => void run()}>{busy ? "Importing…" : valid.length ? `Import ${valid.length} recipient${valid.length === 1 ? "" : "s"}` : "Import"}</Button>
    </div>
  </Sheet>;
}
