import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { AuthSession, AuthUser } from "@/types/api";
import { authService, toAuthUser } from "./auth.service";
import { clearModuleData } from "@/features/modules/modules.slice";

interface AuthState {
  user: AuthUser | null;
  session: AuthSession | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
}
const initialState: AuthState = { user: null, session: null, status: "idle" };

export const loadCurrentUser = createAsyncThunk("auth/me", async () => authService.me());
export const loginUser = createAsyncThunk("auth/login", async (payload: { email: string; password: string }, { dispatch }) => {
  const result = await authService.login(payload);
  if (!result.session) throw new Error("The API did not return an authentication session.");
  dispatch(clearModuleData());
  return { user: toAuthUser(result.user), session: result.session };
});
export const logoutUser = createAsyncThunk("auth/logout", async (_, { dispatch }) => {
  try { await authService.logout(); } catch { /* local sign-out still completes when the API is unavailable */ }
  dispatch(clearModuleData());
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearAuth(state) {
      state.user = null;
      state.session = null;
      state.status = "unauthenticated";
    },
    setUser(state, action: { payload: AuthUser }) {
      state.user = action.payload;
    },
    setUserAvatar(state, action: { payload: string | null }) {
      if (state.user) state.user.avatarUrl = action.payload;
    }
  },
  extraReducers(builder) {
    builder
      .addCase(loadCurrentUser.pending, (state) => { state.status = "loading"; })
      .addCase(loadCurrentUser.fulfilled, (state, action) => { state.user = action.payload; state.status = "authenticated"; })
      .addCase(loadCurrentUser.rejected, (state) => { state.user = null; state.status = "unauthenticated"; })
      .addCase(loginUser.pending, (state) => { state.status = "loading"; })
      .addCase(loginUser.fulfilled, (state, action) => { state.user = action.payload.user; state.session = action.payload.session; state.status = "authenticated"; })
      .addCase(loginUser.rejected, (state) => { state.status = "unauthenticated"; })
      .addCase(logoutUser.fulfilled, (state) => { state.user = null; state.session = null; state.status = "unauthenticated"; });
  }
});
export const { clearAuth, setUser, setUserAvatar } = authSlice.actions;
export default authSlice.reducer;
