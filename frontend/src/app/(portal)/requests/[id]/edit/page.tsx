import { Suspense } from "react";
import { GiftRequestForm } from "@/components/gift-requests/gift-request-form";

export default async function EditGiftRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={null}><GiftRequestForm requestId={id} /></Suspense>;
}
