export const endpoints = {
  auth: {
    login: "/auth/login",
    logout: "/auth/logout",
    me: "/auth/me",
    refresh: "/auth/refresh",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password"
  },
  tenants: "/tenants",
  occasions: "/occasions",
  referenceData: "/reference-data"
} as const;
