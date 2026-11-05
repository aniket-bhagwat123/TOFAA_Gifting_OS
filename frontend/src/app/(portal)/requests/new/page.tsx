import { Suspense } from "react";
import { GiftRequestForm } from "@/components/gift-requests/gift-request-form";

export default function NewGiftRequestPage() {
  return <Suspense fallback={null}><GiftRequestForm /></Suspense>;
}
