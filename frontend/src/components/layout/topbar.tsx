"use client";

import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logoutUser } from "@/features/auth/auth.slice";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setSelectedTenant } from "@/features/modules/modules.slice";

export function Topbar() {
  const user = useAppSelector((state) => state.auth.user);
  const tenants = useAppSelector((state) => (state.modules.byKey.tenantOptions?.data as any)?.items ?? []);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const dispatch = useAppDispatch();
  const router = useRouter();

  async function handleLogout() {
    try { await dispatch(logoutUser()).unwrap(); router.replace("/login"); }
    catch { toast.error("Unable to sign out. Please try again."); }
  }

  return <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-line bg-white/90 px-5 backdrop-blur lg:px-8">
    <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-muted hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu size={20} /></button><div><p className="text-sm font-semibold text-ink">Workspace</p><p className="text-xs text-muted">{user?.tenant?.name || "TOFAA Operations"}</p></div></div>
    <div className="flex items-center gap-3">
      <button className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell size={19} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500" /></button>
      <div className="hidden h-8 w-px bg-line sm:block" />
      {user?.platformRole !== "CLIENT" && tenants.length > 0 && <select aria-label="Active tenant" value={selectedTenantId ?? ""} onChange={(event) => dispatch(setSelectedTenant(event.target.value))} className="max-w-48 rounded-lg border border-line bg-white px-2 py-2 text-xs text-ink">{tenants.map((tenant: { id: string; name: string }) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select>}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">{user?.name?.split(" ").map((x) => x[0]).slice(0,2).join("") || "U"}</div>
        <div className="hidden sm:block"><p className="text-xs font-semibold text-ink">{user?.name || "Loading user"}</p><p className="text-[11px] text-muted">{user?.platformRole === "CLIENT" ? "Tenant" : user?.platformRole?.replaceAll("_", " ")}</p></div>
        <Button variant="ghost" size="sm" onClick={handleLogout} title="Sign out"><LogOut size={16} /><span className="hidden md:inline">Sign out</span><ChevronDown size={13} /></Button>
      </div>
    </div>
  </header>;
}
