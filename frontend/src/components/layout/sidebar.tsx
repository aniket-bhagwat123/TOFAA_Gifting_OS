"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppSelector } from "@/store/hooks";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, Users, CalendarDays, ClipboardList, Gift,
  Bell, UserCog, Sparkles, Wallet, CalendarRange, FileText, Settings
} from "lucide-react";

const nav = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Tenants", href: "/clients", icon: Building2, roles: ["TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Recipients", href: "/recipients", icon: Users, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Occasions", href: "/occasions", icon: CalendarDays, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Requests", href: "/requests", icon: ClipboardList, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Gifts", href: "/gifts", icon: Gift, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Events", href: "/events", icon: CalendarRange, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Credit requests", href: "/credits", icon: Wallet, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Contract workspace", href: "/contract", icon: FileText, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Gift spend", href: "/gift-spend", icon: Wallet, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Spend settings", href: "/gift-spend-settings", icon: Settings, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Recipient groups", href: "/recipient-groups", icon: Users, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Notifications", href: "/notifications", icon: Bell, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
  { label: "Team users", href: "/team-users", icon: UserCog, roles: ["SUPER_ADMIN"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAppSelector((state) => state.auth.user);
  const role = user?.platformRole || "CLIENT";
  return <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-hidden border-r border-line bg-white lg:flex">
    <div className="flex h-[76px] shrink-0 items-center gap-3 border-b border-line px-6 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white"><Sparkles size={20} /></div>
      <div><p className="font-semibold tracking-tight text-ink">TOFAA</p><p className="text-[11px] text-muted">Gifting OS</p></div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-6">
      <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
      <nav className="space-y-1">
        {nav.filter((item) => item.roles.includes(role)).map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-ink")}>
            <Icon size={18} strokeWidth={1.8} />{item.label}
          </Link>;
        })}
      </nav>
    </div>
    <div className="mt-auto p-4"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold text-ink">Need assistance?</p><p className="mt-1 text-xs leading-5 text-muted">Contact your TOFAA administrator for access or workflow support.</p></div></div>
  </aside>;
}
