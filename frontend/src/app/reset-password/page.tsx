"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Sparkles } from "lucide-react";
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
      router.replace("/home");
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setSaving(false); }
  };

  if (!ready) return <div className="flex justify-center py-10"><Spinner /></div>;
  return <form noValidate onSubmit={submit} className="mt-8 space-y-6">
    <PasswordField label="New password" required value={password} onChange={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: undefined })); }} error={errors.password} showStrength allowGenerate autoFocus placeholder="Enter new password" />
    <PasswordField label="Confirm new password" required value={confirm} onChange={(value) => { setConfirm(value); setErrors((current) => ({ ...current, confirm: undefined })); }} error={errors.confirm} placeholder="Re-enter new password" />
    <Button type="submit" size="lg" className="w-full" disabled={saving}>{saving ? "Saving…" : firstTime ? "Set password and continue" : "Update password"}</Button>
    {!firstTime && <Link href="/home" className="flex min-h-11 items-center justify-center text-sm font-medium text-brand hover:underline">Cancel</Link>}
  </form>;
}

export default function ResetPasswordPage() {
  return <main className="grid min-h-screen bg-white lg:grid-cols-2">
    <section className="relative hidden overflow-hidden bg-[#0B2B24] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-28 -top-24 h-96 w-96 rounded-full bg-brand/40 blur-3xl" /><div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="relative flex items-center gap-3"><div className="rounded-xl bg-white/15 p-3"><Sparkles size={22} /></div><p className="font-semibold">TOFAA</p></div>
      <div className="relative max-w-lg"><div className="mb-6 inline-flex rounded-2xl bg-white/15 p-4"><ShieldCheck size={30} /></div><h1 className="text-5xl font-semibold">Keep your account secure.</h1><p className="mt-6 max-w-md text-lg leading-8 text-white/75">Choose a strong password that only you know. It takes less than a minute.</p></div>
      <p className="relative text-sm text-white/60">Your details are private and secure.</p>
    </section>
    <section className="flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md animate-rise-in">
        <div className="mb-10 flex items-center gap-3 lg:hidden"><div className="inline-flex rounded-xl bg-brand p-3 text-white"><Sparkles size={20} /></div><p className="font-semibold">TOFAA</p></div>
        <Suspense fallback={null}><Heading /></Suspense>
        <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}><ResetPasswordForm /></Suspense>
      </div>
    </section>
  </main>;
}

function Heading() {
  const firstTime = useSearchParams().get("flow") === "invite";
  return <>
    <h2 className="text-[2rem] font-semibold text-ink">{firstTime ? "Choose your own password" : "Change your password"}</h2>
    <p className="mt-2 text-base text-muted">{firstTime ? "You signed in with a temporary password. Pick one only you know to continue." : "Choose a new password for your account."}</p>
  </>;
}
