import { getModuleRecords } from "@/features/modules/module.service";

export type Banner = { id: string; placement: "INSIGHT" | "NOTE"; eyebrow?: string | null; title: string; body?: string | null; ctaLabel?: string | null; ctaUrl?: string | null; imageUrl?: string | null };
export type CalendarFilter = "ALL" | "EXTERNAL" | "INTERNAL" | "COMPANY";
export type CalendarItem = { key: string; date: string; title: string; label: string; kind: string; category: "EXTERNAL" | "INTERNAL" | "COMPANY" | "OTHER"; recipientId?: string | null };
export type CalendarData = { month: string; items: CalendarItem[]; counts: Record<CalendarFilter, number> };
export type PersonCard = { recipientId: string; name: string; avatarUrl?: string | null; designation?: string | null; label: string; kind: string; date: string; daysAway: number };
export type ActionItem = { key: string; kind: "PROPOSAL_REVIEW" | "ADDRESS_MISSING"; title: string; description: string; requestId?: string | null; recipientId?: string | null };
export type DashboardSummary = { importantExternal: PersonCard[]; importantInternal: PersonCard[]; actionRequired: { total: number; items: ActionItem[] } };

export const dashboardService = {
  banners: (placement: Banner["placement"]) => getModuleRecords("/banners", { placement }, { ttl: 60_000 }) as Promise<Banner[]>,
  calendar: (tenantId: string, month: string, category: CalendarFilter) => getModuleRecords(`/tenants/${tenantId}/dashboard/calendar`, { month, category }) as Promise<CalendarData>,
  summary: (tenantId: string) => getModuleRecords(`/tenants/${tenantId}/dashboard/summary`, {}) as Promise<DashboardSummary>,
};
