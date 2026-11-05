import { getModuleRecords } from "./module.service";
import { titleCase } from "@/lib/utils";

export function rowsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  if (data && typeof data === "object") {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) return items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    return [data as Record<string, unknown>];
  }
  return [];
}

export async function loadAllModuleRecords(endpoint: string): Promise<Record<string, unknown>[]> {
  const limit = 100;
  const first = await getModuleRecords(endpoint, { page: 1, limit }, { ttl: 30_000 });
  const records = rowsOf(first);
  const pagination = first && typeof first === "object" ? (first as any).pagination : undefined;
  const total = Number(pagination?.total_records ?? pagination?.totalRecords ?? records.length);
  const pages = Math.ceil(total / limit);
  if (pages <= 1 || !records.length) return records;
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => getModuleRecords(endpoint, { page: index + 2, limit }, { ttl: 30_000 })));
  for (const data of rest) records.push(...rowsOf(data));
  return records;
}

export function formatTimestamp(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return String(value ?? "—");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(date);
}


export const columnLabels: Record<string, string> = {
  mobileNumber: "Mobile", dateOfBirth: "Birthday", budget: "Budget", tenantType: "Type", createdAt: "Added", requestedBudget: "Budget",
  giftName: "Gift", unitPrice: "Price", requestedCredits: "Credits", amountDueMinor: "Amount due", occasionName: "Occasion", occasionDate: "Date",
  eventName: "Event", eventDate: "Date", isActive: "Status", fullName: "Name", notificationType: "About", readAt: "Seen", recipientIds: "People", slaState: "Timing", summary: "What changed", changedAt: "When"
};
export const labelOf = (col: string) => columnLabels[col] ?? titleCase(col);
export const moneyColumns = new Set(["budget", "requestedBudget", "unitPrice"]);
export const dateColumns = new Set(["dateOfBirth", "occasionDate", "eventDate", "readAt"]);

