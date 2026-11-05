"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { Spinner } from "@/components/ui/spinner";
import { useAppDispatch } from "@/store/hooks";
import { loadCurrentUser } from "@/features/auth/auth.slice";
import { authService } from "@/features/auth/auth.service";
import { getApiErrorMessage } from "@/services/api-client";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password";

/** Recovery links from email arrive as #access_token=…&refresh_token=…; keep that session so the update call is authenticated. */
function adoptSessionFromLink() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const access = hash.get("access_token");
  const refresh = hash.get("refresh_token");
  if (access && refresh) {
    window.localStorage.setItem("tofaa-session", JSON.stringify({ access_token: access, refresh_token: refresh }));
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function ResetPasswordForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const firstTime = useSearchParams().get("flow") === "invite";
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adoptSessionFromLink();
    let signedIn = false;
    try { signedIn = !!JSON.parse(window.localStorage.getItem("tofaa-session") || "null")?.access_token; } catch { /* treated as signed out */ }
    if (!signedIn) { router.replace("/login?next=/reset-password"); return; }
    setReady(true);
  }, [router]);

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
      await dispatch(loadCurrentUser()); // clears the "temporary password" flag in the store
      toast.success("Your password has been updated.");
      router.replace("/dashboard");
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setSaving(false); }
  };

  if (!ready) return <div className="flex justify-center py-10"><Spinner /></div>;
  return <form noValidate onSubmit={submit} className="mt-8 space-y-6">
    <PasswordField label="New password" required value={password} onChange={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: undefined })); }} error={errors.password} showStrength allowGenerate autoFocus />
    <PasswordField label="Confirm new password" required value={confirm} onChange={(value) => { setConfirm(value); setErrors((current) => ({ ...current, confirm: undefined })); }} error={errors.confirm} placeholder="Type it once more" />
    <Button type="submit" size="lg" className="w-full" disabled={saving}>{saving ? "Saving…" : firstTime ? "Set password and continue" : "Update password"}</Button>
    {!firstTime && <Link href="/dashboard" className="flex min-h-11 items-center justify-center text-sm font-medium text-brand hover:underline">Cancel</Link>}
  </form>;
}

export default function ResetPasswordPage() {
  return <main className="flex min-h-screen items-center justify-center bg-canvas p-5">
    <div className="w-full max-w-lg animate-rise-in rounded-3xl border border-line/70 bg-white p-8 shadow-soft sm:p-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand"><ShieldCheck size={24} /></span>
      <Suspense fallback={null}><Heading /></Suspense>
      <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}><ResetPasswordForm /></Suspense>
    </div>
  </main>;
}

function Heading() {
  const firstTime = useSearchParams().get("flow") === "invite";
  return <>
    <h1 className="mt-5 text-[1.75rem] font-semibold text-ink">{firstTime ? "Choose your own password" : "Change your password"}</h1>
    <p className="mt-2 text-base text-muted">{firstTime ? "You signed in with a temporary password. Pick one only you know to continue." : "Choose a new password for your account."}</p>
  </>;
}
