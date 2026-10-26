import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { loadAll, onNotebookChange, openNotebook, readRows, type Notebook } from "./db";
import type { ProfileRow, Unit } from "./logic/rows";
import type { LocalData } from "./logic/session";

interface NotebookValue {
  db: Notebook | null;
  data: LocalData | null;
  profile: ProfileRow | null;
  unit: Unit;
  reload: () => Promise<void>;
}

const NotebookContext = createContext<NotebookValue | null>(null);

/** Loads every local row and reloads when anything is written or synced. */
export function NotebookProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Notebook | null>(null);
  const [data, setData] = useState<LocalData | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const reload = useCallback(async () => {
    const database = await openNotebook();
    setDb(database);
    const [all, profiles] = await Promise.all([loadAll(database), readRows(database, "profiles")]);
    setData(all);
    setProfile(profiles[0] ?? null);
  }, []);

  useEffect(() => {
    void reload();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = onNotebookChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reload(), 30);
    });
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, [reload]);

  return (
    <NotebookContext.Provider value={{ db, data, profile, unit: profile?.unit_preference ?? "lb", reload }}>{children}</NotebookContext.Provider>
  );
}

export function useNotebook() {
  const value = useContext(NotebookContext);
  if (!value) throw new Error("NotebookProvider missing");
  return value;
}
