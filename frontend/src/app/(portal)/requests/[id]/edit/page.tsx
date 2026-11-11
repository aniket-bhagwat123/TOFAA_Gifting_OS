import { redirect } from "next/navigation";

// Editing happens in a dialog on the request page.
export default async function EditGiftRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/requests/${id}?edit=1`);
}
