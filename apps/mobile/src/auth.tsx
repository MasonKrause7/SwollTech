import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, devLoginEnabled, onUnauthorized } from "./api";
import { clearNotebook, getMeta, openNotebook, setMeta } from "./db";
import { getDevToken, setDevToken, supabase } from "./supabase";
import { resetSyncState, syncNow } from "./sync";

type Status = "loading" | "signed-in" | "signed-out";

interface AuthValue {
  status: Status;
  userId: string | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<string | null>;
  devSignIn: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  configured: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

/** The notebook on the phone belongs to one account. A different account starts empty. */
async function claimNotebook(userId: string) {
  const db = await openNotebook();
  const owner = await getMeta(db, "owner");
  if (owner && owner !== userId) await clearNotebook();
  await setMeta(db, "owner", userId);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const enter = useCallback(async (id: string, address: string | null) => {
    await claimNotebook(id);
    setUserId(id);
    setEmail(address);
    setStatus("signed-in");
    void syncNow();
  }, []);

  const leave = useCallback(async () => {
    await setDevToken(null);
    await clearNotebook();
    resetSyncState();
    setUserId(null);
    setEmail(null);
    setStatus("signed-out");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) {
          await enter(data.session.user.id, data.session.user.email ?? null);
          return;
        }
      }
      if (devLoginEnabled) {
        const token = await getDevToken();
        const owner = await getMeta(await openNotebook(), "owner");
        if (token && owner && active) {
          await enter(owner, null);
          return;
        }
      }
      if (active) setStatus("signed-out");
    })();
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        void leave();
      } else if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        void enter(session.user.id, session.user.email ?? null);
      }
    });
    return () => {
      active = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, [enter, leave]);

  useEffect(() => {
    onUnauthorized(() => {
      // A 401 with a token means the session is gone (for example the account was deleted).
      if (supabase) void supabase.auth.signOut();
      else void leave();
    });
    return () => onUnauthorized(null);
  }, [leave]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      userId,
      email,
      configured: Boolean(supabase),
      async signIn(address, password) {
        if (!supabase) return "Sign in is not set up in this build.";
        const { error } = await supabase.auth.signInWithPassword({ email: address.trim(), password });
        return error ? error.message : null;
      },
      async signUp(address, password) {
        if (!supabase) return { error: "Sign up is not set up in this build.", needsConfirmation: false };
        const { data, error } = await supabase.auth.signUp({ email: address.trim(), password });
        if (error) return { error: error.message, needsConfirmation: false };
        return { error: null, needsConfirmation: !data.session };
      },
      async resetPassword(address) {
        if (!supabase) return "Password reset is not set up in this build.";
        const { error } = await supabase.auth.resetPasswordForEmail(address.trim());
        return error ? error.message : null;
      },
      async devSignIn(address) {
        if (!devLoginEnabled) return "Local sign in is off.";
        try {
          const result = await api().devToken(address.trim() || "lifter@example.com", "Lifter");
          await setDevToken(result.access_token);
          await enter(result.user_id, result.email);
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Could not reach the API";
        }
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut();
        await leave();
      },
    }),
    [status, userId, email, enter, leave],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
