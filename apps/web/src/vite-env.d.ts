/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Neon Auth URL. The browser reaches it through /api/auth on this site (see vercel.json). */
  readonly VITE_NEON_AUTH_URL?: string;
  /** Override where the browser calls Neon Auth. Defaults to /api/auth. */
  readonly VITE_AUTH_BASE?: string;
  readonly VITE_DEV_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
