import { api } from "@/services/api-client";
import { endpoints } from "@/services/endpoints";
import { clearRequestCache } from "@/features/modules/module.service";
import type { AuthMeResponse, LoginResponse, AuthSession } from "@/types/api";

export const authService = {
  async login(payload: { email: string; password: string }) {
    const { data } = await api.post<LoginResponse>(endpoints.auth.login, payload);
    if (typeof window !== "undefined" && data.session) window.localStorage.setItem("tofaa-session", JSON.stringify(data.session));
    return data;
  },
  async me() {
    const { data } = await api.get<AuthMeResponse>(endpoints.auth.me);
    return toAuthUser(data);
  },
  async logout() {
    try { await api.post(endpoints.auth.logout, {}); }
    finally { clearRequestCache(); if (typeof window !== "undefined") window.localStorage.removeItem("tofaa-session"); }
  },
  async resetPassword(newPassword: string) {
    await api.post(endpoints.auth.resetPassword, { newPassword });
  },
  async refresh(refresh_token: string) {
    const { data } = await api.post<AuthSession>(endpoints.auth.refresh, { refresh_token });
    return data;
  }
};

export function toAuthUser(user: AuthMeResponse) {
  return {
    id: user.id,
    email: user.email,
    name: user.full_name || user.email,
    platformRole: user.role === "KAM" ? "TOFAA_TEAM" as const : user.role,
    tenant: user.tenant_id ? { id: user.tenant_id, name: "" } : undefined,
    permissions: [],
    mustResetPassword: user.must_reset_password === true
  };
}
