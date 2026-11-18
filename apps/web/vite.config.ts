import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/** The Neon Auth URL that vercel.json proxies /api/auth/* to. */
function proxiedAuthUrl(): string | null {
  const config = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")) as { rewrites?: { source: string; destination: string }[] };
  const rule = config.rewrites?.find((item) => item.source.startsWith("/api/auth"));
  return rule ? rule.destination.replace(/\/:path\*$/, "") : null;
}

/** Production builds on Vercel must know where the API and auth live; never fall back to localhost. */
function requireProductionEnv() {
  return {
    name: "swolltech-require-production-env",
    config(_config: unknown, { command, mode }: { command: string; mode: string }) {
      if (command !== "build" || !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development") return;
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const missing = ["VITE_API_URL", "VITE_NEON_AUTH_URL"].filter((key) => !env[key]);
      if (missing.length) throw new Error(`Deployed build is missing ${missing.join(", ")}`);
      if (env.VITE_DEV_LOGIN === "true") throw new Error("VITE_DEV_LOGIN must not be on in a deployed build");
      if (/localhost|127\.0\.0\.1/.test(env.VITE_API_URL)) throw new Error("VITE_API_URL points at localhost in a deployed build");
      const proxied = proxiedAuthUrl();
      if (proxied && proxied.replace(/\/+$/, "") !== env.VITE_NEON_AUTH_URL.replace(/\/+$/, "")) {
        throw new Error("vercel.json's /api/auth rewrite does not point at VITE_NEON_AUTH_URL. Update the rewrite destination.");
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const authTarget = env.VITE_NEON_AUTH_URL;
  return {
    plugins: [react(), requireProductionEnv()],
    server: {
      port: 5173,
      // Same shape as production: the browser talks to Neon Auth on this origin.
      proxy: authTarget
        ? {
            "/api/auth": {
              target: new URL(authTarget).origin,
              changeOrigin: true,
              secure: true,
              rewrite: (path: string) => path.replace(/^\/api\/auth/, new URL(authTarget).pathname.replace(/\/+$/, "")),
            },
          }
        : undefined,
    },
  };
});
