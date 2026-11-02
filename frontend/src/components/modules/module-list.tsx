"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Power, ShieldQuestion, Trash2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadModule } from "@/features/modules/modules.slice";
import { moduleConfig, type ModuleAction, type ModuleField } from "@/features/modules/module-config";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { titleCase } from "@/lib/utils";
import Link from "next/link";
import { getApiErrorMessage } from "@/services/api-client";
import { toast } from "sonner";

function rowsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  if (data && typeof data === "object") {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) return items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    return [data as Record<string, unknown>];
  }
  return [];
}

async function loadAllModuleRecords(endpoint: string): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  const limit = 100;
  let page = 1;
  let total = Infinity;
  while (records.length < total) {
    const data = await getModuleRecords(endpoint, { page, limit });
    const items = rowsOf(data);
    records.push(...items);
    const pagination = data && typeof data === "object" ? (data as any).pagination : undefined;
    total = Number(pagination?.total_records ?? pagination?.totalRecords ?? records.length);
    if (!items.length || records.length >= total) break;
    page += 1;
  }
  return records;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return String(value ?? "—");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(date);
}

const modalWidthClasses = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

type ModuleDialog =
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; destructive: boolean; icon: "status" | "delete"; onConfirm: () => Promise<void> }
  | { kind: "action"; action: ModuleAction; values: Record<string, string>; errors: Record<string, string> };

function RecipientMultiSelect({ options, selectedIds, loading, loadError, error, labelId, onChange }: {
  options: Record<string, unknown>[];
  selectedIds: string[];
  loading: boolean;
  loadError: string | null;
  error?: string;
  labelId: string;
  onChange: (id: string, selected: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);
  const visibleOptions = options.filter((recipient) => `${recipient.name ?? ""} ${recipient.mobileNumber ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const selectedNames = options.filter((recipient) => selectedIds.includes(String(recipient.id ?? ""))).map((recipient) => String(recipient.name ?? "Unnamed recipient"));
  return <div ref={rootRef} className="relative">
    <button type="button" aria-labelledby={labelId} aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2.5 text-left text-sm ${error ? "border-rose-400" : "border-line"}`}>
      <span className={selectedNames.length ? "truncate text-ink" : "text-muted"}>{selectedNames.length ? `${selectedNames.length} selected${selectedNames.length <= 2 ? `: ${selectedNames.join(", ")}` : `: ${selectedNames.slice(0, 2).join(", ")}…`}` : "Select recipients"}</span>
      <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-white p-2 shadow-lg">
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search recipients..." className="mb-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
      <div className="max-h-56 overflow-y-auto" role="group" aria-labelledby={labelId}>
      {loading ? <p className="p-3 text-sm text-muted">Loading recipients…</p> : loadError ? <p className="p-3 text-sm text-rose-600">{loadError}</p> : visibleOptions.length ? visibleOptions.map((recipient) => {
        const id = String(recipient.id ?? "");
        if (!id) return null;
        return <label key={id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
          <input type="checkbox" name="recipientIds" value={id} checked={selectedIds.includes(id)} onChange={(event) => onChange(id, event.target.checked)} className="h-4 w-4 accent-brand" />
          <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{String(recipient.name ?? "Unnamed recipient")}</span><span className="block text-xs text-muted">{String(recipient.mobileNumber ?? "")}</span></span>
        </label>;
      }) : <p className="p-3 text-sm text-muted">{options.length ? "No recipients match your search." : "No recipients found."}</p>}
      </div>
      {selectedIds.length > 0 && <p className="border-t border-line px-2 pt-2 text-xs text-muted">{selectedIds.length} recipient{selectedIds.length === 1 ? "" : "s"} selected</p>}
    </div>
    }
    {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
  </div>;
}

function SearchableApiSelect({ name, labelId, options, value, loading, loadError, placeholder, error, required = false, onChange }: {
  name: string;
  labelId: string;
  options: Array<{ id: string; label: string; searchText?: string }>;
  value: string;
  loading: boolean;
  loadError: string | null;
  placeholder: string;
  error?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);
  const selected = options.find((option) => option.id === value);
  const filteredOptions = options.filter((option) => `${option.label} ${option.searchText ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div ref={rootRef} className="relative">
    <input type="hidden" name={name} value={value} />
    <button type="button" aria-labelledby={labelId} aria-haspopup="listbox" aria-expanded={open} aria-invalid={!!error} disabled={loading || !!loadError} onClick={() => setOpen((current) => !current)} className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2.5 text-left text-sm disabled:bg-slate-50 ${error ? "border-rose-400" : "border-line"}`}>
      <span className={selected ? "truncate text-ink" : "text-muted"}>{selected?.label ?? (loadError ? "Unable to load options" : loading ? "Loading options…" : placeholder)}</span>
      <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-white p-2 shadow-lg">
      <div className="relative mb-2"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${placeholder.toLowerCase()}...`} className="w-full rounded-lg border border-line py-2 pl-9 pr-3 text-sm outline-none focus:border-brand" /></div>
      {loading ? <p className="p-3 text-sm text-muted">Loading options…</p> : loadError ? <p className="p-3 text-sm text-rose-600">{loadError}</p> : <div role="listbox" aria-labelledby={labelId} className="max-h-56 overflow-y-auto">
        {!required && <button type="button" role="option" aria-selected={!value} onClick={() => { onChange(""); setOpen(false); setSearch(""); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-slate-50">Clear selection</button>}
        {filteredOptions.map((option) => <button key={option.id} type="button" role="option" aria-selected={option.id === value} onClick={() => { onChange(option.id); setOpen(false); setSearch(""); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-slate-50">{option.label}</button>)}
        {!filteredOptions.length && <p className="p-3 text-sm text-muted">No matching options.</p>}
      </div>}
    </div>}
  </div>;
}

function BooleanSwitch({ name, labelId, value, error, onChange }: {
  name: string;
  labelId: string;
  value: string;
  error?: string;
  onChange: () => void;
}) {
  const [enabled, setEnabled] = useState(value === "true");
  useEffect(() => setEnabled(value === "true"), [value]);
  return <div className="flex items-center gap-3">
    <input type="hidden" name={name} value={String(enabled)} />
    <button type="button" role="switch" aria-labelledby={labelId} aria-checked={enabled} aria-invalid={!!error} onClick={() => { setEnabled((current) => !current); onChange(); }} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${error ? "ring-2 ring-rose-300" : ""} ${enabled ? "bg-brand" : "bg-slate-300"}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{enabled ? "Active" : "Inactive"}</span>
  </div>;
}

export function ModuleList({ moduleKey }: { moduleKey: string }) {
  const config = moduleConfig[moduleKey];
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const entry = useAppSelector((state) => state.modules.byKey[moduleKey]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<ModuleDialog | null>(null);
  const [recipientOptions, setRecipientOptions] = useState<Record<string, unknown>[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [selectedGiftRecipientId, setSelectedGiftRecipientId] = useState("");
  const [selectedGiftEventId, setSelectedGiftEventId] = useState("");
  const [selectedGiftOccasionId, setSelectedGiftOccasionId] = useState("");
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [eventOptions, setEventOptions] = useState<Record<string, unknown>[]>([]);
  const [occasionOptions, setOccasionOptions] = useState<Record<string, unknown>[]>([]);
  const [eventOptionsLoading, setEventOptionsLoading] = useState(false);
  const [occasionOptionsLoading, setOccasionOptionsLoading] = useState(false);
  const [eventOptionsError, setEventOptionsError] = useState<string | null>(null);
  const [occasionOptionsError, setOccasionOptionsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pageSize = config.pageSize ?? 20;

  const endpoint = useMemo(() => {
    try { return user ? config.endpoint(user, selectedTenantId) : null; }
    catch (error) { return error instanceof Error ? error.message : "This account is not linked to a tenant."; }
  }, [config, user, selectedTenantId]);
  const load = () => {
    if (user && typeof endpoint === "string") void dispatch(loadModule({ key: moduleKey, endpoint, params: { page, limit: pageSize } }));
  };
  useEffect(() => { load(); }, [endpoint, page, pageSize, moduleKey]);

  useEffect(() => {
    if ((moduleKey !== "recipient-groups" && moduleKey !== "gifts") || !user || typeof endpoint !== "string") return;
    let cancelled = false;
    const tasks: Promise<void>[] = [];
    const recipientTask = loadAllModuleRecords(moduleConfig.recipients.endpoint(user, selectedTenantId))
      .then((items) => { if (!cancelled) setRecipientOptions(items); })
      .catch((error) => { if (!cancelled) setRecipientsError(getApiErrorMessage(error)); })
      .finally(() => { if (!cancelled) setRecipientsLoading(false); });
    setRecipientsLoading(true);
    setRecipientsError(null);
    setRecipientOptions([]);
    tasks.push(recipientTask);
    if (moduleKey === "gifts") {
      setEventOptionsLoading(true);
      setEventOptionsError(null);
      setEventOptions([]);
      tasks.push(loadAllModuleRecords(moduleConfig.events.endpoint(user, selectedTenantId))
        .then((items) => { if (!cancelled) setEventOptions(items); })
        .catch((error) => { if (!cancelled) setEventOptionsError(getApiErrorMessage(error)); })
        .finally(() => { if (!cancelled) setEventOptionsLoading(false); }));
      setOccasionOptionsLoading(true);
      setOccasionOptionsError(null);
      setOccasionOptions([]);
      tasks.push(loadAllModuleRecords(moduleConfig.occasions.endpoint(user, selectedTenantId))
        .then((items) => { if (!cancelled) setOccasionOptions(items); })
        .catch((error) => { if (!cancelled) setOccasionOptionsError(getApiErrorMessage(error)); })
        .finally(() => { if (!cancelled) setOccasionOptionsLoading(false); }));
    }
    void Promise.all(tasks);
    return () => { cancelled = true; };
  }, [moduleKey, user, selectedTenantId, endpoint]);

  const rows = rowsOf(entry?.data);
  const filteredRows = rows.filter((row) => !search || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(search.toLowerCase())));
  const pagination = entry?.data && typeof entry.data === "object" ? (entry.data as any).pagination : undefined;
  const total = Number(pagination?.totalRecords ?? pagination?.total_records ?? pagination?.total ?? (entry?.data && typeof entry.data === "object" ? (entry.data as any).total : undefined) ?? rows.length);
  const totalPages = Math.max(1, Number(pagination?.pages ?? Math.ceil(total / pageSize)));
  const columns = config.columns.length ? config.columns : Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
  const recipientNameById = new Map(recipientOptions.map((recipient) => [String(recipient.id ?? ""), String(recipient.name ?? "Unknown recipient")]));
  const isList = Array.isArray(entry?.data) || !!(entry?.data && typeof entry.data === "object" && Array.isArray((entry.data as any).items));
  const isClient = user?.platformRole === "CLIENT";
  const isSuperAdmin = user?.platformRole === "SUPER_ADMIN";
  const canCreate = !!config.createFields && (moduleKey !== "clients" || isSuperAdmin) && (moduleKey !== "requests" || isClient) && (moduleKey !== "credits" || isClient);
  const editableFields = moduleKey === "requests" && !isClient ? undefined : config.updateFields;
  const canEdit = !!editableFields && (moduleKey !== "clients" || isSuperAdmin) && (moduleKey !== "team-users" || !!selectedTenantId);

  const saveRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof endpoint !== "string") return;
    const fields = editor ? editableFields : config.createFields;
    if (!fields) return;
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    const params: Record<string, string> = {};
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const selectedIds = field.type === "recipient-multi-select" ? form.getAll(field.name).map(String) : [];
      const raw = field.type === "recipient-multi-select" ? selectedIds.join(",") : String(form.get(field.name) ?? "").trim();
      if (field.required && !raw) { nextErrors[field.name] = `${field.label} is required.`; continue; }
      if (field.type === "email" && raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) { nextErrors[field.name] = "Enter a valid email address."; continue; }
      if (field.type === "number" && raw && !Number.isFinite(Number(raw))) { nextErrors[field.name] = `Enter a valid ${field.label.toLowerCase()}.`; continue; }
      if (field.type === "number-list" && raw && raw.split(/[\n,]+/).some((value) => !Number.isFinite(Number(value.trim())))) { nextErrors[field.name] = "Enter valid numbers separated by commas."; continue; }
      if (!raw) continue;
      if (field.query) { params[field.name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = raw; continue; }
      if (field.name === "addressLine1" || field.name === "city" || field.name === "postalCode") continue;
      body[field.name] = field.type === "recipient-multi-select" ? selectedIds : field.name === "recipientIds" ? raw.split(/[\n,]+/).map((id) => id.trim()).filter(Boolean) : field.type === "number-list" ? raw.split(/[\n,]+/).map(Number).filter(Number.isFinite) : field.type === "number" ? Number(raw) : field.type === "select" && (raw === "true" || raw === "false") ? raw === "true" : raw;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (moduleKey === "recipients" && editor) {
      body.address = {
        addressLine1: String(form.get("addressLine1") ?? "").trim(),
        city: String(form.get("city") ?? "").trim(),
        postalCode: String(form.get("postalCode") ?? "").trim(),
        country: "IN"
      };
    }
    if ((moduleKey === "requests" || moduleKey === "gifts") && !editor && (!!body.eventId === !!body.occasionId)) {
      const message = body.eventId ? "Choose only one: event or occasion." : "Choose an event or occasion.";
      setFieldErrors({ [body.eventId ? "occasionId" : "eventId"]: message });
      return;
    }
    let path = endpoint;
    if (editor) {
      path = config.updateEndpoint?.(endpoint, editor) ?? (moduleKey === "gifts" ? `/gifts/${editor.id}` : moduleKey === "team-users" ? `/tenants/${selectedTenantId}/users/${editor.id}` : `${endpoint}/${editor.id}`);
    } else if (moduleKey === "team-users") path = `/tenants/${selectedTenantId}/users`;
    setSaving(true);
    try {
      await mutateModule(editor ? config.updateMethod ?? "patch" : "post", path, body, params, moduleKey === "credits" && !editor ? { "Idempotency-Key": crypto.randomUUID() } : undefined);
      toast.success(editor ? `${config.title} updated.` : `${config.title} created.`);
      setEditor(undefined);
      setSelectedRecipientIds([]);
      void dispatch(loadModule({ key: moduleKey, endpoint, params: { page, limit: pageSize } }));
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setSaving(false); }
  };

  const deleteRecord = async (row: Record<string, unknown>) => {
    if (!config.deletePath || typeof endpoint !== "string") return;
    setDialog({
      kind: "confirm",
      title: `Delete ${config.title.toLowerCase().replace(/s$/, "")}`,
      message: `Are you sure you want to delete this ${config.title.toLowerCase().replace(/s$/, "")}?`,
      confirmLabel: "Delete",
      destructive: true,
      icon: "delete",
      onConfirm: async () => {
        setSaving(true);
        try {
          await mutateModule("delete", config.deletePath!(endpoint, String(row.id)));
          toast.success(`${config.title} deleted.`);
          setDialog(null);
          void dispatch(loadModule({ key: moduleKey, endpoint, params: { page, limit: pageSize } }));
        } catch (error) { toast.error(getApiErrorMessage(error)); }
        finally { setSaving(false); }
      }
    });
  };

  const runAction = (action: ModuleAction) => {
    if (action.prompts?.length) {
      setDialog({ kind: "action", action, values: {}, errors: {} });
      return;
    }
    const statusAction = /^(activate|deactivate)$/i.test(action.label);
    setDialog({
      kind: "confirm",
      title: action.label,
      message: statusAction ? `Are you sure you want to ${action.label.toLowerCase()} this?` : `Are you sure you want to ${action.label.toLowerCase()}?`,
      confirmLabel: action.label,
      destructive: /deactivate|cancel|reject|delete/i.test(action.label),
      icon: "status",
      onConfirm: () => performAction(action, {})
    });
  };

  const performAction = async (action: ModuleAction, values: Record<string, string>) => {
    const body: Record<string, unknown> = { ...action.payload };
    let path = action.path;
    const errors: Record<string, string> = {};
    for (const field of action.prompts ?? []) {
      const value = String(values[field.key] ?? "").trim();
      if (!value) { if (field.required) errors[field.key] = `${field.label} is required.`; continue; }
      if (field.type === "number" && !Number.isFinite(Number(value))) { errors[field.key] = `Enter a valid ${field.label.toLowerCase()}.`; continue; }
      if (!field.pathOnly && field.type === "json") {
        try { body[field.key] = JSON.parse(value); }
        catch { errors[field.key] = `${field.label} must be valid JSON.`; continue; }
      }
      if (field.pathOnly) path = path.replace(`{${field.key}}`, value);
      else if (field.type === "number") body[field.key] = Number(value);
      else if (field.type !== "json") body[field.key] = value;
    }
    if (Object.keys(errors).length) {
      setDialog({ kind: "action", action, values, errors });
      return;
    }
    setSaving(true);
    try {
      const headers = action.idempotency ? { "Idempotency-Key": crypto.randomUUID() } : undefined;
      await mutateModule(action.method, path, body, undefined, headers);
      toast.success(`${action.label} completed.`);
      setDialog(null);
      if (typeof endpoint === "string") void dispatch(loadModule({ key: moduleKey, endpoint, params: { page, limit: pageSize } }));
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setSaving(false); }
  };

  return <>
    <PageHeader title={config.title} description={config.description} action={moduleKey === "recipients" ? <Link href="/recipients/new"><Button variant="primary">Add recipient</Button></Link> : moduleKey === "gift-spend-settings" ? <Button variant="primary" disabled={!entry?.data} onClick={() => setEditor(entry?.data as Record<string, unknown>)}>Edit settings</Button> : canCreate ? <Button variant="primary" onClick={() => { setFieldErrors({}); setSelectedRecipientIds([]); setSelectedGiftRecipientId(""); setSelectedGiftEventId(""); setSelectedGiftOccasionId(""); setEditor(null); }}>Add {config.title.replace(/s$/, "").toLowerCase()}</Button> : undefined} />
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}...`} className="w-full rounded-xl border border-line bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10" /></div>
        <Button variant="secondary" size="sm" onClick={load} disabled={entry?.status === "loading"}><RefreshCw size={14} className={entry?.status === "loading" ? "animate-spin" : ""} /> Refresh</Button>
      </div>
      {typeof endpoint === "string" && entry?.error && <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{entry.error}</div>}
      {typeof endpoint !== "string" && <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{endpoint}</div>}
      {columns.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((col) => <th key={col} className="px-5 py-3.5 font-semibold">{titleCase(col)}</th>)}{(canEdit || config.deletePath || config.actions) && <th className="px-5 py-3.5 font-semibold">Actions</th>}</tr></thead>
        <tbody className="divide-y divide-line">
          {entry?.status === "loading" && !entry.data ? Array.from({ length: 5 }).map((_, i) => <tr key={i}>{columns.map((col) => <td key={col} className="px-5 py-4"><div className="h-4 w-24 animate-pulse rounded bg-slate-100" /></td>)}</tr>)
            : filteredRows.length ? filteredRows.map((row, i) => { let actions: ModuleAction[] = []; try { if (user) actions = config.actions?.(row, user, selectedTenantId) ?? []; } catch { actions = []; } return <tr key={String(row.id || i)} className="hover:bg-slate-50/70">{columns.map((col) => { const value = row[col]; const isBoolean = typeof value === "boolean" || value === "true" || value === "false"; return <td key={col} className="px-5 py-4 text-slate-600">{col === "role" && value === "CLIENT" ? "Tenant" : moduleKey === "recipient-groups" && col === "recipientIds" && Array.isArray(value) ? value.map((id) => recipientNameById.get(String(id)) ?? (recipientsLoading ? "Loading recipient…" : "Unknown recipient")).join(", ") || "—" : String(col).toLowerCase().includes("status") || col === "slaState" || isBoolean ? <StatusBadge value={typeof value === "boolean" ? value : String(value ?? "")} /> : col === "createdAt" || col === "created_at" ? formatTimestamp(value) : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "—")}</td>; })}{(canEdit || config.deletePath || config.actions) && <td className="px-5 py-4"><div className="flex flex-wrap gap-2">{canEdit && <Button size="sm" variant="secondary" onClick={() => { setFieldErrors({}); setSelectedRecipientIds(Array.isArray(row.recipientIds) ? row.recipientIds.map(String) : []); setEditor(row); }}>Edit</Button>}{config.deletePath && <Button size="sm" variant="secondary" onClick={() => void deleteRecord(row)}>Delete</Button>}{actions.map((action) => <Button key={action.label} size="sm" variant="secondary" onClick={() => void runAction(action)}>{action.label}</Button>)}</div></td>}</tr>; })
            : <tr><td colSpan={columns.length + (canEdit || config.deletePath || config.actions ? 1 : 0)} className="px-5 py-16 text-center"><p className="font-medium text-ink">{entry?.status === "loading" ? "Loading records…" : `No ${config.title.toLowerCase()} found`}</p><p className="mt-1 text-xs text-muted">{entry?.error ? "Resolve the API error and refresh." : "Records returned by the API will appear here."}</p></td></tr>}
        </tbody>
      </table></div> : <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{filteredRows.length ? filteredRows.flatMap((row) => Object.entries(row)).map(([key, value]) => <div key={key} className="rounded-xl border border-line p-4"><p className="text-xs text-muted">{titleCase(key)}</p><p className="mt-1 break-words text-sm font-medium text-ink">{typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}</p></div>) : <p className="col-span-full py-10 text-center text-sm text-muted">{entry?.status === "loading" ? "Loading summary…" : "No summary data returned by the API."}</p>}</div>}
      {isList && <div className="flex items-center justify-between border-t border-line px-5 py-4"><p className="text-xs text-muted">{total ? `Page ${page} · ${total} records` : "No records"}</p><div className="flex items-center gap-2"><Button variant="secondary" size="sm" disabled={page <= 1 || entry?.status === "loading"} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15} /> Previous</Button><span className="px-2 text-xs text-muted">Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page >= totalPages || entry?.status === "loading"} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={15} /></Button></div></div>}
    </Card>
    {editor !== undefined && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setEditor(undefined); setFieldErrors({}); setSelectedRecipientIds([]); } }}>
      <section role="dialog" aria-modal="true" aria-labelledby="module-form-title" className={`max-h-[90vh] w-full ${modalWidthClasses[config.modalWidth ?? "md"]} overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}>
        <h2 id="module-form-title" className="text-lg font-semibold text-ink">{editor ? `Edit ${config.title.toLowerCase().replace(/s$/, "")}` : `Add ${config.title.toLowerCase().replace(/s$/, "")}`}</h2>
        <form noValidate onSubmit={saveRecord} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(editor ? editableFields : config.createFields)?.map((field: ModuleField) => {
              const address = editor?.address as Record<string, unknown> | undefined;
              const value = field.name === "addressLine1" ? address?.addressLine1 : field.name === "city" ? address?.city : field.name === "postalCode" ? address?.postalCode : editor?.[field.name];
              const error = fieldErrors[field.name];
              const fieldId = `module-field-${field.name}`;
              const sourceOptions = field.source === "events" ? eventOptions : field.source === "occasions" ? occasionOptions : [];
              const sourceLoading = field.source === "events" ? eventOptionsLoading : occasionOptionsLoading;
              const sourceError = field.source === "events" ? eventOptionsError : occasionOptionsError;
              return <div key={field.name} className={`space-y-1.5 text-sm ${field.type === "textarea" || field.type === "recipient-multi-select" ? "sm:col-span-2" : ""}`}>
                {field.type !== "date" && <label id={`${fieldId}-label`} htmlFor={fieldId} className="block font-medium text-ink">{field.label}{field.required ? " *" : ""}</label>}
                {field.type === "date" ? <DatePickerField id={fieldId} name={field.name} label={field.label} value={String(value ?? "")} error={error} required={field.required} onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: "" }))} /> : field.type === "recipient-multi-select" ? <RecipientMultiSelect
                  options={recipientOptions}
                  selectedIds={selectedRecipientIds}
                  loading={recipientsLoading}
                  loadError={recipientsError}
                  error={error}
                  labelId={`${fieldId}-label`}
                  onChange={(id, selected) => {
                    setSelectedRecipientIds((current) => selected ? [...current, id] : current.filter((currentId) => currentId !== id));
                    setFieldErrors((current) => ({ ...current, [field.name]: "" }));
                  }}
                /> : field.type === "recipient-select" && moduleKey === "gifts" ? <SearchableApiSelect name={field.name} labelId={`${fieldId}-label`} options={recipientOptions.map((option) => ({ id: String(option.id ?? ""), label: `${String(option.name ?? "Unnamed recipient")} · ${String(option.mobileNumber ?? "")}`, searchText: String(option.mobileNumber ?? "") }))} value={selectedGiftRecipientId} loading={recipientsLoading} loadError={recipientsError} placeholder="Select a recipient" error={error} required={field.required} onChange={(value) => { setSelectedGiftRecipientId(value); setFieldErrors((current) => ({ ...current, [field.name]: "" })); }} /> : field.type === "api-select" ? <SearchableApiSelect name={field.name} labelId={`${fieldId}-label`} options={sourceOptions.map((option) => { const id = String(option.id ?? ""); const name = String(field.source === "events" ? option.eventName ?? "Unnamed event" : option.occasionName ?? "Unnamed occasion"); const date = field.source === "events" ? option.eventDate : option.occasionDate; return { id, label: `${name}${date ? ` · ${String(date)}` : ""}` }; })} value={field.name === "eventId" ? selectedGiftEventId : selectedGiftOccasionId} loading={sourceLoading} loadError={sourceError} placeholder={`Select ${field.label.toLowerCase()}`} error={error} onChange={(value) => { if (field.name === "eventId") setSelectedGiftEventId(value); else setSelectedGiftOccasionId(value); setFieldErrors((current) => ({ ...current, [field.name]: "" })); }} /> : field.type === "select" && field.options?.includes("true") && field.options?.includes("false") ? <BooleanSwitch name={field.name} labelId={`${fieldId}-label`} value={String(value ?? field.options[0])} error={error} onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: "" }))} /> : field.type === "textarea" ? <textarea id={fieldId} name={field.name} required={field.required} aria-invalid={!!error} aria-describedby={error ? `${field.name}-error` : undefined} onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: "" }))} defaultValue={String(value ?? "")} rows={3} className={`w-full rounded-xl border px-3 py-2.5 outline-none focus:border-brand ${error ? "border-rose-400" : "border-line"}`} /> : field.type === "select" ? <select id={fieldId} name={field.name} required={field.required} aria-invalid={!!error} aria-describedby={error ? `${field.name}-error` : undefined} onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: "" }))} defaultValue={String(value ?? field.options?.[0] ?? "")} className={`w-full rounded-xl border bg-white px-3 py-2.5 ${error ? "border-rose-400" : "border-line"}`}>{field.options?.map((option) => <option key={option} value={option}>{field.optionLabels?.[option] ?? titleCase(option)}</option>)}</select> : <input id={fieldId} name={field.name} type={field.type === "number-list" || field.type === "recipient-select" ? "text" : field.type ?? "text"} required={field.required} aria-invalid={!!error} aria-describedby={error ? `${field.name}-error` : undefined} onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: "" }))} defaultValue={Array.isArray(value) ? value.join(", ") : String(value ?? "")} className={`w-full rounded-xl border px-3 py-2.5 outline-none focus:border-brand ${error ? "border-rose-400" : "border-line"}`} />}
                {field.source && sourceError && <p className="text-xs text-rose-600">Could not load {field.label.toLowerCase()}: {sourceError}</p>}
                {error && field.type !== "date" && <p id={`${field.name}-error`} className="text-xs text-rose-600">{error}</p>}
              </div>;
            })}
          </div>
          <div className="flex justify-end gap-3 border-t border-line pt-4"><Button type="button" variant="secondary" disabled={saving} onClick={() => { setEditor(undefined); setFieldErrors({}); setSelectedRecipientIds([]); }}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editor ? "Save changes" : "Create"}</Button></div>
        </form>
      </section>
    </div>}
    {dialog && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialog(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="action-dialog-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${dialog.kind === "confirm" && dialog.destructive ? "bg-rose-50 text-rose-600" : "bg-brand/10 text-brand"}`}>
          {dialog.kind === "action" ? <ShieldQuestion size={26} /> : dialog.icon === "delete" ? <Trash2 size={25} /> : <Power size={25} />}
        </div>
        <h2 id="action-dialog-title" className="text-center text-lg font-semibold text-ink">{dialog.kind === "confirm" ? dialog.title : dialog.action.label}</h2>
        {dialog.kind === "confirm" ? <p className="mt-2 text-center text-sm text-muted">{dialog.message}</p> : <form noValidate onSubmit={(event) => { event.preventDefault(); void performAction(dialog.action, dialog.values); }} className="mt-4 space-y-4">
          {dialog.action.prompts?.map((field, index) => <label key={field.key} className="block space-y-1.5 text-sm">
            <span className="font-medium text-ink">{field.label}{field.required ? " *" : ""}</span>
            {field.type === "json" ? <textarea autoFocus={index === 0} value={dialog.values[field.key] ?? ""} onChange={(event) => setDialog({ ...dialog, values: { ...dialog.values, [field.key]: event.target.value }, errors: { ...dialog.errors, [field.key]: "" } })} rows={5} className={`w-full rounded-xl border px-3 py-2.5 outline-none focus:border-brand ${dialog.errors[field.key] ? "border-rose-400" : "border-line"}`} /> : <input autoFocus={index === 0} type={field.type === "number" ? "number" : "text"} value={dialog.values[field.key] ?? ""} onChange={(event) => setDialog({ ...dialog, values: { ...dialog.values, [field.key]: event.target.value }, errors: { ...dialog.errors, [field.key]: "" } })} className={`w-full rounded-xl border px-3 py-2.5 outline-none focus:border-brand ${dialog.errors[field.key] ? "border-rose-400" : "border-line"}`} />}
            {dialog.errors[field.key] && <span className="block text-xs text-rose-600">{dialog.errors[field.key]}</span>}
          </label>)}
          <div className="flex justify-end gap-3 border-t border-line pt-4"><Button type="button" variant="secondary" disabled={saving} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Working…" : dialog.action.label}</Button></div>
        </form>}
        {dialog.kind === "confirm" && <div className="mt-6 flex justify-center gap-3 border-t border-line pt-4"><Button type="button" variant="secondary" disabled={saving} onClick={() => setDialog(null)}>Cancel</Button><Button type="button" variant={dialog.destructive ? "danger" : "primary"} disabled={saving} onClick={() => void dialog.onConfirm()}>{saving ? "Working…" : dialog.confirmLabel}</Button></div>}
      </section>
    </div>}
  </>;
}
