import { describe, expect, it, vi } from "vitest";
import { NeonAuth, sessionCookieFrom, type SessionStore } from "./neonAuth";

function jwt(expSeconds: number) {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "EdDSA" })}.${encode({ sub: "u1", exp: expSeconds })}.sig`;
}

function memoryStore(): SessionStore & { value: string | null } {
  return {
    value: null,
    async get() {
      return this.value;
    },
    async set(next) {
      this.value = next;
    },
  };
}

describe("NeonAuth", () => {
  it("reads the session cookie out of Set-Cookie", () => {
    expect(sessionCookieFrom("__Secure-neon-auth.session_token=abc.def%3D; Max-Age=604800; Path=/; HttpOnly")).toBe("abc.def%3D");
    expect(sessionCookieFrom("other=1")).toBeNull();
    expect(sessionCookieFrom(null)).toBeNull();
  });

  it("keeps the phone session in the store and sends it back as a cookie", async () => {
    const store = memoryStore();
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/sign-in/email")) {
        return new Response(JSON.stringify({ token: "raw", user: { id: "u1", email: "a@b.co" } }), {
          status: 200,
          headers: { "set-cookie": "__Secure-neon-auth.session_token=signed.value; Path=/; HttpOnly" },
        });
      }
      expect((init.headers as Record<string, string>).Cookie).toBe("__Secure-neon-auth.session_token=signed.value");
      expect((init.headers as Record<string, string>).Origin).toBe("https://swolltech.com");
      expect(init.credentials).toBe("omit");
      return new Response(JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) + 900) }), { status: 200 });
    });
    const auth = new NeonAuth("https://auth.example/neondb/auth/", { sessionStore: store, origin: "https://swolltech.com", fetch: fetchMock as unknown as typeof fetch });
    expect(await auth.signIn("a@b.co", "pw")).toEqual({ error: null, email: "a@b.co", userId: "u1" });
    expect(store.value).toBe("signed.value");
    const token = await auth.getToken();
    expect(token).toMatch(/\.sig$/);
    // Cached until shortly before expiry.
    expect(await auth.getToken()).toBe(token);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://auth.example/neondb/auth/token");
  });

  it("refreshes an almost-expired token and returns null when signed out", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) + 30) }), { status: 200 });
      return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    });
    const auth = new NeonAuth("/api/auth", { fetch: fetchMock as unknown as typeof fetch });
    expect(await auth.getToken()).not.toBeNull();
    expect(await auth.getToken()).toBeNull();
  });

  it("reports Neon Auth's error message", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" }), { status: 401 }));
    const auth = new NeonAuth("/api/auth", { fetch: fetchMock as unknown as typeof fetch });
    expect(await auth.signIn("a@b.co", "nope")).toEqual({ error: "Invalid email or password", email: null });
  });

  it("signs up without a session when email verification is required", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: null, user: { id: "u", email: "a@b.co" } }), { status: 200 }));
    const auth = new NeonAuth("/api/auth", { fetch: fetchMock as unknown as typeof fetch });
    expect(await auth.signUp("a@b.co", "longpassword", "A")).toEqual({ error: null, signedIn: false, email: "a@b.co", userId: "u" });
  });

  it("tells an outage from a lost session", async () => {
    let status = 503;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "down" }), { status }));
    const auth = new NeonAuth("/api/auth", { fetch: fetchMock as unknown as typeof fetch });
    await expect(auth.getToken()).rejects.toThrow(/unavailable/);
    await expect(auth.getSession()).rejects.toThrow(/unavailable/);
    status = 401;
    expect(await auth.getToken()).toBeNull();
    expect(await auth.getSession()).toBeNull();
  });

  it("drops a cached token but keeps the session", async () => {
    const store = memoryStore();
    store.value = "cookie";
    let issued = 0;
    const fetchMock = vi.fn(async () => {
      issued += 1;
      return new Response(JSON.stringify({ token: `${jwt(Math.floor(Date.now() / 1000) + 900)}${issued}` }), { status: 200 });
    });
    const auth = new NeonAuth("https://auth.example", { sessionStore: store, fetch: fetchMock as unknown as typeof fetch });
    const first = await auth.getToken();
    auth.dropToken();
    const second = await auth.getToken();
    expect(second).not.toBe(first);
    expect(store.value).toBe("cookie");
  });
});
