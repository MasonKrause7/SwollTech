import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert } from "react-native";
import { api, devLoginEnabled, onSessionLost } from "./api";
import { clearNotebook, getMeta, openNotebook, setMeta, unsavedCount } from "./db";
import { planClaim } from "./logic/claim";
import { getDevToken, neonAuth, setDevToken, webUrl } from "./session";
import { refreshPending, resetSyncState, startSync, stopSync, syncNow } from "./sync";

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

function confirmErase(unsaved: number): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Another account's changes are on this phone",
      `${unsaved} change${unsaved === 1 ? " was" : "s were"} logged on this phone by the account that was signed in before and never saved to it. Signing in with this account erases them. To keep them, cancel and sign in with that account instead.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Erase and continue", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * The notebook on the phone belongs to one account. A different account starts empty, but
 * unsaved changes from the previous one are only erased after the user confirms.
 * Returns false if the user chose to keep them (the sign in is abandoned).
 */
async function claimNotebook(userId: string): Promise<boolean> {
  const db = await openNotebook();
  const owner = await getMeta(db, "owner");
  const hasData = ((await db.getFirstAsync<{ n: number }>("select (select count(*) from rows) + (select count(*) from outbox) as n"))?.n ?? 0) > 0;
  const action = planClaim({ owner, userId, unsaved: await unsavedCount(db), hasData });
  if (action === "confirm-clear" && !(await confirmErase(await unsavedCount(db)))) return false;
  if (action !== "keep") await clearNotebook();
  await setMeta(db, "owner", userId);
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const statusRef = useRef<Status>("loading");
  statusRef.current = status;

  /** Returns false when the user kept another account's unsaved changes instead of signing in. */
  const enter = useCallback(async (id: string, address: string | null): Promise<boolean> => {
    if (!(await claimNotebook(id))) {
      if (neonAuth) await neonAuth.signOut().catch(() => undefined);
      await setDevToken(null);
      return false;
    }
    startSync();
    setUserId(id);
    setEmail(address);
    setStatus("signed-in");
    void refreshPending();
    void syncNow();
    return true;
  }, []);

  /** Explicit sign out: stop any running sync first so it cannot write into the wiped notebook. */
  const leave = useCallback(async () => {
    await stopSync();
    await setDevToken(null);
    await clearNotebook();
    resetSyncState();
    setUserId(null);
    setEmail(null);
    setStatus("signed-out");
  }, []);

  /**
   * The session is gone (it expired, or the API keeps refusing fresh tokens). Ask the user
   * to sign in again, but keep the notebook: unsynced sets are still on the phone and go up
   * once the same account signs back in.
   */
  const expiring = useRef(false);
  const expire = useCallback(async () => {
    if (statusRef.current !== "signed-in" || expiring.current) return;
    expiring.current = true;
    try {
      await stopSync();
      if (neonAuth) await neonAuth.forget();
      await setDevToken(null);
      resetSyncState();
      setUserId(null);
      setEmail(null);
      setStatus("signed-out");
    } finally {
      expiring.current = false;
    }
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
          if (session && (await enter(session.user.id, session.user.email ?? null))) return;
        } catch {
          // Offline or Neon Auth is down: not the same as signed out.
          if (owner && active && (await enter(owner, null))) return;
        }
      }
      if (devLoginEnabled) {
        const token = await getDevToken();
        const owner = await getMeta(await openNotebook(), "owner");
        if (token && owner && active && (await enter(owner, null))) return;
      }
      if (active) setStatus("signed-out");
    })();
    return () => {
      active = false;
    };
  }, [enter]);

  useEffect(() => {
    // The client already retried with a fresh token, so this is a real loss of the session.
    onSessionLost(() => void expire());
    return () => onSessionLost(null);
  }, [expire]);

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
          if (!(await enter(id, result.email))) return "Signed out again so the other account's changes stay on this phone.";
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
          if (result.signedIn && result.userId && !(await enter(result.userId, result.email))) {
            return { error: "Signed out again so the other account's changes stay on this phone.", needsConfirmation: false };
          }
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
          if (!(await enter(result.user_id, result.email))) return "Signed out again so the other account's changes stay on this phone.";
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Could not reach the API";
        }
      },
      async signOut() {
        // Callers warn about unsaved changes first (Account). Stop syncing before the session goes.
        await stopSync();
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
