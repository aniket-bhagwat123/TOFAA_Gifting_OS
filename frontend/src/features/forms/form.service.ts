import { api } from "@/services/api-client";
export async function createRecord<TPayload, TResult>(endpoint: string, payload: TPayload) {
  const { data } = await api.post<TResult>(endpoint, payload);
  return data;
}
export async function updateRecord<TPayload, TResult>(endpoint: string, payload: TPayload) {
  const { data } = await api.patch<TResult>(endpoint, payload);
  return data;
}
