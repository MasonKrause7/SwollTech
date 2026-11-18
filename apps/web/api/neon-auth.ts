/**
 * Same-origin proxy to Neon Auth, so the browser keeps the session cookie first-party
 * (Safari blocks third-party cookies). vercel.json rewrites /api/auth/<path> here.
 *
 * A plain Vercel rewrite cannot be used: it adds X-Forwarded-Host, which Neon Auth
 * rejects ("Invalid hostname header"). This function forwards only the headers Neon
 * Auth needs (cookie, origin, content type) and passes every Set-Cookie back.
 */

const FORWARD_REQUEST_HEADERS = ["accept", "content-type", "cookie", "origin", "user-agent", "accept-language"];
const DROP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"]);

export const config = { runtime: "nodejs" };

function target(request: Request): URL | null {
  const base = process.env.NEON_AUTH_BASE_URL || process.env.VITE_NEON_AUTH_URL;
  if (!base) return null;
  const incoming = new URL(request.url);
  const path = (incoming.searchParams.get("__path") || "").replace(/^\/+/, "");
  // Only plain path segments; never let the caller pick another host.
  if (!/^[A-Za-z0-9._~\-/]*$/.test(path) || path.split("/").includes("..")) return null;
  const url = new URL(`${base.replace(/\/+$/, "")}/${path}`);
  incoming.searchParams.forEach((value, key) => {
    if (key !== "__path") url.searchParams.append(key, value);
  });
  return url;
}

async function proxy(request: Request): Promise<Response> {
  if (!process.env.NEON_AUTH_BASE_URL && !process.env.VITE_NEON_AUTH_URL) return Response.json({ message: "Auth is not configured" }, { status: 503 });
  const url = target(request);
  if (!url) return Response.json({ message: "Bad auth path" }, { status: 400 });
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor.split(",")[0].trim());
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(url, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  });
  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!DROP_RESPONSE_HEADERS.has(name.toLowerCase())) out.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);
  out.set("cache-control", "no-store");
  return new Response(upstream.status === 204 || upstream.status === 304 ? null : await upstream.arrayBuffer(), { status: upstream.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
