import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { persistReducer, persistStore } from "redux-persist";
import storage from "redux-persist/lib/storage";
import authReducer from "@/features/auth/auth.slice";
import modulesReducer from "@/features/modules/modules.slice";

const rootReducer = combineReducers({
  auth: authReducer,
  modules: modulesReducer
});
const persistedReducer = persistReducer({ key: "tofaa", storage, whitelist: ["auth", "modules"] }, rootReducer);

export const makeStore = () => {
  const store = configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
    devTools: process.env.NODE_ENV !== "production"
  });
  return Object.assign(store, { persistor: persistStore(store) });
};

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
