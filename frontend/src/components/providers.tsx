"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { Toaster, toast } from "sonner";
import { setSessionExpiredHandler } from "@/services/api-client";
import { clearAuth } from "@/features/auth/auth.slice";
import { clearModuleData } from "@/features/modules/modules.slice";
import { clearRequestCache } from "@/features/modules/module.service";
import { makeStore, type AppStore } from "@/store";

export function Providers({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();
  const router = useRouter();
  useEffect(() => {
    const store = storeRef.current!;
    setSessionExpiredHandler((hadSession) => {
      clearRequestCache();
      store.dispatch(clearAuth());
      store.dispatch(clearModuleData());
      if (hadSession) toast.warning("Your session has expired. Please sign in again to continue.", { id: "session-expired", duration: 6000 });
      router.replace("/login");
    });
    return () => setSessionExpiredHandler(null);
  }, [router]);
  return (
    <Provider store={storeRef.current}>
      <PersistGate persistor={storeRef.current.persistor} loading={<div className="min-h-screen bg-canvas" />}>
        {children}
        <Toaster position="top-right" richColors />
      </PersistGate>
    </Provider>
  );
}
