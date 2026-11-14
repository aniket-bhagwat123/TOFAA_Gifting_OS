"use client";

import { LogOut, Menu, Eye, ChevronDown, Building2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logoutUser } from "@/features/auth/auth.slice";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { displayName } from "@/lib/utils";
import { selectedTenantKey, setSelectedTenant } from "@/features/modules/modules.slice";

const moduleTitles: Record<string, string> = {
  home: "Home",
  requests: "Gift requests",
  gifts: "Gifts",
  events: "Events",
  occasions: "Occasions",
  credits: "Budgets",
  clients: "Clients",
  recipients: "People",
  "recipient-groups": "Recipient groups",
  "team-users": "Users",
  activity: "Activity",
  profile: "My profile"
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const user = useAppSelector((state) => state.auth.user);
  const tenants = useAppSelector((state) => (state.modules.byKey.tenantOptions?.data as any)?.items ?? []);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const segment = pathname.split("/").filter(Boolean)[0] ?? "home";
  const moduleTitle = moduleTitles[segment] ?? segment.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  async function handleLogout() {
    try { await dispatch(logoutUser()).unwrap(); router.replace("/login"); }
    catch { toast.error("We couldn't sign you out. Please try again."); }
  }

  const shownName = displayName(user);
  const roleLabel = user?.platformRole === "SUPER_ADMIN" ? "Super Admin"
    : user?.platformRole === "TOFAA_TEAM" ? "Account Manager"
    : user?.clientRole === "OWNER" ? "Owner"
    : user?.clientRole === "EA" ? "EA to Director"
    : user?.clientRole === "HR" ? "HR"
    : user?.platformRole === "CLIENT" ? "Client"
    : null;
  // Translucent chrome: content scrolls beneath it, separated by a hairline only.
  return <header className="material material-edge relative sticky top-0 z-20 flex h-[68px] items-center justify-between px-4 sm:px-6 lg:px-6">
    <div className="flex items-center gap-2">
      <button onClick={onMenu} className="press flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-black/5 lg:hidden" aria-label="Open menu"><Menu size={22} /></button>
      <h1 className="truncate text-lg font-semibold text-ink">{moduleTitle}</h1>
    </div>
    {user?.platformRole === "CLIENT" && user.tenant?.name && (
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-full items-center justify-center sm:flex">
        <div className="flex items-center gap-2 rounded-2xl border border-brand/20 bg-gradient-to-r from-brand/5 to-emerald-50/60 px-4 py-1.5 shadow-sm">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
            <Building2 size={13} />
          </div>
          <span className="max-w-[180px] truncate text-[13px] font-semibold text-slate-800">{user.tenant.name}</span>
        </div>
      </div>
    )}
    <div className="flex items-center gap-1.5 sm:gap-3">
      {user?.platformRole !== "CLIENT" && tenants.length > 0 && segment !== "clients" && (() => {
        const activeTenant = tenants.find((t: { id: string; name: string }) => t.id === selectedTenantId);
        return (
          <div className="relative">
            <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.07)] transition-shadow hover:shadow-[0_2px_6px_rgba(0,0,0,0.11)]">
              <Eye size={14} className="shrink-0 text-brand opacity-70" />
              <div className="flex flex-col leading-none">
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">Viewing Client</span>
                <span className={`mt-0.5 text-[13px] font-semibold leading-none ${activeTenant ? "text-slate-800" : "text-slate-400"}`}>
                  {activeTenant ? activeTenant.name : "Choose client"}
                </span>
              </div>
              <ChevronDown size={13} className="shrink-0 text-slate-400" />
              <select
                aria-label="Client you are working on"
                value={selectedTenantId ?? ""}
                onChange={(event) => { window.localStorage.setItem(selectedTenantKey(user?.id), event.target.value); dispatch(setSelectedTenant(event.target.value)); }}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="" disabled>Choose a client</option>
                {tenants.map((tenant: { id: string; name: string }) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
            </div>
            {!selectedTenantId && (
              <span className="animate-pulse-ring absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />
            )}
          </div>
        );
      })()}
      <div className="flex items-center gap-2.5 pl-1">
        <Link href="/profile" aria-label="Open your profile" className="press flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-brand/20">
          <Avatar name={shownName} src={user?.avatarUrl} />
          <div className="hidden flex-col leading-none md:flex">
            <span className="text-sm font-medium text-ink capitalize">{shownName}</span>
            {roleLabel && <span className="mt-0.5 text-[11px] text-slate-400">{roleLabel}</span>}
          </div>
        </Link>
        <button onClick={handleLogout} title="Sign out" className="press flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-black/5"><LogOut size={18} /><span className="hidden md:inline">Sign out</span></button>
      </div>
    </div>
  </header>;
}
