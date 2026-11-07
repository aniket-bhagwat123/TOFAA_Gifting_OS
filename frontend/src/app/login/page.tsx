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
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";

const schema = z.object({
  email: z.string().trim().min(1, "Please enter your email").email("That doesn't look like an email address"),
  password: z.string().min(1, "Please enter your password")
});
type Values = z.infer<typeof schema>;

function LoginForm() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = async (values: Values) => {
    try {
      await dispatch(loginUser(values)).unwrap();
      toast.success("Welcome back");
      const next = params.get("next");
      router.replace(next?.startsWith("/") ? next : "/home");
    } catch (error) { toast.error(getApiErrorMessage(error)); }
  };

  return <form noValidate onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
    <InputField label="Email" required type="email" inputMode="email" placeholder="you@company.com" autoComplete="username" autoFocus registration={register("email")} error={errors.email?.message} />
    <div>
      <InputField label="Password" required type={show ? "text" : "password"} placeholder="Your password" autoComplete="current-password" registration={register("password")} error={errors.password?.message} />
      <div className="mt-2 flex items-center justify-between">
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-muted"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} className="h-4 w-4 accent-brand" /> Show password</label>
        <Link href="/forgot-password" className="flex min-h-10 items-center text-sm font-medium text-brand hover:underline">Forgot password?</Link>
      </div>
    </div>
    <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</Button>
  </form>;
}

export default function LoginPage() {
  return <main className="grid min-h-screen bg-white lg:grid-cols-2">
    <section className="relative hidden overflow-hidden bg-[#0B2B24] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-28 -top-24 h-96 w-96 rounded-full bg-brand/40 blur-3xl" /><div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="relative flex items-center gap-3"><div className="rounded-xl bg-white/15 p-3"><Sparkles size={22} /></div><p className="font-semibold">TOFAA</p></div>
      <div className="relative max-w-lg"><h1 className="text-5xl font-semibold">Gifting, handled beautifully.</h1><p className="mt-6 max-w-md text-lg leading-8 text-white/75">Tell us who and when. We take care of choosing, wrapping and delivering.</p></div>
      <p className="relative text-sm text-white/60">Your details are private and secure.</p>
    </section>
    <section className="flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md animate-rise-in">
        <div className="mb-10 flex items-center gap-3 lg:hidden"><div className="inline-flex rounded-xl bg-brand p-3 text-white"><Sparkles size={20} /></div><p className="font-semibold">TOFAA</p></div>
        <h2 className="text-[2rem] font-semibold text-ink">Welcome back</h2>
        <p className="mt-2 text-base text-muted">Sign in to continue.</p>
        <Suspense fallback={<div className="mt-8 text-sm text-muted">Loading…</div>}><LoginForm /></Suspense>
        <p className="mt-8 text-center text-sm text-muted">Need an account? Ask your TOFAA contact.</p>
      </div>
    </section>
  </main>;
}
