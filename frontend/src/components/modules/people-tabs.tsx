import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "recipients", label: "Recipients", href: "/recipients" },
  { key: "recipient-groups", label: "Groups", href: "/recipient-groups" }
];

/** People and Groups live under one sidebar entry; these tabs switch between them. */
export function PeopleTabs({ active, className = "mb-6" }: { active: string; className?: string }) {
  return <div role="tablist" aria-label="People and groups" className={cn("inline-flex rounded-2xl bg-black/5 p-1", className)}>
    {tabs.map((tab) => <Link key={tab.key} role="tab" aria-selected={active === tab.key} href={tab.href} className={cn("press flex min-h-10 items-center rounded-xl px-5 text-sm font-semibold transition", active === tab.key ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}>{tab.label}</Link>)}
  </div>;
}
