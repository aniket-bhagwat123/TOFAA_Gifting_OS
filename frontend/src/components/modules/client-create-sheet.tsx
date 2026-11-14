"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Building2, Loader2, RefreshCw, Eye, EyeOff, Camera } from "lucide-react";
import { toast } from "sonner";
import { FormPanel, FormSection } from "@/components/ui/form-panel";
import { Button } from "@/components/ui/button";
import { RequiredMark } from "@/components/ui/required-mark";
import { generatePassword, PASSWORD_MIN } from "@/lib/password";
import { mutateModule, getModuleRecords } from "@/features/modules/module.service";
import { rowsOf } from "@/features/modules/module-utils";
import { getApiErrorMessage } from "@/services/api-client";
import { ImageUpload, deleteImage, sendImage } from "@/components/ui/image-upload";
import { Avatar } from "@/components/ui/avatar";

const CLIENT_ROLES = [
  { value: "OWNER", label: "Owner (Director)" },
  { value: "EA", label: "EA to Director" },
  { value: "HR", label: "HR" },
] as const;

type ClientRole = (typeof CLIENT_ROLES)[number]["value"];

interface UserRow {
  _localId: string;
  serverId?: string;        // set for users fetched from server
  fullName: string;
  email: string;
  role: ClientRole;
  password: string;         // blank = keep current (edit mode only)
  showPwd: boolean;
  avatarUrl?: string | null;
  avatarFile?: File | null;  // pending upload for new users
  errors: Record<string, string>;
}

function makeUser(): UserRow {
  return { _localId: crypto.randomUUID(), fullName: "", email: "", role: "OWNER", password: generatePassword(), showPwd: false, avatarUrl: null, avatarFile: null, errors: {} };
}

function userFromServer(u: Record<string, unknown>): UserRow {
  const rawRole = String(u.clientRole ?? u.client_role ?? "");
  return {
    _localId: String(u.id ?? crypto.randomUUID()),
    serverId: String(u.id ?? ""),
    fullName: String(u.fullName ?? u.full_name ?? ""),
    email: String(u.email ?? ""),
    role: (["OWNER", "EA", "HR"].includes(rawRole) ? rawRole : "OWNER") as ClientRole,
    password: "",
    showPwd: false,
    avatarUrl: (u.avatarUrl ?? u.avatar_url) as string | null | undefined,
    avatarFile: null,
    errors: {},
  };
}

const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];

function UserAvatarPicker({ user, tenantId, onUpdate }: {
  user: UserRow;
  tenantId: string;
  onUpdate: (patch: Partial<Omit<UserRow, "_localId" | "errors">>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    if (!IMG_TYPES.includes(file.type)) { toast.error("Choose a PNG, JPG or WebP image."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("That image is over 2 MB."); return; }

    if (user.serverId && tenantId) {
      // Existing user — upload immediately
      setBusy(true);
      try {
        const saved = await sendImage<Record<string, unknown>>("put", `/tenants/${tenantId}/users/${user.serverId}/avatar`, file);
        onUpdate({ avatarUrl: saved.avatarUrl as string ?? null });
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      } finally {
        setBusy(false);
      }
    } else {
      // New user — store locally for upload after save
      const preview = URL.createObjectURL(file);
      onUpdate({ avatarFile: file, avatarUrl: preview });
    }
  };

  const preview = user.avatarUrl;

  return (
    <div className="relative shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Upload photo"
        className="group relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white shadow-sm transition hover:shadow-md"
      >
        <Avatar name={user.fullName || user.email || "U"} src={preview} className="h-9 w-9 text-xs" />
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2 size={13} className="animate-spin text-white" /> : <Camera size={13} className="text-white" />}
        </div>
      </button>
    </div>
  );
}

interface ClientFields {
  tenantType: "ORGANIZATION" | "INDIVIDUAL";
  name: string;
  legalName: string;
  gstin: string;
  emailDomain: string;
}

const f = "w-full rounded-[9px] border min-h-9 px-2.5 py-1.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 border-line";
const fErr = "w-full rounded-[9px] border min-h-9 px-2.5 py-1.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 border-rose-400";

export function ClientCreateSheet({
  open,
  onClose,
  onCreated,
  editClient,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Pass the client row to open in edit mode. Omit for create mode. */
  editClient?: Record<string, unknown>;
}) {
  const isEdit = !!editClient;

  const [client, setClient] = useState<ClientFields>({ tenantType: "ORGANIZATION", name: "", legalName: "", gstin: "", emailDomain: "" });
  const [clientErrors, setClientErrors] = useState<Partial<Record<keyof ClientFields, string>>>({});
  const [users, setUsers] = useState<UserRow[]>([makeUser()]);
  const [removedServerIds, setRemovedServerIds] = useState<string[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null); // object URL for create mode preview
  const [logoUrl, setLogoUrl] = useState<string | null>(null);         // current URL for edit mode
  const logoInputRef = useRef<HTMLInputElement>(null);

  // When the sheet opens, populate client fields and load existing users (edit mode)
  useEffect(() => {
    if (!open) return;

    if (isEdit && editClient) {
      setClient({
        tenantType: (editClient.tenantType as "ORGANIZATION" | "INDIVIDUAL") ?? "ORGANIZATION",
        name: String(editClient.name ?? ""),
        legalName: String(editClient.legalName ?? ""),
        gstin: String(editClient.gstin ?? ""),
        emailDomain: String(editClient.emailDomain ?? ""),
      });
      setLogoUrl((editClient.logoUrl ?? editClient.logo_url) as string | null ?? null);
      setLogoFile(null);
      setLogoPreview(null);
      setRemovedServerIds([]);

      // Load existing users for this client
      const tenantId = String(editClient.id ?? "");
      if (!tenantId) return;
      setUsersLoading(true);
      getModuleRecords(`/tenants/${tenantId}/users`, { page: 1, limit: 100 })
        .then((data) => {
          const rows = rowsOf(data).map(userFromServer);
          setUsers(rows.length ? rows : [makeUser()]);
        })
        .catch(() => {
          toast.error("Could not load existing users. You can still add new ones.");
          setUsers([makeUser()]);
        })
        .finally(() => setUsersLoading(false));
    } else {
      // Create mode: reset everything
      setClient({ tenantType: "ORGANIZATION", name: "", legalName: "", gstin: "", emailDomain: "" });
      setClientErrors({});
      setUsers([makeUser()]);
      setRemovedServerIds([]);
      setLogoFile(null);
      setLogoPreview(null);
      setLogoUrl(null);
    }
  }, [open, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const setC = (key: keyof ClientFields, value: string) => {
    setClient((prev) => ({ ...prev, [key]: value }));
    setClientErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const addUser = () => setUsers((prev) => [...prev, makeUser()]);

  const removeUser = (localId: string, serverId?: string) => {
    setUsers((prev) => prev.filter((u) => u._localId !== localId));
    if (serverId) setRemovedServerIds((prev) => [...prev, serverId]);
  };

  const updateUser = (localId: string, patch: Partial<Omit<UserRow, "_localId" | "errors">>) =>
    setUsers((prev) => prev.map((u) =>
      u._localId === localId
        ? { ...u, ...patch, errors: { ...u.errors, ...Object.fromEntries(Object.keys(patch).map((k) => [k, ""])) } }
        : u
    ));

  // Validate and return false if there are errors
  const validate = (): boolean => {
    const cErrors: Partial<Record<keyof ClientFields, string>> = {};
    if (!client.name.trim()) cErrors.name = "Client name is required.";
    setClientErrors(cErrors);

    let userValid = true;
    setUsers((prev) => prev.map((u) => {
      const errors: Record<string, string> = {};
      if (!u.fullName.trim()) errors.fullName = "Full name is required.";
      if (!u.email.trim()) errors.email = "Email is required.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) errors.email = "Enter a valid email.";
      // Password required for new users; for existing: only validate if non-empty
      if (!u.serverId && u.password.length < PASSWORD_MIN) errors.password = `At least ${PASSWORD_MIN} characters.`;
      if (u.serverId && u.password && u.password.length < PASSWORD_MIN) errors.password = `At least ${PASSWORD_MIN} characters.`;
      if (Object.keys(errors).length) userValid = false;
      return { ...u, errors };
    }));

    return !Object.keys(cErrors).length && userValid;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      if (isEdit && editClient) {
        // ── Edit: single PATCH — client details + users + deactivations in one payload ──
        const tenantId = String(editClient.id ?? "");

        const patchBody: Record<string, unknown> = { name: client.name.trim() };
        if (client.legalName.trim() || editClient.legalName) patchBody.legalName = client.legalName.trim() || null;
        if (client.gstin.trim() || editClient.gstin) patchBody.gstin = client.gstin.trim() || null;
        if (client.emailDomain.trim() || editClient.emailDomain) patchBody.emailDomain = client.emailDomain.trim() || null;

        // Existing users → update (send id); new users → create (no id)
        patchBody.users = users.map((u) => {
          if (u.serverId) {
            const entry: Record<string, unknown> = { id: u.serverId, fullName: u.fullName.trim(), role: u.role };
            if (u.password) entry.password = u.password;
            return entry;
          }
          return { email: u.email.trim(), fullName: u.fullName.trim(), password: u.password, role: u.role };
        });

        patchBody.deactivateUserIds = removedServerIds;

        await mutateModule("patch", `/tenants/${tenantId}`, patchBody);

        // Upload pending user photos for newly-added users (match by email after save)
        const newUsersWithPhotos = users.filter((u) => !u.serverId && u.avatarFile);
        if (newUsersWithPhotos.length) {
          try {
            const refreshed = await getModuleRecords(`/tenants/${tenantId}/users`, { page: 1, limit: 100 });
            const serverRows = rowsOf(refreshed) as Record<string, unknown>[];
            await Promise.allSettled(newUsersWithPhotos.map((u) => {
              const match = serverRows.find((r) => String(r.email ?? "").toLowerCase() === u.email.toLowerCase());
              if (match?.id && u.avatarFile) return sendImage("put", `/tenants/${tenantId}/users/${match.id}/avatar`, u.avatarFile);
            }));
          } catch { /* non-critical */ }
        }

        toast.success(`Client "${client.name}" updated.`);
      } else {
        // ── Create: single POST — tenant details + all users in one payload ──
        const body: Record<string, unknown> = {
          tenantType: client.tenantType,
          name: client.name.trim(),
          users: users.map((u) => ({
            email: u.email.trim(), fullName: u.fullName.trim(), password: u.password, role: u.role,
          })),
        };
        if (client.legalName.trim()) body.legalName = client.legalName.trim();
        if (client.gstin.trim()) body.gstin = client.gstin.trim();
        if (client.emailDomain.trim()) body.emailDomain = client.emailDomain.trim();

        const created = await mutateModule("post", "/tenants", body) as Record<string, unknown>;
        const newTenantId = String(created?.id ?? "");

        // Upload logo if one was selected
        if (logoFile && newTenantId) {
          try { await sendImage("put", `/tenants/${newTenantId}/logo`, logoFile); }
          catch { toast.error("Client created but logo upload failed. You can upload it from the edit view."); }
        }

        // Upload user photos by matching newly-created users by email
        const usersWithPhotos = users.filter((u) => u.avatarFile);
        if (usersWithPhotos.length && newTenantId) {
          try {
            const refreshed = await getModuleRecords(`/tenants/${newTenantId}/users`, { page: 1, limit: 100 });
            const serverRows = rowsOf(refreshed) as Record<string, unknown>[];
            await Promise.allSettled(usersWithPhotos.map((u) => {
              const match = serverRows.find((r) => String(r.email ?? "").toLowerCase() === u.email.toLowerCase());
              if (match?.id && u.avatarFile) return sendImage("put", `/tenants/${newTenantId}/users/${match.id}/avatar`, u.avatarFile);
            }));
          } catch { /* non-critical */ }
        }

        toast.success(`Client "${client.name}" created with ${users.length} team member${users.length !== 1 ? "s" : ""}.`);
      }

      onCreated();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPanel
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit client" : "Add client"}
      description={isEdit ? "Update client details and manage their team." : "Create a new client organisation and set up their team."}
      icon={<Building2 size={26} />}
      width="xl"
      locked={saving}
      onSubmit={handleSubmit}
      footer={
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create client"}
          </Button>
        </div>
      }
    >
      {/* ── Section 1: Client details ── */}
      <FormSection number={1} title="Client details" hint="Basic information about the organisation.">
        {/* Logo upload */}
        <div className="mb-4">
          {isEdit ? (
            <ImageUpload
              shape="square"
              name={client.name || "Client"}
              src={logoUrl}
              label="Choose a logo"
              size="h-14 w-14 text-base"
              onUpload={async (file) => {
                const saved = await sendImage<Record<string, unknown>>("put", `/tenants/${String(editClient!.id)}/logo`, file);
                setLogoUrl(saved.logoUrl as string ?? null);
              }}
              onRemove={async () => {
                await deleteImage(`/tenants/${String(editClient!.id)}/logo`);
                setLogoUrl(null);
              }}
            />
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-slate-50">
                {logoPreview
                  ? <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center text-slate-300"><Building2 size={22} /></div>
                }
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!["image/png","image/jpeg","image/webp"].includes(file.type)) { toast.error("Choose a PNG, JPG or WebP image."); return; }
                    if (file.size > 2 * 1024 * 1024) { toast.error("That image is over 2 MB."); return; }
                    setLogoFile(file);
                    setLogoPreview(URL.createObjectURL(file));
                    e.target.value = "";
                  }}
                />
                <Button type="button" size="sm" variant="secondary" onClick={() => logoInputRef.current?.click()}>
                  {logoPreview ? "Change logo" : "Upload logo"}
                </Button>
                {logoPreview && (
                  <Button type="button" size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50"
                    onClick={() => { setLogoFile(null); setLogoPreview(null); }}>Remove</Button>
                )}
                <p className="w-full text-xs text-muted">PNG, JPG or WebP, up to 2 MB.</p>
              </div>
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {!isEdit && (
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-sm font-medium text-ink">Type <RequiredMark /></label>
              <select value={client.tenantType} onChange={(e) => setC("tenantType", e.target.value)} className={f}>
                <option value="ORGANIZATION">Organisation</option>
                <option value="INDIVIDUAL">Individual (one user)</option>
              </select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Name <RequiredMark /></label>
            <input value={client.name} onChange={(e) => setC("name", e.target.value)} placeholder="Client name" className={clientErrors.name ? fErr : f} />
            {clientErrors.name && <p className="text-sm text-rose-600">{clientErrors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">Legal name</label>
            <input value={client.legalName} onChange={(e) => setC("legalName", e.target.value)} placeholder="Legal name" className={f} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">GSTIN</label>
            <input value={client.gstin} onChange={(e) => setC("gstin", e.target.value)} placeholder="GSTIN" className={f} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Email domain</label>
            <input value={client.emailDomain} onChange={(e) => setC("emailDomain", e.target.value)} placeholder="e.g. company.com" className={f} />
          </div>
        </div>
      </FormSection>

      {/* ── Section 2: Team members ── */}
      <FormSection number={2} title="Team members" hint="People who will log in and manage this client account.">
        {usersLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading existing team members…
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user, index) => (
              <div key={user._localId} className="relative rounded-xl border border-line/70 bg-slate-50/60 px-3 py-2.5">
                {/* Header row: avatar + badge + role + remove */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* User photo picker */}
                    <UserAvatarPicker
                      user={user}
                      tenantId={isEdit ? String(editClient?.id ?? "") : ""}
                      onUpdate={(patch) => updateUser(user._localId, patch)}
                    />
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${user.serverId ? "bg-slate-100 text-slate-600" : "bg-brand/10 text-brand"}`}>
                      {user.serverId ? "Existing" : `New · #${index + 1}`}
                    </span>
                    <select
                      value={user.role}
                      onChange={(e) => updateUser(user._localId, { role: e.target.value as ClientRole })}
                      className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
                    >
                      {CLIENT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUser(user._localId, user.serverId)}
                    title={user.serverId ? "Deactivate user" : "Remove"}
                    className="press flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="grid gap-2 grid-cols-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-ink">Full name <RequiredMark /></label>
                    <input
                      value={user.fullName}
                      onChange={(e) => updateUser(user._localId, { fullName: e.target.value })}
                      placeholder="Full name"
                      className={user.errors.fullName ? fErr : f}
                    />
                    {user.errors.fullName && <p className="text-xs text-rose-600">{user.errors.fullName}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-ink">Email <RequiredMark /></label>
                    {user.serverId ? (
                      <div className={`${f} bg-slate-50 text-slate-500 select-none`}>{user.email}</div>
                    ) : (
                      <>
                        <input
                          type="email"
                          value={user.email}
                          onChange={(e) => updateUser(user._localId, { email: e.target.value })}
                          placeholder="email@company.com"
                          className={user.errors.email ? fErr : f}
                        />
                        {user.errors.email && <p className="text-xs text-rose-600">{user.errors.email}</p>}
                      </>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-ink">Password {!user.serverId && <RequiredMark />}</label>
                      <button
                        type="button"
                        onClick={() => updateUser(user._localId, { password: generatePassword(), showPwd: true })}
                        title="Generate password"
                        className="press flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-brand hover:bg-brand/10"
                      >
                        <RefreshCw size={9} /> Generate
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={user.showPwd ? "text" : "password"}
                        value={user.password}
                        onChange={(e) => updateUser(user._localId, { password: e.target.value })}
                        placeholder={user.serverId ? "Blank = keep current" : "Password"}
                        spellCheck={false}
                        className={`${user.errors.password ? fErr : f} pr-8 font-mono tracking-wide`}
                      />
                      <button
                        type="button"
                        onClick={() => updateUser(user._localId, { showPwd: !user.showPwd })}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink"
                      >
                        {user.showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {user.errors.password && <p className="text-xs text-rose-600">{user.errors.password}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!usersLoading && (
          <button
            type="button"
            onClick={addUser}
            className="press mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3 text-sm font-medium text-muted hover:border-brand/40 hover:text-brand"
          >
            <Plus size={16} /> Add team member
          </button>
        )}
      </FormSection>
    </FormPanel>
  );
}
