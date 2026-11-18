import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/** Production builds on Vercel must know where the API and auth live; never fall back to localhost. */
function requireProductionEnv() {
  return {
    name: "swolltech-require-production-env",
    config(_config: unknown, { command, mode }: { command: string; mode: string }) {
      if (command !== "build" || process.env.VERCEL_ENV !== "production") return;
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const missing = ["VITE_API_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter((key) => !env[key]);
      if (missing.length) throw new Error(`Production build is missing ${missing.join(", ")}`);
      if (env.VITE_DEV_LOGIN === "true") throw new Error("VITE_DEV_LOGIN must not be on in a production build");
      if (/localhost|127\.0\.0\.1/.test(env.VITE_API_URL)) throw new Error("VITE_API_URL points at localhost in a production build");
    },
  };
}

export default defineConfig({
  plugins: [react(), requireProductionEnv()],
  server: { port: 5173 },
});
