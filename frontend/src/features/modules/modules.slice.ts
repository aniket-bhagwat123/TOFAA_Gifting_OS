import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { getModuleRecords } from "./module.service";
import { getApiErrorMessage } from "@/services/api-client";

interface ModuleEntry { data: unknown; status: "idle" | "loading" | "succeeded" | "failed"; error: string | null; updatedAt: number | null }
interface ModulesState { byKey: Record<string, ModuleEntry>; selectedTenantId: string | null }
const initialState: ModulesState = { byKey: {}, selectedTenantId: null };

export const loadModule = createAsyncThunk("modules/load", async (args: { key: string; endpoint: string; params: Record<string, string | number | undefined> }, { rejectWithValue }) => {
  try {
    const data = await getModuleRecords(args.endpoint, args.params);
    return { key: args.key, data, updatedAt: Date.now() };
  } catch (error) { return rejectWithValue(getApiErrorMessage(error)); }
});

const slice = createSlice({
  name: "modules", initialState,
  reducers: {
    clearModuleData(state) { state.byKey = {}; state.selectedTenantId = null; },
    setSelectedTenant(state, action: { payload: string }) {
      if (state.selectedTenantId !== action.payload) {
        for (const key of Object.keys(state.byKey)) if (key !== "tenantOptions" && key !== "clients") delete state.byKey[key];
      }
      state.selectedTenantId = action.payload;
    }
  },
  extraReducers: (builder) => builder
    .addCase(loadModule.pending, (state, action) => { const key = action.meta.arg.key; state.byKey[key] = { ...state.byKey[key], data: state.byKey[key]?.data ?? null, status: "loading", error: null, updatedAt: state.byKey[key]?.updatedAt ?? null }; })
    .addCase(loadModule.fulfilled, (state, action) => {
      state.byKey[action.payload.key] = { data: action.payload.data, status: "succeeded", error: null, updatedAt: action.payload.updatedAt };
      if (action.payload.key === "tenantOptions" && !state.selectedTenantId) {
        const tenants = (action.payload.data as { items?: Array<{ id?: string }> })?.items;
        state.selectedTenantId = tenants?.[0]?.id ?? null;
      }
    })
    .addCase(loadModule.rejected, (state, action) => { const entry = state.byKey[action.meta.arg.key]; state.byKey[action.meta.arg.key] = { data: entry?.data ?? null, status: "failed", error: (action.payload as string) || action.error.message || "Unable to load data", updatedAt: entry?.updatedAt ?? null }; })
});

export const { clearModuleData, setSelectedTenant } = slice.actions;
export default slice.reducer;
