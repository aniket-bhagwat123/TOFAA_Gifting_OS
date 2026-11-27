"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { FirstLoginPasswordDialog } from "./first-login-password-dialog";
import { Topbar } from "./topbar";
import { Spinner } from "@/components/ui/spinner";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadCurrentUser } from "@/features/auth/auth.slice";
import { loadModule, selectedTenantKey, setSelectedTenant } from "@/features/modules/modules.slice";
import { ALL_CLIENTS, type ClientOption, setClients } from "@/services/all-clients";
import { ClientChooser } from "./client-chooser";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const status = useAppSelector((state) => state.auth.status);
  const user = useAppSelector((state) => state.auth.user);
  const tenantOptions = useAppSelector((state) => state.modules.byKey.tenantOptions);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);

  useEffect(() => { if (status === "idle") void dispatch(loadCurrentUser()); }, [dispatch, status]);
  useEffect(() => {
    if (user && user.platformRole !== "CLIENT" && !tenantOptions) void dispatch(loadModule({ key: "tenantOptions", endpoint: "/tenants", params: { page: 1, limit: 100 } }));
  }, [dispatch, user, tenantOptions]);
  // Staff see all clients unless they last chose one. (Under "All clients" nothing is guessed: something new asks whose it is.)
  const clients = (tenantOptions?.data as { items?: ClientOption[] } | undefined)?.items;
  if (clients) setClients(clients); // before the screens ask for data
  useEffect(() => {
    if (!clients?.length || selectedTenantId || !user) return;
    const remembered = window.localStorage.getItem(selectedTenantKey(user.id));
    dispatch(setSelectedTenant(remembered && clients.some((client) => client.id === remembered) ? remembered : ALL_CLIENTS));
  }, [dispatch, user, clients, selectedTenantId]);
  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  // First sign-in with a temporary password: land on the dashboard, where a dialog asks for a new password.
  const mustReset = status === "authenticated" && !!user?.mustResetPassword;
  useEffect(() => { if (mustReset && pathname !== "/home") router.replace("/home"); }, [mustReset, pathname, router]);

  if (status === "idle" || status === "loading" || (status === "authenticated" && !user)) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas"><Spinner /></div>;
  }
  if (status !== "authenticated") return null;

  return <div className="min-h-screen bg-canvas"><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2">Skip to content</a><Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} /><div className="lg:pl-[216px]"><Topbar onMenu={() => setMenuOpen(true)} /><main id="main" className="animate-rise-in p-4 sm:p-5 lg:p-5">{children}</main></div><FirstLoginPasswordDialog open={mustReset} />{selectedTenantId === ALL_CLIENTS && <ClientChooser />}</div>;
}
