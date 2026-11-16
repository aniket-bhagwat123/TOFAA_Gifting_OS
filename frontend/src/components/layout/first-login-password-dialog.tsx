"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { useAppDispatch } from "@/store/hooks";
import { loadCurrentUser } from "@/features/auth/auth.slice";
import { authService } from "@/features/auth/auth.service";
import { getApiErrorMessage } from "@/services/api-client";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password";

/** Shown over the dashboard on the first sign-in with a temporary password. It can't be dismissed until a new password is saved. */
export function FirstLoginPasswordDialog({ open }: { open: boolean }) {
  const dispatch = useAppDispatch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (password.length < PASSWORD_MIN) next.password = `Use at least ${PASSWORD_MIN} characters.`;
    else if (password.length > PASSWORD_MAX) next.password = `Use ${PASSWORD_MAX} characters or fewer.`;
    if (confirm !== password) next.confirm = "The two passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await authService.resetPassword(password);
      await dispatch(loadCurrentUser()); // the flag is now false, so the dialog closes
      toast.success("Your password has been updated.");
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setSaving(false); }
  };

  return <Sheet open={open} locked onClose={() => undefined} labelledBy="first-login-title" className="max-w-[26rem]">
    <form noValidate onSubmit={submit} className="space-y-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><ShieldCheck size={20} /></span>
        <div><h2 id="first-login-title" className="text-[17px] font-semibold text-ink">Choose your own password</h2>
          <p className="mt-0.5 text-xs text-muted">You signed in with a temporary password. Pick one only you know to continue.</p></div>
      </div>
      <PasswordField label="New password" required value={password} onChange={(value) => { setPassword(value); setErrors((c) => ({ ...c, password: undefined })); }} error={errors.password} showStrength allowGenerate autoFocus placeholder="Enter new password" />
      <PasswordField label="Confirm new password" required value={confirm} onChange={(value) => { setConfirm(value); setErrors((c) => ({ ...c, confirm: undefined })); }} error={errors.confirm} placeholder="Re-enter new password" />
      <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Set password and continue"}</Button>
    </form>
  </Sheet>;
}
