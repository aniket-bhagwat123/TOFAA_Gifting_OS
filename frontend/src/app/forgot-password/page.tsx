"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/services/api-client";
import { endpoints } from "@/services/endpoints";
import { toast } from "sonner";
import { InputField } from "@/components/ui/input-field";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { KeyRound, Sparkles } from "lucide-react";

const schema = z.object({ email: z.string().trim().min(1, "Please enter your email").email("That doesn't look like an email address") });
export default function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{email:string}>({ resolver: zodResolver(schema) });
  const submit = async (values: {email:string}) => {
    try { const { data } = await api.post(endpoints.auth.forgotPassword, values); toast.success(data.message || "If that email has an account, we've sent help on its way."); }
    catch { toast.error("We couldn't send that just now. Please try again."); }
  };
  return <main className="grid min-h-screen bg-white lg:grid-cols-2">
    <section className="relative hidden overflow-hidden bg-[#0B2B24] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-28 -top-24 h-96 w-96 rounded-full bg-brand/40 blur-3xl" /><div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="relative flex items-center gap-3"><div className="rounded-xl bg-white/15 p-3"><Sparkles size={22} /></div><p className="font-semibold">TOFAA</p></div>
      <div className="relative max-w-lg"><div className="mb-6 inline-flex rounded-2xl bg-white/15 p-4"><KeyRound size={30} /></div><h1 className="text-5xl font-semibold">Locked out? We&apos;ve got you.</h1><p className="mt-6 max-w-md text-lg leading-8 text-white/75">Enter your email and we&apos;ll send a secure link to set a new password.</p></div>
      <p className="relative text-sm text-white/60">Your details are private and secure.</p>
    </section>
    <section className="flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md animate-rise-in">
        <div className="mb-10 flex items-center gap-3 lg:hidden"><div className="inline-flex rounded-xl bg-brand p-3 text-white"><Sparkles size={20} /></div><p className="font-semibold">TOFAA</p></div>
        <h2 className="text-[2rem] font-semibold text-ink">Reset your password</h2>
        <p className="mt-2 text-base text-muted">Enter your email and we&apos;ll send you a link to set a new one.</p>
        <form noValidate onSubmit={handleSubmit(submit)} className="mt-8 space-y-5"><InputField label="Email" required type="email" inputMode="email" autoFocus placeholder="you@company.com" registration={register("email")} error={errors.email?.message} /><Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>{isSubmitting ? "Sending…" : "Send reset link"}</Button></form>
        <Link href="/login" className="mt-6 flex min-h-11 items-center justify-center text-sm font-medium text-brand hover:underline">Back to sign in</Link>
      </div>
    </section>
  </main>;
}
