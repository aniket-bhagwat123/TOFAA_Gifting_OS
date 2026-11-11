"use client";

import { useCallback, useEffect, useState } from "react";
import { getModuleRecords } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import type { Overview } from "./types";

type Params = Record<string, string | number>;

/** Loads the occasions overview whenever the tenant or the filters change. Ignores answers to requests that are out of date. */
export function useOverview(tenantId: string | null | undefined, params: Params, enabled = true) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!tenantId || !enabled) return;
    let cancelled = false;
    setLoading(true);
    getModuleRecords(`/tenants/${tenantId}/occasions/overview`, JSON.parse(key) as Params, { ttl: version === 0 ? 15_000 : undefined })
      .then((result) => { if (!cancelled) { setData(result as Overview); setError(null); } })
      .catch((err) => { if (!cancelled) setError(getApiErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, key, enabled, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  return { data, error, loading, reload };
}
