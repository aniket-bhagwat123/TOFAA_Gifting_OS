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

const schema = z.object({ email: z.string().trim().min(1, "Please enter your email").email("That doesn't look like an email address") });
export default function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{email:string}>({ resolver: zodResolver(schema) });
  const submit = async (values: {email:string}) => {
    try { const { data } = await api.post(endpoints.auth.forgotPassword, values); toast.success(data.message || "If that email has an account, we've sent help on its way."); }
    catch { toast.error("We couldn't send that just now. Please try again."); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-canvas p-5"><div className="w-full max-w-md animate-rise-in rounded-3xl border border-line/70 bg-white p-8 shadow-soft sm:p-10"><h1 className="text-[1.75rem] font-semibold">Reset your password</h1><p className="mt-2 text-base text-muted">Enter your email and we'll send you a link to set a new one.</p><form noValidate onSubmit={handleSubmit(submit)} className="mt-6 space-y-5"><InputField label="Email" required type="email" inputMode="email" autoFocus placeholder="you@company.com" registration={register("email")} error={errors.email?.message} /><Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>{isSubmitting ? "Sending…" : "Send reset link"}</Button></form><Link href="/login" className="mt-5 flex min-h-11 items-center justify-center text-sm font-medium text-brand hover:underline">Back to sign in</Link></div></main>;
}
