import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient, NeonAuth, type ApiClient } from "@swolltech/api-client";

const DEV_TOKEN_KEY = "swolltech.dev-token";

/**
 * Neon Auth (Better Auth) is reached through this site's own origin at /api/auth
 * (a Vercel rewrite in vercel.json, a Vite proxy in dev), so its session cookie is
 * first-party and survives Safari's third-party cookie blocking.
 */
const authBase = import.meta.env.VITE_AUTH_BASE || "/api/auth";
export const neonAuth: NeonAuth | null = import.meta.env.VITE_NEON_AUTH_URL || import.meta.env.VITE_AUTH_BASE ? new NeonAuth(authBase) : null;
// Dev sign-in never ships: a production bundle ignores the flag even if it was set.
export const devLoginEnabled = import.meta.env.VITE_DEV_LOGIN === "true" && !import.meta.env.PROD;
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

function resetTokenFromUrl(): string | null {
  if (typeof window === "undefined" || window.location.pathname !== "/update-password") return null;
  return new URLSearchParams(window.location.search).get("token");
}

export interface AuthValue {
  signedIn: boolean;
  ready: boolean;
  email: string | null;
  /** True after the user opens a password reset link. */
  recovering: boolean;
  api: ApiClient;
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  requestReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  devSignIn: (email: string) => Promise<void>;
  signOut: (scope?: "local" | "global") => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

function readDevToken() {
  try {
    return sessionStorage.getItem(DEV_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeDevToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(DEV_TOKEN_KEY, token);
    else sessionStorage.removeItem(DEV_TOKEN_KEY);
  } catch {
    // Storage can be blocked. The dev sign-in then lasts for this page only.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const devToken = useRef<string | null>(devLoginEnabled ? readDevToken() : null);
  const [signedIn, setSignedIn] = useState(Boolean(devToken.current));
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(!neonAuth || Boolean(devToken.current));
  const resetToken = useRef<string | null>(resetTokenFromUrl());
  const [recovering, setRecovering] = useState(Boolean(resetToken.current));

  useEffect(() => {
    if (!neonAuth || devToken.current) return;
    let active = true;
    neonAuth
      .getSession()
      .then((session) => {
        if (!active) return;
        if (session) {
          setSignedIn(true);
          setEmail(session.user.email ?? null);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const signingOut = useRef<Promise<void> | null>(null);
  const signOut = useCallback((scope: "local" | "global" = "global") => {
    // Several requests can fail with 401 at once. Sign out once, not once per request.
    if (signingOut.current) return signingOut.current;
    signingOut.current = (async () => {
      devToken.current = null;
      writeDevToken(null);
      // "local" (after a 401) only forgets this browser's token; "global" ends the session.
      if (neonAuth) await (scope === "global" ? neonAuth.signOut() : Promise.resolve(neonAuth.forget())).catch(() => undefined);
      setSignedIn(false);
      setEmail(null);
      setRecovering(false);
      queryClient.clear();
    })().finally(() => {
      signingOut.current = null;
    });
    return signingOut.current;
  }, [queryClient]);

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const api = useMemo(
    () =>
      createClient({
        baseUrl: apiUrl,
        getToken: async () => {
          if (devToken.current) return devToken.current;
          if (!neonAuth) return null;
          return neonAuth.getToken();
        },
        onUnauthorized: () => {
          // The API rejected the token: drop this browser's session only.
          void signOutRef.current("local");
        },
      }),
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({
      signedIn,
      ready,
      email,
      recovering,
      api,
      signOut,
      async signInWithPassword(address, password) {
        if (!neonAuth) return "Sign-in is not configured. Set VITE_NEON_AUTH_URL.";
        const result = await neonAuth.signIn(address, password);
        if (result.error) return result.error;
        setEmail(result.email);
        setSignedIn(true);
        return null;
      },
      async signUp(address, password, displayName) {
        if (!neonAuth) return { error: "Sign-up is not configured.", needsConfirmation: false };
        const result = await neonAuth.signUp(address, password, displayName);
        if (result.error) return { error: result.error, needsConfirmation: false };
        if (result.signedIn) {
          setEmail(result.email);
          setSignedIn(true);
        }
        return { error: null, needsConfirmation: !result.signedIn };
      },
      async requestReset(address) {
        if (!neonAuth) return "Password reset is not configured.";
        return neonAuth.requestPasswordReset(address, `${window.location.origin}/update-password`);
      },
      async updatePassword(password) {
        if (!neonAuth) return "Password reset is not configured.";
        if (!resetToken.current) return "This reset link is missing its code. Request a new one.";
        const failure = await neonAuth.resetPassword(resetToken.current, password);
        if (!failure) {
          resetToken.current = null;
          setRecovering(false);
        }
        return failure;
      },
      async devSignIn(address) {
        const result = await api.devToken(address, address.split("@")[0]);
        devToken.current = result.access_token;
        writeDevToken(result.access_token);
        setEmail(result.email);
        setSignedIn(true);
      },
    }),
    [signedIn, ready, email, recovering, api, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}

export function useApi() {
  return useAuth().api;
}
