import { Building2, Users } from "lucide-react";
import { Tab, TabBar } from "@/components/ui/tab-bar";

/** People and Groups live under one sidebar entry; these tabs switch between them. */
export function PeopleTabs({ active, counts, className }: { active: string; counts?: { recipients?: number; groups?: number }; className?: string }) {
  return <TabBar label="People and groups" className={className}>
    <Tab variant="solid" href="/recipients" active={active === "recipients"} icon={<Users size={16} />} count={counts?.recipients}>Recipients</Tab>
    <Tab variant="solid" href="/recipient-groups" active={active === "recipient-groups"} icon={<Building2 size={16} />} count={counts?.groups}>Groups</Tab>
  </TabBar>;
}
