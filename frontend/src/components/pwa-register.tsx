"use client";

import { useEffect } from "react";

/** Registers the service worker (production only, so development hot reload is never cached). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register(); else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
