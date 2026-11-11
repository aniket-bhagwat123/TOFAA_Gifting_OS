"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";
import { PageHeader } from "@/components/ui/page-header";
import { ImageUpload, deleteImage, sendImage } from "@/components/ui/image-upload";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setUser, setUserAvatar } from "@/features/auth/auth.slice";
import { authService } from "@/features/auth/auth.service";
import { getApiErrorMessage } from "@/services/api-client";
import { displayName } from "@/lib/utils";

const ROLE_LABEL = { SUPER_ADMIN: "Super admin", TOFAA_TEAM: "TOFAA team", CLIENT: "Client" } as const;
const MOBILE = /^\+?[1-9][0-9]{7,14}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "My profile": every signed-in user (super admin, team, client) edits their own photo, name, email and mobile here. */
export function ProfileForm() {
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const [form, setForm] = useState({ fullName: "", email: "", mobileNumber: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setForm({ fullName: user.name ?? "", email: user.email, mobileNumber: user.mobileNumber ?? "" });
  }, [user]);
  if (!user) return null;

  const saved = { fullName: user.name ?? "", email: user.email, mobileNumber: user.mobileNumber ?? "" };
  const dirty = form.fullName.trim() !== saved.fullName || form.email.trim() !== saved.email || form.mobileNumber.trim() !== saved.mobileNumber;
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.fullName.trim()) next.fullName = "Enter your name.";
    if (!EMAIL.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (form.mobileNumber.trim() && !MOBILE.test(form.mobileNumber.trim())) next.mobileNumber = "Use the country code, for example +919876543210.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const updated = await authService.updateProfile({ fullName: form.fullName.trim(), email: form.email.trim(), mobileNumber: form.mobileNumber.trim() });
      dispatch(setUser({ ...user!, ...updated }));
      toast.success("Profile saved.");
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-2xl">
    <PageHeader description="Your photo and contact details. You sign in with the email below." />
    <Card className="mb-6 p-6">
      <p className="mb-4 text-sm font-semibold text-ink">Photo</p>
      <ImageUpload name={displayName(user)} src={user.avatarUrl} label="Choose your photo" size="h-20 w-20 text-xl"
        onUpload={async (file) => { const me = await sendImage<{ avatar_url?: string | null; avatarUrl?: string | null }>("put", "/me/avatar", file); dispatch(setUserAvatar(me.avatar_url ?? me.avatarUrl ?? null)); toast.success("Photo saved."); }}
        onRemove={async () => { await deleteImage("/me/avatar"); dispatch(setUserAvatar(null)); toast.success("Photo removed."); }} />
    </Card>
    <Card className="p-6">
      <form onSubmit={save} noValidate className="space-y-5">
        <InputField label="Full name" name="fullName" value={form.fullName} onChange={set("fullName")} error={errors.fullName} autoComplete="name" maxLength={150} required />
        <InputField label="Email" name="email" type="email" value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" maxLength={254} required hint="Changing this changes the email you sign in with." />
        <InputField label="Mobile number" name="mobileNumber" type="tel" value={form.mobileNumber} onChange={set("mobileNumber")} error={errors.mobileNumber} autoComplete="tel" placeholder="+919876543210" />
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Role</p>
          <p className="min-h-12 rounded-xl border border-line bg-slate-50 px-4 py-3 text-base text-muted">{ROLE_LABEL[user.platformRole]}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => { setForm(saved); setErrors({}); }}>Reset</Button>
          <Button type="submit" disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </Card>
  </div>;
}
