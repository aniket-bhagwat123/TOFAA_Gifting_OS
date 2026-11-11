"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { moduleConfig } from "@/features/modules/module-config";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ModuleList } from "./module-list";
import { PeopleTabs } from "./people-tabs";
import { OccasionsBoard } from "@/components/occasions/board/occasions-board";
import { GroupsPanel } from "@/components/recipients/groups-panel";
import { ActivityView } from "./activity-view";
import { CreditsView } from "./credits-view";

/** Route guard: only roles listed in the module's config can open it. */
export function ModuleGate({ moduleKey }: { moduleKey: string }) {
  const user = useAppSelector((state) => state.auth.user);
  const config = moduleConfig[moduleKey];
  if (!user) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!config.roles.includes(user.platformRole)) {
    return <EmptyState title="This page isn't available for your account" description="Head back to Home to see what you can do." action={<Link href="/home"><Button><Lock size={16} /> Back to Home</Button></Link>} />;
  }
  return <>
    {(moduleKey === "recipients" || moduleKey === "recipient-groups") && <PeopleTabs active={moduleKey} />}
    {moduleKey === "occasions" && user.platformRole === "CLIENT" ? <OccasionsBoard /> : moduleKey === "occasions" && user.platformRole === "SUPER_ADMIN" ? <GroupsPanel embedded /> : moduleKey === "activity" ? <ActivityView /> : moduleKey === "credits" ? <CreditsView /> : <ModuleList moduleKey={moduleKey} />}
  </>;
}
