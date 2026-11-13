"use client";

import { useAppSelector } from "@/store/hooks";
import { moduleConfig } from "@/features/modules/module-config";
import { Spinner } from "@/components/ui/spinner";
import { RecipientsView } from "./recipients-view";

/** Same role rule as every other module, driven by module-config. */
export function RecipientsGate({ startNew = false }: { startNew?: boolean }) {
  const user = useAppSelector((state) => state.auth.user);
  if (!user) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!moduleConfig.recipients.roles.includes(user.platformRole)) return <p className="py-20 text-center text-muted">This page isn&apos;t available for your account.</p>;
  return <RecipientsView startNew={startNew} />;
}
