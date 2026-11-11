import { Suspense } from "react";
import { GiftRequestDetail } from "@/components/gift-requests/gift-request-detail";

export default async function GiftRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={null}><GiftRequestDetail requestId={id} /></Suspense>;
}
