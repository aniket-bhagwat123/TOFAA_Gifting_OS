import { OccasionSend } from "@/components/occasions/occasion-send";

export default async function OccasionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OccasionSend occasionId={id} />;
}
