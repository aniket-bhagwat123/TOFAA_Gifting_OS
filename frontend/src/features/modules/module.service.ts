import { api } from "@/services/api-client";

export async function getModuleRecords(endpoint: string, params: Record<string, string | number | undefined>) {
  const { data } = await api.get(endpoint, { params });
  return data?.data ?? data;
}

export async function mutateModule(method: "post" | "patch" | "put" | "delete", endpoint: string, payload?: Record<string, unknown>, params?: Record<string, string>, headers?: Record<string, string>) {
  const { data } = await api.request({ method, url: endpoint, data: payload, params, headers });
  return data?.data ?? data;
}
