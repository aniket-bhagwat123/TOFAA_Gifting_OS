import { Suspense } from "react";
import { GiftRequestsList } from "@/components/gift-requests/gift-requests-list";

export default function NewGiftRequestPage() {
  return <Suspense fallback={null}><GiftRequestsList startNew /></Suspense>;
}
