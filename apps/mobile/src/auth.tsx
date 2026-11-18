import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, devLoginEnabled, onUnauthorized } from "./api";
import { clearNotebook, getMeta, openNotebook, setMeta } from "./db";
import { getDevToken, neonAuth, setDevToken, webUrl } from "./session";
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
      if (neonAuth) {
        // The stored session cookie is checked with Neon Auth; offline, the notebook's
        // owner is trusted so the app still opens at the gym with no signal.
        const owner = await getMeta(await openNotebook(), "owner");
        try {
          const session = await neonAuth.getSession();
          if (!active) return;
          if (session) {
            await enter(session.user.id, session.user.email ?? null);
            return;
          }
        } catch {
          if (owner && active) {
            await enter(owner, null);
            return;
          }
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
    return () => {
      active = false;
    };
  }, [enter]);

  useEffect(() => {
    onUnauthorized(() => {
      // A 401 with a token means the session is gone (for example the account was deleted).
      void (async () => {
        if (neonAuth) await neonAuth.forget();
        await leave();
      })();
    });
    return () => onUnauthorized(null);
  }, [leave]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      userId,
      email,
      configured: Boolean(neonAuth),
      async signIn(address, password) {
        if (!neonAuth) return "Sign in is not set up in this build.";
        try {
          const result = await neonAuth.signIn(address.trim(), password);
          if (result.error) return result.error;
          const session = result.userId ? null : await neonAuth.getSession();
          const id = result.userId ?? session?.user.id;
          if (!id) return "Signed in, but the session could not be stored. Try again.";
          await enter(id, result.email);
          return null;
        } catch {
          return "Could not reach SwollTech. Check your connection.";
        }
      },
      async signUp(address, password) {
        if (!neonAuth) return { error: "Sign up is not set up in this build.", needsConfirmation: false };
        try {
          const result = await neonAuth.signUp(address.trim(), password, "");
          if (result.error) return { error: result.error, needsConfirmation: false };
          if (result.signedIn && result.userId) await enter(result.userId, result.email);
          return { error: null, needsConfirmation: !result.signedIn };
        } catch {
          return { error: "Could not reach SwollTech. Check your connection.", needsConfirmation: false };
        }
      },
      async resetPassword(address) {
        if (!neonAuth) return "Password reset is not set up in this build.";
        try {
          // The link opens the web app, where the new password is chosen.
          return await neonAuth.requestPasswordReset(address.trim(), `${webUrl}/update-password`);
        } catch {
          return "Could not reach SwollTech. Check your connection.";
        }
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
        if (neonAuth) await neonAuth.signOut().catch(() => undefined);
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
