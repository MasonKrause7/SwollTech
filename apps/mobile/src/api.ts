import { createClient, type ApiClient } from "@swolltech/api-client";
import { getDevToken, neonAuth } from "./session";

// Dev sign-in never ships: a release build ignores the flag even if it was set.
export const devLoginEnabled = process.env.EXPO_PUBLIC_DEV_LOGIN === "true" && __DEV__;
/** Release builds must name their API and auth (eas.json). Checked at launch, shown on the sign-in screen. */
// Expo only inlines EXPO_PUBLIC_* values read as literal process.env.NAME expressions.
const releaseConfig = { EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL, EXPO_PUBLIC_NEON_AUTH_URL: process.env.EXPO_PUBLIC_NEON_AUTH_URL };
export const missingReleaseConfig: string[] = __DEV__ ? [] : Object.entries(releaseConfig).filter(([, value]) => !value).map(([key]) => key);
export const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

/** The current access token: a Neon Auth JWT, or the local dev token. */
export async function getToken(): Promise<string | null> {
  if (neonAuth) {
    const token = await neonAuth.getToken().catch(() => null);
    if (token) return token;
  }
  if (devLoginEnabled) return getDevToken();
  return null;
}

let unauthorized: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null) {
  unauthorized = handler;
}

let client: ApiClient | null = null;

export function api(): ApiClient {
  if (!client) {
    client = createClient({ baseUrl: apiUrl, getToken, onUnauthorized: () => unauthorized?.() });
  }
  return client;
}
