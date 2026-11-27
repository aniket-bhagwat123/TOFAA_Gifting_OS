import { getModuleRecords } from "@/features/modules/module.service";

/** A dashboard banner. Banners are managed in TOFAA CRM; our backend fetches them with its server-side key. */
export type Banner = { id: string; title?: string | null; imageUrl: string };
export type CalendarFilter = "ALL" | "EXTERNAL" | "INTERNAL" | "COMPANY";
export type CalendarItem = { key: string; date: string; title: string; label: string; kind: string; category: "EXTERNAL" | "INTERNAL" | "COMPANY" | "OTHER"; recipientId?: string | null };
export type CalendarData = { month: string; items: CalendarItem[]; counts: Record<CalendarFilter, number> };
export type PersonCard = { recipientId: string; name: string; avatarUrl?: string | null; designation?: string | null; label: string; kind: string; date: string; daysAway: number };
export type ActionItem = { key: string; kind: "PROPOSAL_REVIEW" | "ADDRESS_MISSING"; title: string; description: string; requestId?: string | null; recipientId?: string | null };
export type DashboardSummary = { importantExternal: PersonCard[]; importantInternal: PersonCard[]; actionRequired: { total: number; items: ActionItem[] } };

export type UpcomingPeople = { external: PersonCard[]; internal: PersonCard[] };
/** The whole home page in one response. */
export type DashboardOverview = { calendar: CalendarData; summary: DashboardSummary };

export const dashboardService = {
  /** Never remembered in the browser: each page open must see the CRM as it is now (uploads and deletions). */
  banners: (tenantId?: string | null) => getModuleRecords("/banners", tenantId ? { tenantId } : {}) as Promise<Banner[]>,
  calendar: (tenantId: string, month: string, category: CalendarFilter) => getModuleRecords(`/tenants/${tenantId}/dashboard/calendar`, { month, category }) as Promise<CalendarData>,
  /** The month calendar, the upcoming People cards and the action list, loaded together on the server. */
  overview: (tenantId: string, month: string, category: CalendarFilter = "ALL") => getModuleRecords(`/tenants/${tenantId}/dashboard/overview`, { month, category }) as Promise<DashboardOverview>,
  upcomingPeople: (tenantId: string, category: "ALL" | "EXTERNAL" | "INTERNAL" = "ALL", limit = 5, days = 60) => getModuleRecords(`/tenants/${tenantId}/dashboard/upcoming-people`, { category, limit, days }) as Promise<UpcomingPeople>,
  summary: (tenantId: string) => getModuleRecords(`/tenants/${tenantId}/dashboard/summary`, {}) as Promise<DashboardSummary>,
};
