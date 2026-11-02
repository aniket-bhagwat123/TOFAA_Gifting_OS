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

const schema = z.object({ email: z.string().trim().min(1, "Work email is required").email("Enter a valid email address") });
export default function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{email:string}>({ resolver: zodResolver(schema) });
  const submit = async (values: {email:string}) => {
    try { const { data } = await api.post(endpoints.auth.forgotPassword, values); toast.success(data.message || "If the account exists, recovery instructions will be sent."); }
    catch { toast.error("Unable to submit password recovery request."); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-canvas p-5"><div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-soft"><h1 className="text-2xl font-semibold">Forgot password?</h1><p className="mt-2 text-sm text-muted">Enter your work email to start account recovery.</p><form noValidate onSubmit={handleSubmit(submit)} className="mt-6 space-y-5"><InputField label="Work email" type="email" registration={register("email")} error={errors.email?.message} required /><Button className="w-full" type="submit" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Send recovery instructions"}</Button></form><Link href="/login" className="mt-5 block text-center text-sm text-brand">Back to sign in</Link></div></main>;
}
