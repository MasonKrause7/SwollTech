import * as SecureStore from "expo-secure-store";
import { NeonAuth } from "@swolltech/api-client";

const SESSION_KEY = "swolltech.neon-session";
const DEV_TOKEN_KEY = "swolltech.devtoken";

const authUrl = process.env.EXPO_PUBLIC_NEON_AUTH_URL;
/** Neon Auth checks Origin on writes; the phone presents the web app's origin, which is trusted. */
export const webUrl = (process.env.EXPO_PUBLIC_WEB_URL || "https://swolltech.com").replace(/\/+$/, "");

/**
 * Neon Auth (email and password). The session cookie lives only in the keychain
 * (SecureStore, this device only); API calls use 15-minute JWTs fetched with it.
 */
export const neonAuth: NeonAuth | null = authUrl
  ? new NeonAuth(authUrl, {
      origin: webUrl,
      sessionStore: {
        get: () => SecureStore.getItemAsync(SESSION_KEY),
        set: async (value) => {
          if (value) await SecureStore.setItemAsync(SESSION_KEY, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
          else await SecureStore.deleteItemAsync(SESSION_KEY);
        },
      },
    })
  : null;

export async function getDevToken() {
  return SecureStore.getItemAsync(DEV_TOKEN_KEY);
}

export async function setDevToken(token: string | null) {
  if (token) await SecureStore.setItemAsync(DEV_TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(DEV_TOKEN_KEY);
}
