export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field?: string; message?: string; code?: string }>;
  };
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  platformRole: "CLIENT" | "TOFAA_TEAM" | "SUPER_ADMIN";
  avatarUrl?: string | null;
  /** The name as typed on the profile (empty when never set); `name` falls back to the email. */
  fullName?: string;
  mobileNumber?: string | null;
  tenant?: { id: string; name: string };
  permissions: string[];
  /** True while the user is still on a temporary password (e.g. just invited). */
  mustResetPassword: boolean;
}

export interface AuthSession { access_token: string; refresh_token: string; expires_at?: number | null; expires_in?: number | null; token_type?: string }
export interface AuthMeResponse { id: string; email: string; full_name?: string | null; role: "CLIENT" | "KAM" | "SUPER_ADMIN"; tenant_id?: string | null; [key: string]: unknown }
export interface LoginResponse {
  user: AuthMeResponse;
  session: AuthSession;
}

export interface ApiEnvelope<T> { data: T; message?: string }
