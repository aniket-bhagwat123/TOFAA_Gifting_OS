"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search,ChevronLeft, ChevronRight, Power, ShieldQuestion, Trash2, Plus, Pencil } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadModule } from "@/features/modules/modules.slice";
import { moduleConfig, type ModuleAction, type ModuleField } from "@/features/modules/module-config";
import { mutateModule } from "@/features/modules/module.service";
import { HoverScrollX } from "@/components/ui/hover-scroll-x";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { titleCase, formatCurrency, formatDate, cn } from "@/lib/utils";
import { control, table } from "@/components/ui/table-styles";
import { Sheet } from "@/components/ui/sheet";
import { FormPanel } from "@/components/ui/form-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { RecipientMultiSelect } from "./recipient-multi-select";
import { ClientCreateSheet } from "./client-create-sheet";
import { PasswordField } from "@/components/ui/password-field";
import { RequiredMark } from "@/components/ui/required-mark";
import { Avatar } from "@/components/ui/avatar";
import { ImageUpload, deleteImage, sendImage } from "@/components/ui/image-upload";
import { generatePassword, PASSWORD_MIN } from "@/lib/password";
import { rowsOf, loadAllModuleRecords, formatTimestamp, labelOf, moneyColumns, dateColumns } from "@/features/modules/module-utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getApiErrorMessage } from "@/services/api-client";
import { toast } from "sonner";


type ModuleDialog =
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; destructive: boolean; icon: "status" | "delete"; onConfirm: () => Promise<void> }
  | { kind: "action"; action: ModuleAction; values: Record<string, string>; errors: Record<string, string> };

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
  const [clientCreateOpen, setClientCreateOpen] = useState(false);
  const [clientEditTarget, setClientEditTarget] = useState<Record<string, unknown> | undefined>(undefined);
  const [userPassword, setUserPassword] = useState("");
  // The calendar is a controlled field: it shows what is kept here, so a pick has to be stored.
  const [dateValues, setDateValues] = useState<Record<string, string>>({});
  const pageSize = config.pageSize ?? 20;
  const noun = config.singular ?? config.title.toLowerCase().replace(/s$/, "");
  const searchParams = useSearchParams();
  const isUserModule = moduleKey === "team-users";

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

  useEffect(() => {
    // New user: start with a generated password the admin can see. Editing: blank = keep the current one.
    if (isUserModule) setUserPassword(editor === null ? generatePassword() : "");
  }, [editor, moduleKey]);
  useEffect(() => { setDateValues({}); }, [editor]);
  const openedFromLink = useRef(false);
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
  const canEdit = !!editableFields && (moduleKey !== "clients" || !isClient) && (moduleKey !== "team-users" || !!selectedTenantId);

  useEffect(() => {
    // Deep link from Home: /requests?new=1 opens the "add" sheet straight away.
    if (openedFromLink.current || searchParams.get("new") !== "1" || !canCreate || moduleKey === "recipients") return;
    openedFromLink.current = true;
    setFieldErrors({}); setEditor(null);
  }, [searchParams, canCreate, moduleKey]);

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
      if (field.type === "checkbox") { body[field.name] = !!raw; continue; }
      if (field.required && !raw) { nextErrors[field.name] = `Please fill in ${field.label.toLowerCase()}.`; continue; }
      if (field.type === "password" && !editor && !raw) { nextErrors[field.name] = "Please set a temporary password."; continue; }
      if (field.type === "password" && raw && raw.length < PASSWORD_MIN) { nextErrors[field.name] = `Use at least ${PASSWORD_MIN} characters.`; continue; }
      if (field.type === "email" && raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) { nextErrors[field.name] = "Enter a valid email address."; continue; }
      if (field.type === "number" && raw && !Number.isFinite(Number(raw))) { nextErrors[field.name] = `Enter a valid ${field.label.toLowerCase()}.`; continue; }
      if (field.type === "number-list" && raw && raw.split(/[\n,]+/).some((value) => !Number.isFinite(Number(value.trim())))) { nextErrors[field.name] = "Enter valid numbers separated by commas."; continue; }
      if (!raw) { if (editor && field.clearable) body[field.name] = null; continue; }
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
      const saved = await mutateModule(editor ? config.updateMethod ?? "patch" : "post", path, body, params, moduleKey === "credits" && !editor ? { "Idempotency-Key": crypto.randomUUID() } : undefined) as { invitationWarning?: string } | undefined;
      toast.success(editor ? `Changes saved.` : isUserModule ? (body.sendInvitation ? "Invitation sent. They'll receive a temporary password by email." : "User created. Share the temporary password with them.") : `Your ${noun} has been added.`);
      if (saved?.invitationWarning) toast.warning(saved.invitationWarning, { duration: 10000 });
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
      title: `Delete this ${noun}?`,
      message: `This can't be undone.`,
      confirmLabel: "Yes, delete",
      destructive: true,
      icon: "delete",
      onConfirm: async () => {
        setSaving(true);
        try {
          await mutateModule("delete", config.deletePath!(endpoint, String(row.id)));
          toast.success(`Deleted.`);
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
      message: statusAction ? `Do you want to ${action.label.toLowerCase()} this ${noun}?` : `Do you want to ${action.label.toLowerCase()}?`,
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
      if (!value) { if (field.required) errors[field.key] = `Please fill in this field.`; continue; }
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
      toast.success(`Done.`);
      setDialog(null);
      if (typeof endpoint === "string") void dispatch(loadModule({ key: moduleKey, endpoint, params: { page, limit: pageSize } }));
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setSaving(false); }
  };

  const hasActions = canEdit || !!config.deletePath || !!config.actions;
  const actionsFor = (row: Record<string, unknown>): ModuleAction[] => { try { return user ? config.actions?.(row, user, selectedTenantId) ?? [] : []; } catch { return []; } };
  /** Clients have a logo and team users a photo; everyone else shows no picture. */
  const pictureOf = (row: Record<string, unknown>) => (moduleKey === "clients" || moduleKey === "team-users" ? { url: (row.logoUrl ?? row.avatarUrl) as string | undefined } : null);
  const pictureEndpoint = (row: Record<string, unknown>) => (moduleKey === "clients" ? `/tenants/${row.id}/logo` : `/tenants/${selectedTenantId}/users/${row.id}/avatar`);
  const renderCell = (col: string, value: unknown): React.ReactNode => {
    if (col === "role") return value === "CLIENT" ? "Client" : titleCase(String(value ?? "—"));
    if (moduleKey === "recipient-groups" && col === "recipientIds" && Array.isArray(value)) {
      // Names arrive after the recipients load: say so once, not once per person.
      if (value.length && (recipientsLoading || (!recipientOptions.length && !recipientsError))) return "Loading…";
      return value.map((id) => recipientNameById.get(String(id)) ?? "Unknown").join(", ") || "—";
    }
    const isBoolean = typeof value === "boolean" || value === "true" || value === "false";
    if (String(col).toLowerCase().includes("status") || col === "slaState" || isBoolean) return <StatusBadge value={typeof value === "boolean" ? value : String(value ?? "")} />;
    if (col === "createdAt" || col === "created_at" || col === "changedAt") return formatTimestamp(value);
    if (value === null || value === undefined || value === "") return "—";
    if (col === "amountDueMinor") return formatCurrency(Number(value) / 100);
    if (moneyColumns.has(col)) return formatCurrency(value as string | number);
    if (dateColumns.has(col)) return formatDate(String(value));
    if (typeof value === "object") return Array.isArray(value) ? value.map((item) => (typeof item === "object" ? "" : String(item))).filter(Boolean).join(", ") || "—" : "—";
    return String(value);
  };
  const rowButtons = (row: Record<string, unknown>) => <>
    {canEdit && moduleKey === "clients" && <Button size="sm" variant="secondary" onClick={() => setClientEditTarget(row)}>Edit</Button>}
    {canEdit && moduleKey !== "clients" && <Button size="sm" variant="secondary" onClick={() => { setFieldErrors({}); setSelectedRecipientIds(Array.isArray(row.recipientIds) ? row.recipientIds.map(String) : []); setEditor(row); }}>Edit</Button>}
    {config.deletePath && <Button size="sm" variant="secondary" className="text-rose-700" onClick={() => void deleteRecord(row)}>Delete</Button>}
    {actionsFor(row).map((action) => <Button key={action.label} size="sm" variant="secondary" onClick={() => void runAction(action)}>{action.label}</Button>)}
  </>;
  const loadingFirst = entry?.status === "loading" && !entry.data;
  const emptyState = <EmptyState
    title={search ? "Nothing matches your search" : `No ${config.title.toLowerCase()} yet`}
    description={search ? "Try a different word or clear the search." : config.emptyHint ?? "Once something is added, it will show up here."}
    action={search ? undefined : moduleKey === "recipients" ? <Link href="/recipients?new=1"><Button><Plus size={17} /> Add person</Button></Link> : moduleKey === "clients" && canCreate ? <Button onClick={() => setClientCreateOpen(true)}><Plus size={17} /> Add client</Button> : canCreate ? <Button onClick={() => { setFieldErrors({}); setEditor(null); }}><Plus size={17} /> Add {noun}</Button> : undefined}
  />;

  return <>
    <ClientCreateSheet open={clientCreateOpen} onClose={() => setClientCreateOpen(false)} onCreated={load} />
    <ClientCreateSheet open={!!clientEditTarget} editClient={clientEditTarget} onClose={() => setClientEditTarget(undefined)} onCreated={load} />
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label={`Search ${config.title.toLowerCase()}`} placeholder={`Search ${config.title.toLowerCase()}`} className={cn(control, "w-full pl-9")} /></div>
        {moduleKey === "recipients" ? <Link href="/recipients?new=1"><Button variant="primary" size="lg"><Plus size={16} /> Add person</Button></Link> : moduleKey === "clients" && canCreate ? <Button variant="primary" size="lg" onClick={() => setClientCreateOpen(true)}><Plus size={16} /> Add client</Button> : canCreate ? <Button variant="primary" size="lg" onClick={() => { setFieldErrors({}); setSelectedRecipientIds([]); setSelectedGiftRecipientId(""); setSelectedGiftEventId(""); setSelectedGiftOccasionId(""); setEditor(null); }}><Plus size={16} /> Add {noun}</Button> : null}
      </div>
      {typeof endpoint === "string" && entry?.error && <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>We couldn't load this just now. {entry.error}</span><Button size="sm" variant="secondary" onClick={load}>Try again</Button></div>}
      {typeof endpoint !== "string" && <div role="alert" className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{endpoint}</div>}
      {columns.length ? <>
        <HoverScrollX wrapperClassName="hidden md:block"><table className={table.root}>
          <thead className={table.head}><tr className={table.headRow}>{columns.map((col) => <th key={col} className={table.th}>{labelOf(col)}</th>)}{hasActions && <th className={cn(table.th, "text-right")}>Actions</th>}</tr></thead>
          <tbody>
            {loadingFirst ? Array.from({ length: 5 }).map((_, i) => <tr key={i} className={table.rowCompact}>{columns.map((col) => <td key={col} className={table.td}><div className="h-4 w-24 animate-pulse rounded bg-slate-100" /></td>)}</tr>)
              : filteredRows.map((row, i) => <tr key={String(row.id || i)} className={table.row}>{columns.map((col, index) => <td key={col} className={`${table.td} ${index === 0 ? "font-semibold text-ink" : "text-slate-600"} ${col.toLowerCase().endsWith("name") ? "capitalize" : ""}`}>{index === 0 && pictureOf(row) ? <span className="flex items-center gap-3"><Avatar name={String(row[col] ?? "")} src={pictureOf(row)?.url} shape={moduleKey === "clients" ? "square" : "circle"} className="h-9 w-9 text-xs" />{renderCell(col, row[col])}</span> : renderCell(col, row[col])}</td>)}{hasActions && <td className={table.td}><div className="flex flex-wrap justify-end gap-1.5">{rowButtons(row)}</div></td>}</tr>)}
          </tbody>
        </table></HoverScrollX>
        <ul className="divide-y divide-line/70 md:hidden">
          {loadingFirst ? Array.from({ length: 3 }).map((_, i) => <li key={i} className="space-y-3 p-5"><div className="h-5 w-40 animate-pulse rounded bg-slate-100" /><div className="h-4 w-56 animate-pulse rounded bg-slate-100" /></li>)
            : filteredRows.map((row, i) => <li key={String(row.id || i)} className="space-y-3 p-5">
              <p className="text-base font-semibold text-ink">{renderCell(columns[0], row[columns[0]])}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">{columns.slice(1).map((col) => <div key={col} className="min-w-0"><dt className="text-muted">{labelOf(col)}</dt><dd className="mt-0.5 break-words font-medium text-ink">{renderCell(col, row[col])}</dd></div>)}</dl>
              {hasActions && <div className="flex flex-wrap gap-2 pt-1">{rowButtons(row)}</div>}
            </li>)}
        </ul>
        {!loadingFirst && !filteredRows.length && emptyState}
      </> : <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">{filteredRows.length ? filteredRows.flatMap((row) => Object.entries(row)).filter(([, value]) => typeof value !== "object" || value === null).map(([key, value]) => <div key={key} className="rounded-2xl border border-line/70 p-4"><p className="text-sm text-muted">{labelOf(key)}</p><p className="mt-1 break-words text-base font-semibold text-ink">{renderCell(key, value)}</p></div>) : <p className="col-span-full py-10 text-center text-sm text-muted">{entry?.status === "loading" ? "Loading…" : "Nothing to show yet."}</p>}</div>}
      {isList && totalPages > 1 && <div className={cn(table.footer, "flex-nowrap")}><p className="hidden text-sm text-muted sm:block">{total} in total</p><div className="flex w-full items-center justify-between gap-2 sm:w-auto"><Button variant="secondary" size="sm" disabled={page <= 1 || entry?.status === "loading"} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Previous</Button><span className="px-2 text-sm text-muted">Page {page} of {totalPages}</span><Button variant="secondary" size="sm" disabled={page >= totalPages || entry?.status === "loading"} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></Button></div></div>}
    </Card>
    <FormPanel open={editor !== undefined} locked={saving} width={config.modalWidth ?? "md"} onSubmit={saveRecord} icon={editor ? <Pencil size={26} /> : <Plus size={26} />}
      title={editor ? `Edit ${noun}` : `Add ${noun}`} description={editor ? `Change the details of this ${noun}.` : `Fill in the details to add a new ${noun}.`}
      onClose={() => { setEditor(undefined); setFieldErrors({}); setSelectedRecipientIds([]); }}
      footer={<div className="flex gap-3"><Button type="button" variant="secondary" className="flex-1" disabled={saving} onClick={() => { setEditor(undefined); setFieldErrors({}); setSelectedRecipientIds([]); }}>Cancel</Button><Button type="submit" className="flex-1" disabled={saving}>{saving ? "Saving…" : editor ? "Save changes" : isUserModule ? "Create User" : `Add ${noun}`}</Button></div>}>
        {editor && pictureOf(editor) && <div><ImageUpload shape={moduleKey === "clients" ? "square" : "circle"} name={String(editor.name ?? editor.fullName ?? "")} src={(editor.logoUrl ?? editor.avatarUrl) as string | null | undefined} label={moduleKey === "clients" ? "Choose a logo" : "Choose a photo"}
          onUpload={async (file) => { const saved = await sendImage<Record<string, unknown>>("put", pictureEndpoint(editor), file); setEditor({ ...editor, logoUrl: saved.logoUrl, avatarUrl: saved.avatarUrl }); load(); }}
          onRemove={async () => { const saved = await deleteImage(pictureEndpoint(editor)) as Record<string, unknown>; setEditor({ ...editor, logoUrl: saved?.logoUrl ?? null, avatarUrl: saved?.avatarUrl ?? null }); load(); }} /></div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {(editor ? editableFields : config.createFields)?.map((field: ModuleField) => {
              const address = editor?.address as Record<string, unknown> | undefined;
              const value = field.name === "addressLine1" ? address?.addressLine1 : field.name === "city" ? address?.city : field.name === "postalCode" ? address?.postalCode : editor?.[field.name];
              const error = fieldErrors[field.name];
              const fieldId = `module-field-${field.name}`;
              const sourceOptions = field.source === "events" ? eventOptions : field.source === "occasions" ? occasionOptions : [];
              const sourceLoading = field.source === "events" ? eventOptionsLoading : occasionOptionsLoading;
              const sourceError = field.source === "events" ? eventOptionsError : occasionOptionsError;
              return <div key={field.name} className={`space-y-1.5 text-sm ${field.type === "textarea" || field.type === "password" || field.type === "checkbox" || field.type === "recipient-multi-select" ? "sm:col-span-2" : ""}`}>
                {field.type !== "date" && field.type !== "password" && field.type !== "checkbox" && <label id={`${fieldId}-label`} htmlFor={fieldId} className="block text-sm font-medium text-ink"><span>{field.label}{field.required && <RequiredMark />}</span></label>}
                {field.type === "checkbox" ? <label htmlFor={fieldId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3"><input id={fieldId} name={field.name} type="checkbox" className="mt-0.5 h-5 w-5 accent-brand" /><span><span className="block text-base font-medium text-ink">{field.label}</span>{field.hint && <span className="block text-sm text-muted">{field.hint}</span>}</span></label> : field.type === "password" ? <><input type="hidden" name={field.name} value={userPassword} /><PasswordField key={String(editor?.id ?? "new")} label={editor ? "New password" : "Temporary password"} required={!editor} value={userPassword} onChange={(next) => { setUserPassword(next); setFieldErrors((current) => ({ ...current, [field.name]: "" })); }} error={error} allowGenerate showStrength={!!userPassword} defaultVisible={!editor} hint={editor ? "Leave blank to keep the current password." : "We generated a secure one for you. Change it if you like."} /></> : field.type === "date" ? <DatePickerField id={fieldId} name={field.name} label={field.label} value={dateValues[field.name] ?? String(value ?? "")} error={error} required={field.required} onChange={(picked) => { setDateValues((current) => ({ ...current, [field.name]: picked })); setFieldErrors((current) => ({ ...current, [field.name]: "" })); }} /> : field.type === "recipient-multi-select" ? <RecipientMultiSelect
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
                /> : field.type === "recipient-select" && moduleKey === "gifts" ? <SearchableSelect name={field.name} labelId={`${fieldId}-label`} options={recipientOptions.map((option) => ({ id: String(option.id ?? ""), label: `${String(option.name ?? "Unnamed recipient")} · ${String(option.mobileNumber ?? "")}`, searchText: String(option.mobileNumber ?? "") }))} value={selectedGiftRecipientId} loading={recipientsLoading} loadError={recipientsError} placeholder="Select a recipient" error={error} required={field.required} onChange={(value) => { setSelectedGiftRecipientId(value); setFieldErrors((current) => ({ ...current, [field.name]: "" })); }} /> : field.type === "api-select" ? <SearchableSelect name={field.name} labelId={`${fieldId}-label`} options={sourceOptions.map((option) => { const id = String(option.id ?? ""); const name = String(field.source === "events" ? option.eventName ?? "Unnamed event" : option.occasionName ?? "Unnamed occasion"); const date = field.source === "events" ? option.eventDate : option.occasionDate; return { id, label: `${name}${date ? ` · ${String(date)}` : ""}` }; })} value={field.name === "eventId" ? selectedGiftEventId : selectedGiftOccasionId} loading={sourceLoading} loadError={sourceError} placeholder={`Select ${field.label.toLowerCase()}`} error={error} onChange={(value) => { if (field.name === "eventId") setSelectedGiftEventId(value); else setSelectedGiftOccasionId(value); setFieldErrors((current) => ({ ...current, [field.name]: "" })); }} /> : field.type === "select" && field.options?.includes("true") && field.options?.includes("false") ? <Switch name={field.name} labelId={`${fieldId}-label`} value={String(value ?? field.options[0])} error={error} onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: "" }))} /> : field.type === "textarea" ? <textarea id={fieldId} name={field.name} placeholder={field.label} required={field.required} aria-invalid={!!error} aria-describedby={error ? `${field.name}-error` : undefined} onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: "" }))} defaultValue={String(value ?? "")} rows={3} className={`w-full rounded-[9px] border min-h-10 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 ${error ? "border-rose-400" : "border-line"}`} /> : field.type === "select" ? <select id={fieldId} name={field.name} required={field.required} aria-invalid={!!error} aria-describedby={error ? `${field.name}-error` : undefined} onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: "" }))} defaultValue={String(value ?? field.options?.[0] ?? "")} className={`w-full rounded-[9px] border bg-white min-h-10 px-3 py-2 text-sm ${error ? "border-rose-400" : "border-line"}`}>{field.options?.map((option) => <option key={option} value={option}>{field.optionLabels?.[option] ?? titleCase(option)}</option>)}</select> : <input id={fieldId} name={field.name} type={field.type === "number-list" || field.type === "recipient-select" ? "text" : field.type ?? "text"} placeholder={field.label} required={field.required} aria-invalid={!!error} aria-describedby={error ? `${field.name}-error` : undefined} onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: "" }))} defaultValue={Array.isArray(value) ? value.join(", ") : String(value ?? "")} className={`w-full rounded-[9px] border min-h-10 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 ${error ? "border-rose-400" : "border-line"}`} />}
                {field.source && sourceError && <p className="text-xs text-rose-600">Could not load {field.label.toLowerCase()}: {sourceError}</p>}
                {error && field.type !== "date" && field.type !== "password" && <p id={`${field.name}-error`} role="alert" className="text-sm text-rose-600">{error}</p>}
              </div>;
            })}
          </div>
    </FormPanel>
    <Sheet open={!!dialog} locked={saving} zIndex="z-[90]" labelledBy="action-dialog-title" className="max-w-md" onClose={() => setDialog(null)}>
      {dialog && <>
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${dialog.kind === "confirm" && dialog.destructive ? "bg-rose-50 text-rose-600" : "bg-brand/10 text-brand"}`}>
          {dialog.kind === "action" ? <ShieldQuestion size={26} /> : dialog.icon === "delete" ? <Trash2 size={25} /> : <Power size={25} />}
        </div>
        <h2 id="action-dialog-title" className="text-center text-base font-semibold text-ink">{dialog.kind === "confirm" ? dialog.title : dialog.action.label}</h2>
        {dialog.kind === "confirm" ? <p className="mt-2 text-center text-sm text-muted">{dialog.message}</p> : <form noValidate onSubmit={(event) => { event.preventDefault(); void performAction(dialog.action, dialog.values); }} className="mt-4 space-y-4">
          {dialog.action.prompts?.map((field, index) => <label key={field.key} className="block space-y-1.5 text-sm">
            <span className="font-medium text-ink">{field.label}{field.required && <RequiredMark />}</span>
            {field.type === "json" ? <textarea autoFocus={index === 0} placeholder="Enter JSON" value={dialog.values[field.key] ?? ""} onChange={(event) => setDialog({ ...dialog, values: { ...dialog.values, [field.key]: event.target.value }, errors: { ...dialog.errors, [field.key]: "" } })} rows={5} className={`w-full rounded-[9px] border min-h-10 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 ${dialog.errors[field.key] ? "border-rose-400" : "border-line"}`} /> : <input autoFocus={index === 0} type={field.type === "number" ? "number" : "text"} placeholder={field.label} value={dialog.values[field.key] ?? ""} onChange={(event) => setDialog({ ...dialog, values: { ...dialog.values, [field.key]: event.target.value }, errors: { ...dialog.errors, [field.key]: "" } })} className={`w-full rounded-[9px] border min-h-10 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 ${dialog.errors[field.key] ? "border-rose-400" : "border-line"}`} />}
            {dialog.errors[field.key] && <span className="block text-xs text-rose-600">{dialog.errors[field.key]}</span>}
          </label>)}
          <div className="flex justify-end gap-3 border-t border-line pt-4"><Button type="button" variant="secondary" disabled={saving} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Working…" : dialog.action.label}</Button></div>
        </form>}
        {dialog.kind === "confirm" && <div className="mt-6 flex justify-center gap-3 border-t border-line pt-4"><Button type="button" variant="secondary" disabled={saving} onClick={() => setDialog(null)}>Cancel</Button><Button type="button" variant={dialog.destructive ? "danger" : "primary"} disabled={saving} onClick={() => void dialog.onConfirm()}>{saving ? "Working…" : dialog.confirmLabel}</Button></div>}
      </>}
    </Sheet>
  </>;
}
