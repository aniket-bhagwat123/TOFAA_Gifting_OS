import { Suspense } from "react";
import { GiftRequestsList } from "@/components/gift-requests/gift-requests-list";

export default function GiftRequestsPage() {
  return <Suspense fallback={null}><GiftRequestsList /></Suspense>;
}
