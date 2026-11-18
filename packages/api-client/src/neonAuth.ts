/**
 * A small client for Neon Auth (Managed Better Auth) over its REST API, shared by the
 * web and phone apps. Email and password only.
 *
 * Neon Auth keeps the login in an HttpOnly session cookie and hands out short-lived
 * (15 minute) EdDSA JWTs for APIs. The SwollTech API only ever sees those JWTs.
 *
 * - Web: requests go to this site's /api/auth proxy with credentials included, so the
 *   browser stores the cookie first-party.
 * - Phone: there is no browser cookie jar to rely on, so the app reads the session cookie
 *   from the sign-in response, keeps it in the device keychain (SecureStore) and sends it
 *   back in a Cookie header. Pass `sessionStore` for that mode.
 */

export const SESSION_COOKIE = "__Secure-neon-auth.session_token";
const REFRESH_MARGIN_MS = 60_000;

export interface SessionStore {
  get(): Promise<string | null>;
  set(value: string | null): Promise<void>;
}

export interface NeonAuthOptions {
  /** Phone mode: where the session cookie value is kept. Omit in browsers. */
  sessionStore?: SessionStore;
  /** Phone mode: an Origin Neon Auth trusts, sent on every call (browsers set their own). */
  origin?: string;
  fetch?: typeof fetch;
}

export interface NeonUser {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean;
}

export interface NeonSession {
  user: NeonUser;
}

interface CachedToken {
  jwt: string;
  expiresAt: number;
}

function jwtExpiry(jwt: string): number {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    const json = typeof atob === "function" ? atob(padded) : "";
    const exp = JSON.parse(json).exp;
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Pull the session cookie value out of a Set-Cookie header (several cookies may be joined). */
export function sessionCookieFrom(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;,\\s]*)`));
  if (!match) return null;
  return match[1] ? match[1] : null;
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message ?? (record.error as Record<string, unknown> | undefined)?.message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export class NeonAuth {
  private readonly base: string;
  private readonly store?: SessionStore;
  private readonly doFetch: typeof fetch;
  private readonly origin?: string;
  private token: CachedToken | null = null;
  private pending: Promise<string | null> | null = null;

  constructor(baseUrl: string, options: NeonAuthOptions = {}) {
    this.base = baseUrl.replace(/\/+$/, "");
    this.store = options.sessionStore;
    this.origin = options.origin;
    this.doFetch = options.fetch ?? ((...args) => fetch(...args));
  }

  private async call(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (this.origin) headers.Origin = this.origin;
    if (this.store) {
      const cookie = await this.store.get();
      if (cookie) headers.Cookie = `${SESSION_COOKIE}=${cookie}`;
    }
    const response = await this.doFetch(`${this.base}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Browsers keep the cookie themselves; on the phone we send it by hand.
      credentials: this.store ? "omit" : "include",
    });
    if (this.store) {
      const fresh = sessionCookieFrom(response.headers.get("set-cookie"));
      if (fresh) await this.store.set(fresh);
    }
    return response;
  }

  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async signUp(email: string, password: string, name: string): Promise<{ error: string | null; signedIn: boolean; email: string | null; userId?: string }> {
    const response = await this.call("/sign-up/email", { body: { email, password, name: name || email.split("@")[0] } });
    const body = (await this.json(response)) as { token?: string | null; user?: NeonUser } | null;
    if (!response.ok) return { error: messageFrom(body, "Could not create the account."), signedIn: false, email: null };
    this.token = null;
    // With email verification required, Neon Auth returns no session until the link is opened.
    return { error: null, signedIn: Boolean(body?.token), email: body?.user?.email ?? email, ...(body?.user?.id ? { userId: body.user.id } : {}) };
  }

  async signIn(email: string, password: string): Promise<{ error: string | null; email: string | null; userId?: string }> {
    const response = await this.call("/sign-in/email", { body: { email, password } });
    const body = (await this.json(response)) as { user?: NeonUser } | null;
    if (!response.ok) {
      if (response.status === 401 || response.status === 400) return { error: messageFrom(body, "Wrong email or password."), email: null };
      return { error: messageFrom(body, "Sign-in failed. Try again."), email: null };
    }
    this.token = null;
    return { error: null, email: body?.user?.email ?? email, ...(body?.user?.id ? { userId: body.user.id } : {}) };
  }

  /**
   * The signed-in user, or null when there is no session. Throws when Neon Auth itself is
   * failing (5xx), so a server outage is not mistaken for being signed out.
   */
  async getSession(): Promise<NeonSession | null> {
    const response = await this.call("/get-session");
    if (response.status >= 500) throw new Error(`Neon Auth is unavailable (${response.status})`);
    if (!response.ok) return null;
    const jwt = response.headers.get("set-auth-jwt");
    if (jwt) this.token = { jwt, expiresAt: jwtExpiry(jwt) };
    const body = (await this.json(response)) as NeonSession | null;
    return body && body.user ? body : null;
  }

  /**
   * A JWT for the SwollTech API, refreshed a minute before it expires. Null only when Neon
   * Auth says there is no session (401/403). Network failures and Neon Auth outages throw,
   * so callers can tell "offline" from "signed out".
   */
  async getToken(): Promise<string | null> {
    if (this.token && this.token.expiresAt - REFRESH_MARGIN_MS > Date.now()) return this.token.jwt;
    if (!this.pending) {
      this.pending = (async () => {
        const response = await this.call("/token");
        if (!response.ok) {
          this.token = null;
          if (response.status === 401 || response.status === 403) return null;
          throw new Error(`Neon Auth is unavailable (${response.status})`);
        }
        const body = (await this.json(response)) as { token?: string } | null;
        if (!body?.token) return null;
        this.token = { jwt: body.token, expiresAt: jwtExpiry(body.token) };
        return body.token;
      })().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<string | null> {
    const response = await this.call("/request-password-reset", { body: { email, redirectTo } });
    if (response.ok) return null;
    return messageFrom(await this.json(response), "Could not send the reset email.");
  }

  async resetPassword(token: string, newPassword: string): Promise<string | null> {
    const response = await this.call("/reset-password", { body: { token, newPassword } });
    if (response.ok) return null;
    return messageFrom(await this.json(response), "That reset link has expired. Request a new one.");
  }

  /**
   * Drop the cached JWT but keep the session, so the next getToken() fetches a fresh one.
   * Used when the API refuses a token this client still thought was valid (clock skew,
   * a key rotation), before deciding the session is really gone.
   */
  dropToken(): void {
    this.token = null;
  }

  /** Forget the local session without telling the server (used after the API says 401). */
  async forget(): Promise<void> {
    this.token = null;
    if (this.store) await this.store.set(null);
  }

  async signOut(): Promise<void> {
    try {
      await this.call("/sign-out", { body: {} });
    } finally {
      await this.forget();
    }
  }
}
