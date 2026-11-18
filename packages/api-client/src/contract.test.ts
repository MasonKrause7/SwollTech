import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ApiError, createClient } from "./index";

const spec = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../openapi.json"), "utf8")) as {
  paths: Record<string, Record<string, unknown>>;
};

function matchRoute(method: string, url: string) {
  const path = new URL(url).pathname;
  return Object.entries(spec.paths).find(([template, ops]) => {
    const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`);
    return pattern.test(path) && method.toLowerCase() in ops;
  });
}

describe("api client contract", () => {
  it("only calls routes the API actually serves", async () => {
    const calls: { method: string; url: string }[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url });
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createClient({ baseUrl: "http://api.test", getToken: () => "t", fetch: fakeFetch as unknown as typeof fetch });
    const skip = new Set(["request"]);
    for (const [name, fn] of Object.entries(client)) {
      if (skip.has(name)) continue;
      const args = Array.from({ length: Math.max(fn.length, 1) }, (_, index) => (index === 0 ? "id-1" : {}));
      await (fn as (...values: unknown[]) => Promise<unknown>)(...args);
    }
    expect(calls.length).toBeGreaterThan(30);
    const missing = calls.filter((call) => !matchRoute(call.method, call.url));
    expect(missing).toEqual([]);
  });

  it("sends the bearer token and reports 401s", async () => {
    const onUnauthorized = vi.fn();
    let seen = "";
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      seen = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(JSON.stringify({ detail: "Invalid token" }), { status: 401 });
    });
    const client = createClient({ baseUrl: "http://api.test/", getToken: async () => "abc", onUnauthorized, fetch: fakeFetch as unknown as typeof fetch });
    await expect(client.me()).rejects.toBeInstanceOf(ApiError);
    await expect(client.me()).rejects.toMatchObject({ status: 401, message: "Invalid token" });
    expect(seen).toBe("Bearer abc");
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it("builds query strings and skips empty values", async () => {
    const urls: string[] = [];
    const fakeFetch = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response("[]", { status: 200 });
    });
    const client = createClient({ baseUrl: "http://api.test", getToken: () => null, fetch: fakeFetch as unknown as typeof fetch });
    await client.exercises("bench & row");
    await client.exercises();
    await client.overview("America/Detroit");
    await client.sessions("in_progress");
    expect(urls).toEqual([
      "http://api.test/v1/exercises?q=bench+%26+row",
      "http://api.test/v1/exercises",
      "http://api.test/v1/stats/overview?tz=America%2FDetroit",
      "http://api.test/v1/sessions?status=in_progress",
    ]);
  });

  it("returns undefined for 204 responses", async () => {
    const fakeFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createClient({ baseUrl: "http://api.test", getToken: () => "t", fetch: fakeFetch as unknown as typeof fetch });
    await expect(client.deleteWorkout("w")).resolves.toBeUndefined();
  });

  it("retries a refused token once with a fresh one before reporting a 401", async () => {
    const onUnauthorized = vi.fn();
    const seen: string[] = [];
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const header = new Headers(init?.headers).get("Authorization") ?? "";
      seen.push(header);
      return header === "Bearer fresh"
        ? new Response(JSON.stringify({ id: "u1" }), { status: 200 })
        : new Response(JSON.stringify({ detail: "Invalid token" }), { status: 401 });
    });
    const client = createClient({
      baseUrl: "http://api.test",
      getToken: () => "stale",
      refreshToken: () => "fresh",
      onUnauthorized,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(client.me()).resolves.toEqual({ id: "u1" });
    expect(seen).toEqual(["Bearer stale", "Bearer fresh"]);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("reports a 401 only when the fresh token is refused too", async () => {
    const onUnauthorized = vi.fn();
    const fakeFetch = vi.fn(async () => new Response(JSON.stringify({ detail: "Account not found" }), { status: 401 }));
    const client = createClient({ baseUrl: "http://api.test", getToken: () => "a", refreshToken: () => "b", onUnauthorized, fetch: fakeFetch as unknown as typeof fetch });
    await expect(client.me()).rejects.toMatchObject({ status: 401 });
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("says so when no token can be had at all", async () => {
    const onNoToken = vi.fn();
    const onUnauthorized = vi.fn();
    const fakeFetch = vi.fn(async () => new Response(JSON.stringify({ detail: "Missing token" }), { status: 401 }));
    const client = createClient({ baseUrl: "http://api.test", getToken: () => null, onNoToken, onUnauthorized, fetch: fakeFetch as unknown as typeof fetch });
    await expect(client.me()).rejects.toMatchObject({ status: 401 });
    expect(onNoToken).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();

    // The session vanished between the request and the refresh.
    const later = vi.fn();
    const refreshed = createClient({ baseUrl: "http://api.test", getToken: () => "old", refreshToken: () => null, onNoToken: later, fetch: fakeFetch as unknown as typeof fetch });
    await expect(refreshed.me()).rejects.toMatchObject({ status: 401 });
    expect(later).toHaveBeenCalledTimes(1);
  });
});
