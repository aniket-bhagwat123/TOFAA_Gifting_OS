/**
 * "All clients": TOFAA staff can look at every client at once. Screens then use the client id "all", and this adapter
 * turns each such request into real ones, so the server's own access rules apply to every client:
 *  - reading asks each client and combines the answers (combine.ts);
 *  - reading or changing one record goes to the client that record belongs to;
 *  - adding something new, when nothing in it says whose it is, asks which client it is for.
 */
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { combine, pagesNeeded, type Answer, type Query } from "./combine";

export const ALL_CLIENTS = "all";
export type ClientOption = { id: string; name: string };

const PATH = /^\/tenants\/all(?=\/|$)/;
const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const OWNED_KEYS = ["id", "recipientId", "eventId", "occasionId", "requestId", "groupId"];
const AT_ONCE = 6;
const REUSE_MS = 5000; // a run of saves (an import) asks once

let clients: ClientOption[] = [];
/** Record id -> the client it belongs to; null when several share it (a TOFAA festival). */
const owners = new Map<string, string | null>();
let chooser: (() => Promise<string | null>) | null = null;
let asking: Promise<string | null> | null = null;
let answered: { tenantId: string; at: number } | null = null;

export function setClients(list: ClientOption[]) { clients = list; }
/** The client a record seen under "All clients" belongs to, when known. */
export const ownerOf = (id?: string | null) => (id ? owners.get(id) ?? undefined : undefined);
export function setClientChooser(ask: (() => Promise<string | null>) | null) { chooser = ask; }

function remember(value: unknown, tenantId: string) {
  if (Array.isArray(value)) return value.forEach((item) => remember(item, tenantId));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") remember(item, tenantId);
    else if (OWNED_KEYS.includes(key)) owners.set(item, owners.has(item) && owners.get(item) !== tenantId ? null : tenantId);
  }
}

/** The clients named by the record ids found in a request (its address, filters or body). */
function ownersOf(...parts: unknown[]): string[] {
  const ids = JSON.stringify(parts.map((p) => (typeof p === "string" || (p && Object.getPrototypeOf(p) === Object.prototype) ? p : null))).match(UUID) ?? [];
  return [...new Set(ids.map((id) => owners.get(id)).filter((t): t is string => !!t))];
}

const parse = (data: unknown) => { if (typeof data !== "string") return data; try { return JSON.parse(data); } catch { return data; } };
const refuse = (config: InternalAxiosRequestConfig, message: string) =>
  new AxiosError(message, "ERR_ALL_CLIENTS", config, undefined, { data: { message }, status: 400, statusText: "Bad Request", headers: {}, config });

async function pooled<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { out[index] = { status: "fulfilled", value: await run(items[index]) }; }
      catch (reason) { out[index] = { status: "rejected", reason }; }
    }
  }));
  return out;
}

async function pickClient(): Promise<string | null> {
  if (answered && Date.now() - answered.at < REUSE_MS) { answered.at = Date.now(); return answered.tenantId; }
  if (!chooser) return null;
  asking ??= chooser().finally(() => { asking = null; });
  const tenantId = await asking;
  if (tenantId) answered = { tenantId, at: Date.now() };
  return tenantId;
}

export function allClientsAdapter(send: AxiosAdapter): AxiosAdapter {
  return async (config) => {
    const url = config.url ?? "";
    const query = (config.params ?? {}) as Query;
    const inPath = PATH.test(url);
    if (!inPath && query.tenantId !== ALL_CLIENTS) return send(config);

    const forClient = (tenantId: string, params: Query = query): InternalAxiosRequestConfig => ({
      ...config, url: url.replace(PATH, `/tenants/${tenantId}`), params: inPath ? params : { ...params, tenantId },
    });
    const named = ownersOf(url, query, parse(config.data));

    if ((config.method ?? "get").toLowerCase() !== "get") {
      if (named.length > 1) throw refuse(config, "These belong to different clients. Choose items of one client at a time.");
      const tenantId = named[0] ?? await pickClient();
      if (!tenantId) throw refuse(config, "Choose a client to continue.");
      const response = await send(forClient(tenantId));
      remember(parse(response.data), tenantId);
      return response;
    }

    const targets = named.length ? clients.filter((c) => named.includes(c.id)) : clients;
    if (!targets.length) throw refuse(config, "There are no clients to show yet.");
    const single = !!url.match(UUID) && !named.length; // one record whose client is not known yet: ask until found
    const results = await pooled(targets, async (client) => {
      const paging = single ? null : pagesNeeded(query);
      const bodies: unknown[] = [];
      let response: AxiosResponse | null = null;
      for (let page = 1; page <= (paging?.pages ?? 1); page++) {
        response = await send(forClient(client.id, paging ? { ...query, page, limit: paging.limit } : query));
        const body = parse(response.data) as { items?: unknown[]; data?: { items?: unknown[] } } | undefined;
        bodies.push(body);
        if (paging && ((body?.data?.items ?? body?.items)?.length ?? 0) < paging.limit) break; // nothing further
      }
      // Further pages only add rows: join them to the first, keeping its totals.
      const [first, ...rest] = bodies as { items?: unknown[]; data?: { items?: unknown[] } }[];
      for (const more of rest) {
        const into = first?.data?.items ?? first?.items;
        into?.push(...(more?.data?.items ?? more?.items ?? []));
      }
      remember(first, client.id);
      return { response: response!, answer: { tenantId: client.id, tenantName: client.name, body: first } satisfies Answer };
    });

    const found = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failures = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    // An expired sign-in must reach the usual renewal, not look like an empty list.
    const expired = failures.find((e) => axios.isAxiosError(e) && e.response?.status === 401);
    if (expired) throw expired;
    if (!found.length) throw failures[0];
    const data = single ? found[0].answer.body : combine(found.map((f) => f.answer), url.replace(PATH, ""), query);
    return { ...found[0].response, data, config };
  };
}
