import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import type { ApiErrorBody } from "@/types/api";

const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: `${baseURL.replace(/\/$/, "")}/api/v1`,
  withCredentials: true,
  timeout: 20000,
  headers: { "Content-Type": "application/json" }
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const session = readSession();
    if (session?.access_token) config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

/** Called when the sign-in can no longer be renewed. The app registers a handler that clears its state and shows the login page. */
let sessionExpiredHandler: ((hadSession: boolean) => void) | null = null;
let expiring = false;
export function setSessionExpiredHandler(handler: ((hadSession: boolean) => void) | null) { sessionExpiredHandler = handler; }
function expireSession(hadSession: boolean) {
  if (typeof window !== "undefined") window.localStorage.removeItem("tofaa-session");
  if (expiring) return;
  expiring = true;
  setTimeout(() => { expiring = false; }, 3000);
  if (sessionExpiredHandler) sessionExpiredHandler(hadSession);
  else window.location.assign("/login");
}

let refreshInFlight: Promise<string | null> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const isAuthPage = window.location.pathname.startsWith("/login");
      const request = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
      const session = readSession();
      if (!isAuthPage && !request?._retried && session?.refresh_token) {
        request!._retried = true;
        refreshInFlight ??= axios.post(`${api.defaults.baseURL}/auth/refresh`, { refresh_token: session.refresh_token }, { headers: { "Content-Type": "application/json" } })
          .then(({ data }) => { window.localStorage.setItem("tofaa-session", JSON.stringify(data)); return data.access_token as string; })
          .catch(() => { window.localStorage.removeItem("tofaa-session"); return null; })
          .finally(() => { refreshInFlight = null; });
        const token = await refreshInFlight;
        if (token && request) { request.headers.Authorization = `Bearer ${token}`; return api(request); }
      }
      if (!isAuthPage) expireSession(!!session);
    }
    return Promise.reject(error);
  }
);

function readSession(): { access_token?: string; refresh_token?: string } | null {
  try { return JSON.parse(window.localStorage.getItem("tofaa-session") || "null"); }
  catch { return null; }
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return (error.response?.data as any)?.detail?.[0]?.msg || (error.response?.data as any)?.detail || error.response?.data?.error?.message
      || error.response?.data?.message
      || error.message
      || "Something went wrong. Please try again.";
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function getApiFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return {};
  const details = error.response?.data?.error?.details ?? [];
  const mapped = details.filter((item) => item.field && item.message).map((item) => [item.field!, item.message!] as const);
  const validation = (error.response?.data as any)?.detail;
  if (Array.isArray(validation)) mapped.push(...validation.filter((item: any) => Array.isArray(item.loc) && item.msg).map((item: any) => [String(item.loc.at(-1)), item.msg] as const));
  return Object.fromEntries(mapped);
}
