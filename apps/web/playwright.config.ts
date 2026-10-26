import { defineConfig, devices } from "@playwright/test";

const dbUrl = process.env.E2E_DATABASE_URL ?? "postgresql+asyncpg://postgres:postgres@localhost:54329/swolltech_e2e";
const apiPort = 8765;
const webPort = 5174;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@phone/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: [
    {
      command: `uv run python -m scripts.reset_local_db && uv run uvicorn swolltech.main:app --port ${apiPort}`,
      cwd: "../api",
      url: `http://localhost:${apiPort}/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: dbUrl,
        SUPABASE_JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234",
        SUPABASE_URL: "",
        SUPABASE_JWKS_URL: "",
        DEV_TOKEN_ENABLED: "true",
        CORS_ORIGINS: `http://localhost:${webPort}`,
        S3_BUCKET: "",
      },
    },
    {
      command: `npx vite --port ${webPort} --strictPort`,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_URL: `http://localhost:${apiPort}`,
        VITE_DEV_LOGIN: "true",
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_ANON_KEY: "",
      },
    },
  ],
});
