"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppSelector } from "@/store/hooks";
import { cn } from "@/lib/utils";
import { moduleConfig, type PlatformRole } from "@/features/modules/module-config";
import { Home, Building2, Users, CalendarDays, ClipboardList, Gift, Sparkles, Wallet, CalendarRange, History, Megaphone, Lightbulb, X } from "lucide-react";

type Role = PlatformRole;

interface NavItem { label: string; href: string; icon: typeof Home; roles: Role[]; /** Extra paths that highlight this item. */ also?: string[] }

const item = (key: string, label: string, icon: typeof Home, also?: string[]): NavItem => ({ label, href: `/${key}`, icon, roles: moduleConfig[key].roles, also });

// Who can see what comes from each module's `roles` in module-config — one source of truth.
const groups: { title: string; items: NavItem[] }[] = [
  { title: "", items: [
    { label: "Home", href: "/home", icon: Home, roles: ["CLIENT", "TOFAA_TEAM", "SUPER_ADMIN"] },
    item("occasions", "Gift Calendar", CalendarDays),
    item("gift-ideas", "Gift Ideas", Lightbulb),
    item("recipients", "People", Users, ["/recipient-groups"]),
    item("requests", "Gift requests", ClipboardList),
    item("credits", "Budgets", Wallet),
    item("activity", "Activity", History)
  ] },
  { title: "More", items: [
    item("gifts", "Gifts", Gift),
    item("events", "Events", CalendarRange),
    item("clients", "Clients", Building2),
    item("banners", "Banners", Megaphone)
  ] },
  // "Users" (team-users) hidden from nav — backend module still active
];

function Brand() {
  return <div className="flex items-center gap-3">
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white"><Sparkles size={18} /></div>
    <div><p className="text-sm font-semibold leading-tight text-ink">TOFAA</p><p className="text-[11px] text-muted">Gifting</p></div>
  </div>;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const role = (useAppSelector((state) => state.auth.user?.platformRole) || "CLIENT") as Role;
  return <nav aria-label="Main" className="space-y-5">
    {groups.map((group) => {
      const items = group.items.filter((entry) => entry.roles.includes(role));
      if (!items.length) return null;
      return <div key={group.title || "top"}>
        {group.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{group.title}</p>}
        <div className="space-y-1">{items.map((item) => {
          const active = [item.href, ...(item.also ?? [])].some((path) => pathname === path || (path !== "/home" && pathname.startsWith(path)));
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("press flex min-h-[38px] items-center gap-2.5 rounded-[7px] px-3 text-sm font-medium", active ? "bg-brand/10 text-brand" : "text-slate-700 hover:bg-black/5 hover:text-ink")}>
            <Icon size={18} strokeWidth={1.8} />{item.label}
          </Link>;
        })}</div>
      </div>;
    })}
  </nav>;
}

export function Sidebar({ mobileOpen = false, onClose = () => {} }: { mobileOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onClose]);

  return <>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[216px] flex-col border-r border-line/70 bg-white lg:flex">
      <div className="flex h-16 shrink-0 items-center px-5"><Brand /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-2"><NavList /></div>
    </aside>
    {mobileOpen && <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
      <div className="absolute inset-0 bg-slate-950/40 animate-fade-in" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 flex w-[216px] max-w-[85vw] flex-col bg-white shadow-float animate-drawer-in">
        <div className="flex h-16 shrink-0 items-center justify-between px-5"><Brand /><button onClick={onClose} aria-label="Close menu" className="press flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-black/5"><X size={20} /></button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-2"><NavList onNavigate={onClose} /></div>
      </aside>
    </div>}
  </>;
}
