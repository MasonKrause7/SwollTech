import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import { createChunkedStorage } from "./logic/chunkedStorage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const secureStorage = createChunkedStorage({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
});

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: secureStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

if (supabase) {
  // Refresh tokens only while the app is in the foreground.
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

const DEV_TOKEN_KEY = "swolltech.devtoken";

export async function getDevToken() {
  return SecureStore.getItemAsync(DEV_TOKEN_KEY);
}

export async function setDevToken(token: string | null) {
  if (token) await SecureStore.setItemAsync(DEV_TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(DEV_TOKEN_KEY);
}
