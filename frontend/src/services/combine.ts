/**
 * Putting several clients' answers together for "All clients": lists are joined and ordered, counts and totals added up,
 * and a page is cut from the joined list. No imports, so it can be checked on its own.
 */
export type Answer = { tenantId: string; tenantName: string; body: unknown };
export type Query = Record<string, unknown>;
type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const PEOPLE_LISTS = ["importantExternal", "importantInternal", "external", "internal"];
const NOT_SUMMED = ["page", "limit"];

const text = (value: unknown) => String(value ?? "").toLowerCase();
const PRIORITY: Record<string, number> = { VIP: 0, HIGH: 1, NORMAL: 2 };
const by = (field: string, descending = false) => (a: Row, b: Row) => (descending ? -1 : 1) * text(a[field]).localeCompare(text(b[field]), undefined, { numeric: true });

/** How a joined list is ordered: the way one client's list comes from the server. */
function order(path: string, query: Query, sample: Row): ((a: Row, b: Row) => number) | null {
  const sort = String(query.sort ?? "");
  if (/\/occasions\/overview$/.test(path) && "date" in sample) {
    if (sort === "name") return by("name");
    if (sort === "priority") return (a, b) => (PRIORITY[String(a.priority)] ?? 2) - (PRIORITY[String(b.priority)] ?? 2) || by("date")(a, b);
    return (a, b) => by("date")(a, b) || by("name")(a, b);
  }
  if (/\/recipients$/.test(path) && "name" in sample) {
    const field = ({ name: "name", city: "city", mobile: "mobileNumber" } as Record<string, string>)[sort];
    if (field) return by(field, query.order === "desc");
    if (sort !== "nextOccasion" && "createdAt" in sample) return by("createdAt", query.order !== "asc");
  }
  if ("changedAt" in sample) return by("changedAt", true);
  if ("daysAway" in sample) return (a, b) => Number(a.daysAway) - Number(b.daysAway);
  for (const field of ["date", "eventDate"]) if (field in sample) return by(field);
  if ("createdAt" in sample && !("occasionName" in sample)) return by("createdAt", true);
  for (const field of ["occasionName", "name", "fullName"]) if (field in sample) return by(field);
  return null;
}

function joinLists(parts: { answer: Answer; value: unknown[] }[], path: string, query: Query): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  // The same thing for every client (a TOFAA festival, a banner) is listed once, except on the planning list, where
  // each client has its own status for it and the tab counts include every copy.
  const once = !(/\/occasions\/overview$/.test(path) && query.tab !== undefined);
  for (const { answer, value } of parts) {
    for (const item of value) {
      const same = JSON.stringify(item);
      if (once && seen.has(same)) continue;
      seen.add(same);
      if (!isRow(item)) { out.push(item); continue; }
      const key = typeof item.key === "string" ? { key: `${answer.tenantId}:${item.key}` } : null; // unique across clients
      out.push({ ...item, ...key, tenantId: item.tenantId ?? answer.tenantId, tenantName: answer.tenantName });
    }
  }
  if (out.length && out.every(isRow)) {
    const compare = order(path, query, out[0] as Row);
    if (compare) (out as Row[]).sort(compare);
  } else if (out.every((item) => typeof item === "string")) (out as string[]).sort();
  return out;
}

function join(parts: { answer: Answer; value: unknown }[], key: string, path: string, query: Query): unknown {
  const found = parts.filter((p) => p.value !== null && p.value !== undefined);
  if (!found.length) return parts[0]?.value ?? null;
  if (found.every((p) => Array.isArray(p.value))) {
    const list = joinLists(found as { answer: Answer; value: unknown[] }[], path, query);
    // Short "next people" lists stay as short as one client's.
    if (PEOPLE_LISTS.includes(key)) return list.slice(0, Math.max(5, ...found.map((p) => (p.value as unknown[]).length)));
    return list;
  }
  if (found.every((p) => isRow(p.value))) {
    const keys = [...new Set(found.flatMap((p) => Object.keys(p.value as Row)))];
    return Object.fromEntries(keys.map((k) => [k, join(found.map((p) => ({ answer: p.answer, value: (p.value as Row)[k] })), k, path, query)]));
  }
  const first = found[0].value;
  // Counts and amounts add up; prices and settings are the same kind of thing for everyone, so one is shown.
  if (typeof first === "number" && !NOT_SUMMED.includes(key) && !/pricing|settings/.test(path)) return found.reduce((sum, p) => sum + Number(p.value || 0), 0);
  if (typeof first === "boolean") return found.some((p) => p.value === true);
  return first;
}

const inner = (body: unknown): Row | null => (isRow(body) ? (isRow(body.data) ? body.data : body) : null);
const totalOf = (body: Row) => (isRow(body.pagination) ? Number(body.pagination.totalRecords ?? body.pagination.total_records ?? NaN) : NaN);

/** The page asked for, cut from the joined list. `complete`: every client's rows are all here. */
function paginate(body: Row, query: Query, complete: boolean): Row {
  const pagination = body.pagination;
  if (!isRow(pagination) || !Array.isArray(body.items)) return body;
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? pagination.limit ?? 20);
  // With every row here, the total is what is listed (shared things counted once); otherwise the clients' totals added.
  const total = complete ? body.items.length : Number(pagination.totalRecords ?? pagination.total_records ?? body.items.length);
  const next = { ...pagination, page, limit } as Row;
  if ("totalRecords" in next) next.totalRecords = total;
  if ("total_records" in next) next.total_records = total;
  for (const k of ["totalPages", "total_pages"]) if (k in next) next[k] = Math.max(1, Math.ceil(total / limit));
  const out: Row = { ...body, items: body.items.slice((page - 1) * limit, page * limit), pagination: next };
  for (const k of ["nextCursor", "next_cursor"]) if (k in out) out[k] = page * limit < total ? String(page + 1) : null;
  return out;
}

export function combine(answers: Answer[], path: string, query: Query = {}): unknown {
  const joined = join(answers.map((answer) => ({ answer, value: answer.body })), "", path, query);
  if (!isRow(joined)) return joined;
  const complete = answers.every(({ body }) => {
    const one = inner(body);
    return !!one && Array.isArray(one.items) && one.items.length >= totalOf(one);
  });
  return isRow(joined.data) ? { ...joined, data: paginate(joined.data, query, complete) } : paginate(joined, query, complete);
}

/** Which pages to ask each client for, so the page wanted can be cut from the joined list. */
export function pagesNeeded(query: Query): { limit: number; pages: number } | null {
  if (query.page === undefined || query.limit === undefined) return null;
  const page = Number(query.page);
  const limit = Number(query.limit);
  const wanted = page * limit;
  const chunk = limit >= 100 ? limit : Math.min(100, wanted);
  return { limit: chunk, pages: Math.ceil(wanted / chunk) };
}
