"use client";

import { useRouter } from "next/navigation";
import { useClientFirst } from "@/components/layout/client-chooser";
import { useAppSelector } from "@/store/hooks";
import { moduleConfig } from "@/features/modules/module-config";
import { Spinner } from "@/components/ui/spinner";
import { RecipientWizardPage } from "./recipient-wizard-page";

/** Same role rule as the Recipients list. */
export function RecipientWizardGate() {
  const user = useAppSelector((state) => state.auth.user);
  const router = useRouter();
  const ask = useClientFirst({ active: true, onCancel: () => router.push("/recipients") });
  if (!user) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!moduleConfig.recipients.roles.includes(user.platformRole)) return <p className="py-20 text-center text-muted">This page isn&apos;t available for your account.</p>;
  return <>{ask.dialog}{ask.ready && <RecipientWizardPage forTenant={ask.tenantId} />}</>;
}
