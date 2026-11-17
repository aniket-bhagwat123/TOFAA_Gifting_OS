"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FormatMenu } from "@/components/ui/format-menu";
import { loadAllModuleRecords, rowsOf } from "@/features/modules/module-utils";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { ACCEPT, type FileFormat, type Table, readTable, writeTable } from "@/lib/data-io";
import { FIELDS, FIELD_HEADERS, type BuiltRow, type FieldKey, autoMap, buildRecipient, templateRows } from "@/lib/recipient-fields";

/** Saves the import template in any format. */
export const downloadRecipientTemplate = (format: FileFormat) => writeTable(FIELD_HEADERS, templateRows(), format, "recipients-template");

interface Prepared extends BuiltRow { line: number; duplicate?: boolean }
const select = "min-h-9 w-full rounded-md border border-line bg-white px-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";
const POOL = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const statusOf = (error: unknown) => (error as { response?: { status?: number } })?.response?.status;
// No reply at all, or the server answering that it is busy or failed: worth another try.
const isTransient = (error: unknown) => { const status = statusOf(error); return status === undefined || status === 500 || status === 502 || status === 503 || status === 504; };

/** Creates one recipient. A dropped connection or a busy server is retried a couple of times. If the earlier try had in fact saved the
 *  person, the retry is refused as a duplicate mobile number, and that is treated as success. */
async function createWithRetry(payload: Record<string, unknown>, headers: Record<string, string>, endpoint: string): Promise<{ id?: string }> {
  for (let attempt = 0; ; attempt++) {
    try { return await mutateModule("post", endpoint, payload, undefined, headers) as { id?: string }; }
    catch (error) {
      if (attempt > 0 && statusOf(error) === 409 && /mobile number already exists/i.test(getApiErrorMessage(error))) {
        const found = await getModuleRecords(endpoint, { search: String(payload.mobileNumber ?? ""), limit: 5, page: 1 }).catch(() => null);
        const match = (rowsOf(found) as Array<{ id?: string; mobileNumber?: string }>).find((r) => r.mobileNumber === payload.mobileNumber);
        if (match) return { id: match.id };
      }
      if (attempt >= 2 || !isTransient(error)) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
}

/** Import recipients from any common file (Excel, CSV, TSV, JSON, ODS ...). Columns are matched by their names and can be changed before importing. */
export function ImportRecipientsSheet({ open, endpoint, groupsEndpoint, onClose, onDone }: { open: boolean; endpoint: string; groupsEndpoint: string; onClose: () => void; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, string | null> | null>(null);
  const [problem, setProblem] = useState<string>();
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<"people" | "groups">("people");
  const [existingGroups, setExistingGroups] = useState<Array<{ id: string; name: string; recipientIds: string[] }>>([]);
  const [failures, setFailures] = useState<Array<{ line: number; name: string; reason: string }>>([]);
  const busy = progress !== null;

  const reset = () => { setFileName(""); setTable(null); setMapping(null); setProblem(undefined); setProgress(null); setFailures([]); if (input.current) input.current.value = ""; };
  const close = () => { if (busy) return; reset(); onClose(); };

  const choose = async (file?: File) => {
    if (!file) return;
    setFileName(file.name); setProblem(undefined); setFailures([]); setTable(null); setMapping(null);
    try {
      const read = await readTable(file); setTable(read); setMapping(autoMap(read.headers));
      if (groupsEndpoint) setExistingGroups(await loadAllModuleRecords(groupsEndpoint).then((rows) => rows as unknown as typeof existingGroups).catch(() => []));
    }
    catch (err) { setProblem(err instanceof Error ? err.message : "That file could not be read."); }
  };

  const prepared = useMemo<Prepared[]>(() => {
    if (!table || !mapping) return [];
    const seen = new Set<string>();
    return table.rows.map((row, index) => {
      const built = buildRecipient((key) => (mapping[key] ? row[mapping[key]!] : ""));
      const line = index + 2;
      // The same mobile number twice in one file would be refused by the second save.
      if (built.mobile && !built.errors.length) {
        if (seen.has(built.mobile)) return { ...built, line, payload: undefined, errors: ["This mobile number is already in the file."], duplicate: true };
        seen.add(built.mobile);
      }
      return { ...built, line };
    });
  }, [table, mapping]);
  const valid = prepared.filter((row) => row.payload);
  const invalid = prepared.filter((row) => !row.payload);
  const warned = valid.filter((row) => row.warnings.length);
  const missingRequired = FIELDS.filter((f) => f.required && !mapping?.[f.key]);

  // The groups named in the file, and whether each already exists.
  const groupNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of valid) for (const g of row.groups) if (!names.has(g.toLowerCase())) names.set(g.toLowerCase(), g);
    return [...names.entries()].map(([key, name]) => ({ key, name, exists: existingGroups.some((g) => g.name.trim().toLowerCase() === key) }));
  }, [valid, existingGroups]);

  const run = async () => {
    const failed: typeof failures = [];
    // Record the import first, so it shows up in Activity and can be reverted. If that is not available the import still runs.
    const batchesEndpoint = endpoint.replace(/\/recipients$/, "/import-batches");
    let batchId: string | null = null;
    try { batchId = ((await mutateModule("post", batchesEndpoint, { fileName: fileName || undefined, totalRows: table?.rows.length ?? valid.length })) as { id?: string })?.id ?? null; } catch { batchId = null; }
    const headers = { "X-Change-Source": "EXCEL_IMPORT", ...(batchId ? { "X-Import-Batch": batchId } : {}) };
    const madeGroupIds: string[] = [];
    const members = new Map<string, { name: string; ids: string[] }>(); // group -> the people just added to it
    let done = 0, finished = 0, next = 0;
    setPhase("people"); setProgress(0);
    const worker = async () => {
      while (next < valid.length) {
        const row = valid[next++];
        try {
          const created = await createWithRetry(row.payload!, headers, endpoint);
          done++;
          if (created?.id) for (const g of row.groups) { const key = g.toLowerCase(); const entry = members.get(key) ?? { name: g, ids: [] }; entry.ids.push(created.id); members.set(key, entry); }
        } catch (error) { failed.push({ line: row.line, name: row.name, reason: getApiErrorMessage(error) }); }
        setProgress(++finished);
      }
    };
    await Promise.all(Array.from({ length: Math.min(POOL, valid.length) }, worker));

    // Groups are created from the file itself: an existing group (same name) gets the new people, otherwise a new group is made.
    let made = 0, filled = 0;
    const groupProblems: string[] = [];
    if (members.size && groupsEndpoint) {
      setPhase("groups"); setProgress(0);
      let current = existingGroups;
      try { current = await loadAllModuleRecords(groupsEndpoint) as unknown as typeof existingGroups; } catch { /* use what was loaded when the file was chosen */ }
      let step = 0;
      for (const [key, entry] of members) {
        const found = current.find((g) => g.name.trim().toLowerCase() === key);
        try {
          if (found) { await mutateModule("put", `${groupsEndpoint}/${found.id}`, { name: found.name, recipientIds: [...new Set([...found.recipientIds, ...entry.ids])] }); filled++; }
          else { const group = await mutateModule("post", groupsEndpoint, { name: entry.name, recipientIds: entry.ids }) as { id?: string }; if (group?.id) madeGroupIds.push(group.id); made++; }
        } catch (error) { groupProblems.push(`${entry.name}: ${getApiErrorMessage(error)}`); }
        setProgress(++step);
      }
    }
    if (batchId) { try { await mutateModule("patch", `${batchesEndpoint}/${batchId}`, { createdCount: done, failedCount: failed.length + invalid.length, groupsCreated: madeGroupIds, groupsUpdated: filled }); } catch { /* the people are saved; only the history line is missing */ } }
    setProgress(null);
    if (done) { toast.success(`${done} recipient${done === 1 ? "" : "s"} added.${made || filled ? ` ${made ? `${made} group${made === 1 ? "" : "s"} created` : ""}${made && filled ? ", " : ""}${filled ? `${filled} group${filled === 1 ? "" : "s"} updated` : ""}.` : ""}`); onDone(); }
    if (groupProblems.length) toast.error(`Some groups could not be saved. ${groupProblems[0]}`);
    if (failed.length) { setFailures(failed.sort((a, b) => a.line - b.line)); toast.error(`${failed.length} could not be added.`); }
    else if (!groupProblems.length) { reset(); onClose(); }
  };

  const downloadProblems = () => {
    const rows = [...invalid.map((r) => [r.line, r.name, r.errors.join(" ")]), ...failures.map((f) => [f.line, f.name, f.reason])];
    writeTable(["Row", "Name", "Problem"], rows, "csv", "recipients-import-problems");
  };

  return <Sheet open={open} locked={busy} onClose={close} labelledBy="import-title" className="max-w-2xl">
    <h2 id="import-title" className="text-[17px] font-semibold text-ink">Import recipients</h2>
    <p className="mt-1 text-sm text-muted">Upload Excel, CSV, TSV, JSON or ODS. Columns are matched by name, so &ldquo;Phone Number&rdquo; and &ldquo;Mobile&rdquo; both work, and you can change any match below.</p>
    <FormatMenu align="start" onPick={downloadRecipientTemplate} className="press mt-4 inline-flex min-h-9 items-center gap-2 rounded-xl border border-line px-3.5 text-sm font-medium text-brand hover:bg-slate-50"><Download size={16} /> Download template</FormatMenu>

    <label className="mt-5 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line px-6 py-7 text-center transition hover:border-brand/50 hover:bg-brand/5">
      <FileUp size={26} className="text-brand" />
      <span className="text-base font-medium text-ink">{fileName || "Choose a file"}</span>
      <span className="text-sm text-muted">{fileName ? "Choose a different file" : "Name and mobile number are required. Everything else is optional, and a Group column creates the groups for you."}</span>
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(event) => void choose(event.target.files?.[0])} />
    </label>

    {problem && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{problem}</p>}

    {table && mapping && <div className="mt-5 space-y-5">
      <div>
        <p className="text-sm font-medium text-ink">Match your columns <span className="font-normal text-muted">· {table.rows.length} row{table.rows.length === 1 ? "" : "s"} found{table.sheet && !/^sheet\d*$/i.test(table.sheet) ? ` in “${table.sheet}”` : ""}</span></p>
        <div className="mt-2 divide-y divide-line/70 rounded-xl border border-line">
          {FIELDS.map((field) => <div key={field.key} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <span className="text-sm text-ink">{field.label}{field.required && <span className="text-rose-600"> *</span>}</span>
            <select aria-label={`Column for ${field.label}`} value={mapping[field.key] ?? ""} onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value || null })} className={select}>
              <option value="">{field.required ? "Choose a column" : "Not in my file"}</option>
              {table.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>)}
        </div>
        {missingRequired.length > 0 && <p role="alert" className="mt-2 text-sm text-rose-700">Choose a column for {missingRequired.map((f) => f.label).join(" and ")}.</p>}
      </div>

      {!missingRequired.length && <div>
        <p className="text-base text-ink"><strong>{valid.length}</strong> ready to import{invalid.length > 0 && <>, <strong className="text-rose-700">{invalid.length}</strong> need fixing</>}{warned.length > 0 && <>, <strong className="text-amber-700">{warned.length}</strong> with a note</>}</p>
        {invalid.length > 0 && <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{invalid.slice(0, 50).map((r) => <li key={r.line}><span className="font-medium">Row {r.line}{r.name ? ` · ${r.name}` : ""}:</span> {r.errors.join(" ")}</li>)}{invalid.length > 50 && <li className="text-muted">…and {invalid.length - 50} more</li>}</ul>}
        {warned.length > 0 && <details className="mt-2 text-sm text-amber-800"><summary className="cursor-pointer font-medium">See the notes</summary><ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">{warned.slice(0, 50).map((r) => <li key={r.line}>Row {r.line} · {r.name}: {r.warnings.join(" ")}</li>)}</ul></details>}
        {groupNames.length > 0 && <p className="mt-2 text-sm text-ink">Groups from the file: {groupNames.map((g, i) => <span key={g.key}>{i > 0 && ", "}<strong>{g.name}</strong> <span className="text-muted">({g.exists ? "exists, people are added" : "will be created"})</span></span>)}</p>}
        {invalid.length > 0 && valid.length > 0 && <p className="mt-2 text-sm text-muted">Rows that need fixing are skipped.</p>}
      </div>}
    </div>}

    {failures.length > 0 && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      <p className="font-medium">{failures.length} could not be added</p>
      <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">{failures.slice(0, 30).map((f) => <li key={f.line}>Row {f.line} · {f.name}: {f.reason}</li>)}</ul>
    </div>}

    {busy && <div className="mt-5" role="status"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(progress! / Math.max(phase === "groups" ? groupNames.length : valid.length, 1)) * 100}%` }} /></div><p className="mt-2 text-sm text-muted">{phase === "groups" ? `Setting up groups… ${progress} of ${groupNames.length}` : `Adding ${progress} of ${valid.length}…`}</p></div>}

    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:items-center sm:justify-end">
      {(invalid.length > 0 || failures.length > 0) && <Button variant="ghost" disabled={busy} onClick={downloadProblems} className="sm:mr-auto">Download problems</Button>}
      <Button variant="secondary" disabled={busy} onClick={close}>{failures.length ? "Close" : "Cancel"}</Button>
      <Button disabled={busy || !valid.length || missingRequired.length > 0 || failures.length > 0} onClick={() => void run()}>{busy ? "Importing…" : valid.length ? `Import ${valid.length} recipient${valid.length === 1 ? "" : "s"}` : "Import"}</Button>
    </div>
  </Sheet>;
}
