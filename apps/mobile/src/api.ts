import { createClient, type ApiClient } from "@swolltech/api-client";
import { getDevToken, neonAuth } from "./session";

// Dev sign-in never ships: a release build ignores the flag even if it was set.
export const devLoginEnabled = process.env.EXPO_PUBLIC_DEV_LOGIN === "true" && __DEV__;
/** Release builds must name their API and auth (eas.json). Checked at launch, shown on the sign-in screen. */
// Expo only inlines EXPO_PUBLIC_* values read as literal process.env.NAME expressions.
const releaseConfig = { EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL, EXPO_PUBLIC_NEON_AUTH_URL: process.env.EXPO_PUBLIC_NEON_AUTH_URL };
export const missingReleaseConfig: string[] = __DEV__ ? [] : Object.entries(releaseConfig).filter(([, value]) => !value).map(([key]) => key);
export const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

/**
 * The current access token: a Neon Auth JWT, or the local dev token. Null means there is
 * no session. Network failures and Neon Auth outages throw (and sync treats them as
 * offline or an error), so they are never mistaken for being signed out.
 */
export async function getToken(): Promise<string | null> {
  if (neonAuth) {
    const token = await neonAuth.getToken();
    if (token) return token;
  }
  if (devLoginEnabled) return getDevToken();
  return null;
}

/** After the API refused a token: drop the cached JWT and get a fresh one from the session. */
async function refreshToken(): Promise<string | null> {
  neonAuth?.dropToken();
  return getToken();
}

let sessionLost: (() => void) | null = null;

/**
 * Called when the session is really gone: a fresh token was refused too, or none can be had.
 * The app asks the user to sign in again. It must not wipe the notebook.
 */
export function onSessionLost(handler: (() => void) | null) {
  sessionLost = handler;
}

let client: ApiClient | null = null;

export function api(): ApiClient {
  if (!client) {
    client = createClient({
      baseUrl: apiUrl,
      getToken,
      refreshToken,
      onUnauthorized: () => sessionLost?.(),
      onNoToken: () => sessionLost?.(),
    });
  }
  return client;
}
