"use client";

import { useRef } from "react";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { Toaster } from "sonner";
import { makeStore, type AppStore } from "@/store";

export function Providers({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();
  return (
    <Provider store={storeRef.current}>
      <PersistGate persistor={storeRef.current.persistor} loading={<div className="min-h-screen bg-canvas" />}>
        {children}
        <Toaster position="top-right" richColors />
      </PersistGate>
    </Provider>
  );
}
