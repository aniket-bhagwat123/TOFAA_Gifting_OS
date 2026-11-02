import { notFound } from "next/navigation";
import { ModuleList } from "@/components/modules/module-list";
import { moduleConfig } from "@/features/modules/module-config";

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const config = moduleConfig[module];
  if (!config) notFound();
  return <ModuleList moduleKey={module} />;
}
