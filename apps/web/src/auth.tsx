import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient, type ApiClient } from "@swolltech/api-client";

const DEV_TOKEN_KEY = "swolltech.dev-token";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createSupabase(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;
export const devLoginEnabled = import.meta.env.VITE_DEV_LOGIN === "true";
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
  signOut: () => Promise<void>;
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
  const [ready, setReady] = useState(!supabase);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setSignedIn(true);
        setEmail(data.session.user.email ?? null);
      }
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (session) {
        setSignedIn(true);
        setEmail(session.user.email ?? null);
      } else if (!devToken.current) {
        setSignedIn(false);
        setEmail(null);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    devToken.current = null;
    writeDevToken(null);
    if (supabase) await supabase.auth.signOut().catch(() => undefined);
    setSignedIn(false);
    setEmail(null);
    setRecovering(false);
    queryClient.clear();
  }, [queryClient]);

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const api = useMemo(
    () =>
      createClient({
        baseUrl: apiUrl,
        getToken: async () => {
          if (devToken.current) return devToken.current;
          if (!supabase) return null;
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token ?? null;
        },
        onUnauthorized: () => {
          void signOutRef.current();
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
        if (!supabase) return "Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
        const { error } = await supabase.auth.signInWithPassword({ email: address, password });
        return error ? error.message : null;
      },
      async signUp(address, password, displayName) {
        if (!supabase) return { error: "Sign-up is not configured.", needsConfirmation: false };
        const { data, error } = await supabase.auth.signUp({
          email: address,
          password,
          options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) return { error: error.message, needsConfirmation: false };
        return { error: null, needsConfirmation: !data.session };
      },
      async requestReset(address) {
        if (!supabase) return "Password reset is not configured.";
        const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/update-password` });
        return error ? error.message : null;
      },
      async updatePassword(password) {
        if (!supabase) return "Password reset is not configured.";
        const { error } = await supabase.auth.updateUser({ password });
        if (!error) setRecovering(false);
        return error ? error.message : null;
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
