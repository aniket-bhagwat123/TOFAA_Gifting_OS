import { Suspense } from "react";
import { RecipientsGate } from "@/components/recipients/recipients-gate";

export default function RecipientsPage() {
  return <Suspense fallback={null}><RecipientsGate /></Suspense>;
}
