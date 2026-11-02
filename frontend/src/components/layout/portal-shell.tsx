"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadCurrentUser } from "@/features/auth/auth.slice";
import { loadModule } from "@/features/modules/modules.slice";

export function PortalShell({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const status = useAppSelector((state) => state.auth.status);
  const user = useAppSelector((state) => state.auth.user);
  const tenantOptions = useAppSelector((state) => state.modules.byKey.tenantOptions);

  useEffect(() => { if (status === "idle") void dispatch(loadCurrentUser()); }, [dispatch, status]);
  useEffect(() => {
    if (user && user.platformRole !== "CLIENT" && !tenantOptions) void dispatch(loadModule({ key: "tenantOptions", endpoint: "/tenants", params: { page: 1, limit: 100 } }));
  }, [dispatch, user, tenantOptions]);
  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === "idle" || status === "loading" || (status === "authenticated" && !user)) {
    return <div className="flex min-h-screen items-center justify-center bg-canvas"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div>;
  }
  if (status !== "authenticated") return null;

  return <div className="min-h-screen bg-canvas"><Sidebar /><div className="lg:pl-64"><Topbar /><main className="mx-auto max-w-[1600px] p-5 lg:p-8">{children}</main></div></div>;
}
