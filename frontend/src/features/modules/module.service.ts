import { api } from "@/services/api-client";

type Params = Record<string, string | number | undefined>;

// Identical GETs made at the same moment share one request (React effects often fire twice).
const inflight = new Map<string, Promise<unknown>>();
// Lookups that rarely change (people, events, pricing) can be remembered briefly with `ttl` (ms).
const remembered = new Map<string, { at: number; data: unknown }>();

const keyOf = (endpoint: string, params: Params) => `${endpoint}?${JSON.stringify(Object.entries(params).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)))}`;

/** Forget remembered answers: after any change, and when someone signs out. */
export function clearRequestCache() { remembered.clear(); inflight.clear(); }

export async function getModuleRecords(endpoint: string, params: Params, options?: { ttl?: number }) {
  const key = keyOf(endpoint, params);
  if (options?.ttl) {
    const hit = remembered.get(key);
    if (hit && Date.now() - hit.at < options.ttl) return hit.data;
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = api.get(endpoint, { params }).then(({ data }) => data?.data ?? data).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  const data = await pending;
  if (options?.ttl) remembered.set(key, { at: Date.now(), data });
  return data;
}

export async function mutateModule(method: "post" | "patch" | "put" | "delete", endpoint: string, payload?: Record<string, unknown>, params?: Record<string, string>, headers?: Record<string, string>) {
  const { data } = await api.request({ method, url: endpoint, data: payload, params, headers });
  clearRequestCache(); // anything remembered may now be out of date
  return data?.data ?? data;
}
