"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch } from "@/store/hooks";
import { loginUser } from "@/features/auth/auth.slice";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { InputField } from "@/components/ui/input-field";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/services/api-client";
import { Sparkles, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

const schema = z.object({
  email: z.string().trim().min(1, "Work email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required")
});
type Values = z.infer<typeof schema>;

function LoginForm() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const params = useSearchParams();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = async (values: Values) => {
    try {
      await dispatch(loginUser(values)).unwrap();
      toast.success("Welcome back");
      const next = params.get("next");
      router.replace(next?.startsWith("/") ? next : "/dashboard");
    } catch (error) { toast.error(getApiErrorMessage(error)); }
  };

  return <form noValidate onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
    <InputField label="Work email" type="email" placeholder="you@company.com" autoComplete="username" registration={register("email")} error={errors.email?.message} required />
    <InputField label="Password" type="password" placeholder="Enter your password" autoComplete="current-password" registration={register("password")} error={errors.password?.message} required />
    <div className="flex justify-end"><Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">Forgot password?</Link></div>
    <Button type="submit" className="w-full py-3" disabled={isSubmitting}>{isSubmitting ? "Signing in..." : "Sign in to workspace"}</Button>
  </form>;
}

export default function LoginPage() {
  return <main className="grid min-h-screen bg-white lg:grid-cols-2">
    <section className="relative hidden overflow-hidden bg-[#22234D] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-28 -top-24 h-96 w-96 rounded-full bg-brand/40 blur-3xl" /><div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />
      <div className="relative flex items-center gap-3"><div className="rounded-xl bg-white/15 p-3"><Sparkles size={22} /></div><div><p className="font-semibold">TOFAA</p><p className="text-xs text-white/60">Gifting OS</p></div></div>
      <div className="relative max-w-lg"><p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Thoughtful gifting. Seamless operations.</p><h1 className="text-5xl font-semibold leading-tight tracking-tight">Make every business moment feel personal.</h1><p className="mt-6 max-w-md text-base leading-7 text-white/65">One connected workspace for tenant relationships, gifting requests, fulfilment and meaningful experiences.</p></div>
      <div className="relative flex items-center gap-2 text-xs text-white/55"><ShieldCheck size={16} /> Secure access for your organization</div>
    </section>
    <section className="flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md"><div className="mb-10 lg:hidden"><div className="inline-flex rounded-xl bg-brand p-3 text-white"><Sparkles /></div><p className="mt-3 font-semibold">TOFAA Gifting OS</p></div>
        <p className="text-sm font-semibold text-brand">WELCOME BACK</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Sign in to your account</h2><p className="mt-2 text-sm text-muted">Enter your work credentials to continue.</p>
        <Suspense fallback={<div className="mt-8 text-sm text-muted">Loading sign-in...</div>}><LoginForm /></Suspense>
        <p className="mt-8 text-center text-xs text-muted">Need access? Contact your TOFAA administrator.</p>
      </div>
    </section>
  </main>;
}
