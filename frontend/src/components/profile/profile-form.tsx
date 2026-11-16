"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Briefcase, Eye, EyeOff, Lock, Mail, Smartphone, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";
import { ImageUpload, deleteImage, sendImage } from "@/components/ui/image-upload";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setUser, setUserAvatar } from "@/features/auth/auth.slice";
import { authService } from "@/features/auth/auth.service";
import { getApiErrorMessage } from "@/services/api-client";
import { cn, displayName } from "@/lib/utils";

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

  return <div className={cn("mx-auto grid max-w-5xl items-stretch gap-6 lg:grid-cols-2", user.platformRole === "SUPER_ADMIN" && "lg:max-w-2xl lg:grid-cols-1")}>
    <Card className="flex h-full flex-col p-6">
      <CardTitle icon={<UserRound size={20} />} title="Profile Details" subtitle="Update your personal information" />
      <div className="mb-5 border-b border-line pb-5">
        <ImageUpload name={displayName(user)} src={user.avatarUrl} label="Choose your photo" size="h-20 w-20 text-xl"
          onUpload={async (file) => { const me = await sendImage<{ avatar_url?: string | null; avatarUrl?: string | null }>("put", "/me/avatar", file); dispatch(setUserAvatar(me.avatar_url ?? me.avatarUrl ?? null)); toast.success("Photo saved."); }}
          onRemove={async () => { await deleteImage("/me/avatar"); dispatch(setUserAvatar(null)); toast.success("Photo removed."); }} />
      </div>
      <form onSubmit={save} noValidate className="flex flex-1 flex-col space-y-4">
        <InputField label="Full name" name="fullName" placeholder="Enter your full name" icon={<UserRound size={16} />} value={form.fullName} onChange={set("fullName")} error={errors.fullName} autoComplete="name" maxLength={150} required />
        <InputField label="Email" name="email" type="email" placeholder="Enter your email address" icon={<Mail size={16} />} value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" maxLength={254} required hint="Changing this changes the email you sign in with." />
        <InputField label="Mobile number" name="mobileNumber" type="tel" icon={<Smartphone size={16} />} value={form.mobileNumber} onChange={set("mobileNumber")} error={errors.mobileNumber} autoComplete="tel" placeholder="Enter mobile number, e.g. +919876543210" />
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink">Role</p>
          <p className="flex min-h-[38px] items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm text-muted"><Briefcase size={16} aria-hidden />{ROLE_LABEL[user.platformRole]}</p>
        </div>
        <div className="mt-auto flex justify-end gap-2 pt-1">
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => { setForm(saved); setErrors({}); }}>Reset</Button>
          <Button type="submit" disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </form>
    </Card>
    {user.platformRole !== "SUPER_ADMIN" && <ChangePasswordCard />}
  </div>;
}

function CardTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return <div className="mb-5 flex items-center gap-3">
    <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</span>
    <div><h2 className="text-lg font-semibold text-ink">{title}</h2><p className="text-sm text-muted">{subtitle}</p></div>
  </div>;
}

/** Lets any signed-in user set a new password for themselves. */
function ChangePasswordCard() {
  const [show, setShow] = useState(false);
  const toggle = <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Hide passwords" : "Show passwords"} aria-pressed={show} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>;
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.password.length < 8) return setError("Use at least 8 characters.");
    if (form.password !== form.confirm) return setError("The two passwords don't match.");
    setError("");
    setSaving(true);
    try {
      await authService.resetPassword(form.password);
      setForm({ password: "", confirm: "" });
      toast.success("Password changed.");
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setSaving(false); }
  }

  return <Card className="relative flex h-full flex-col overflow-hidden p-6">
    <CardTitle icon={<Lock size={20} />} title="Change Password" subtitle="Keep your account secure" />
    <form onSubmit={submit} noValidate className="space-y-4">
      <InputField label="New password" name="newPassword" type={show ? "text" : "password"} trailing={toggle} icon={<Lock size={16} />} placeholder="Enter new password" value={form.password} onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))} autoComplete="new-password" maxLength={128} hint="Must be at least 8 characters." required />
      <InputField label="Confirm new password" name="confirmPassword" type={show ? "text" : "password"} trailing={toggle} icon={<Lock size={16} />} placeholder="Confirm new password" value={form.confirm} onChange={(e) => setForm((c) => ({ ...c, confirm: e.target.value }))} error={error} autoComplete="new-password" maxLength={128} required />
      <div className="flex justify-end">
        <Button type="submit" disabled={!form.password || !form.confirm || saving}><Lock size={15} /> {saving ? "Saving…" : "Change password"}</Button>
      </div>
    </form>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/images/change-password.png" alt="" aria-hidden className="pointer-events-none -mx-6 -mb-6 mt-auto block w-[calc(100%+3rem)] max-w-none select-none" />
  </Card>;
}
