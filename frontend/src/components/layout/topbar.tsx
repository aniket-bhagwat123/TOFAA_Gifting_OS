"use client";

import { LogOut, Menu } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logoutUser } from "@/features/auth/auth.slice";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { displayName } from "@/lib/utils";
import { selectedTenantKey, setSelectedTenant } from "@/features/modules/modules.slice";

const moduleTitles: Record<string, string> = {
  home: "Home",
  requests: "Gifting Activity",
  gifts: "Gifts",
  events: "Events",
  occasions: "Occasions",
  credits: "Budgets",
  clients: "Clients",
  recipients: "People",
  "recipient-groups": "Recipient groups",
  "team-users": "Users",
  activity: "Activity"
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
  const initials = shownName.split(" ").map((x) => x[0]).slice(0, 2).join("") || "U";
  // Translucent chrome: content scrolls beneath it, separated by a hairline only.
  return <header className="material material-edge sticky top-0 z-20 flex h-[68px] items-center justify-between px-4 sm:px-6 lg:px-8">
    <div className="flex items-center gap-2">
      <button onClick={onMenu} className="press flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-black/5 lg:hidden" aria-label="Open menu"><Menu size={22} /></button>
      <h1 className="truncate text-lg font-semibold text-ink">{moduleTitle}</h1>
    </div>
    <div className="flex items-center gap-1.5 sm:gap-3">
      {user?.platformRole !== "CLIENT" && tenants.length > 0 && <label className="flex items-center gap-2 text-sm text-muted">
        <span className="hidden sm:inline">Viewing</span>
        <select aria-label="Client you are working on" value={selectedTenantId ?? ""} onChange={(event) => { window.localStorage.setItem(selectedTenantKey(user?.id), event.target.value); dispatch(setSelectedTenant(event.target.value)); }} className={`min-h-10 max-w-40 rounded-xl border bg-white px-3 text-sm text-ink sm:max-w-56 ${selectedTenantId ? "border-line" : "border-amber-400"}`}>
          <option value="" disabled>Choose a client</option>
          {tenants.map((tenant: { id: string; name: string }) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
        </select>
      </label>}
      <div className="flex items-center gap-2.5 pl-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand uppercase" aria-hidden>{initials}</div>
        <p className="hidden text-sm font-medium text-ink md:block capitalize">{shownName}</p>
        <button onClick={handleLogout} title="Sign out" className="press flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-black/5"><LogOut size={18} /><span className="hidden md:inline">Sign out</span></button>
      </div>
    </div>
  </header>;
}
