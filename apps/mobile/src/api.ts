import { createClient, type ApiClient } from "@swolltech/api-client";
import { getDevToken, supabase } from "./supabase";

export const devLoginEnabled = process.env.EXPO_PUBLIC_DEV_LOGIN === "true";
export const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

/** The current access token: the Supabase session, or the local dev token. */
export async function getToken(): Promise<string | null> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
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
