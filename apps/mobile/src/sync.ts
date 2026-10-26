import { flushSync, isOfflineError } from "@swolltech/sync";
import * as Network from "expo-network";
import { useSyncExternalStore } from "react";
import { api } from "./api";
import { endFlight, getMeta, notifyChange, openNotebook, pendingCount, storeCatalog, storeFor } from "./db";
import { errorMessage, type SyncState } from "./logic/status";
import { drainUploads } from "./uploads";

let state: SyncState = { kind: "idle" };
let pending = 0;
let running: Promise<void> | null = null;
let again = false;
const listeners = new Set<() => void>();

function emit(next: SyncState) {
  state = next;
  for (const listener of listeners) listener();
}

export async function refreshPending() {
  pending = await pendingCount(await openNotebook());
  for (const listener of listeners) listener();
}

const CATALOG_MAX_AGE = 24 * 3600 * 1000;

async function syncOnce() {
  const db = await openNotebook();
  const network = await Network.getNetworkStateAsync().catch(() => null);
  if (network && network.isConnected === false) {
    await refreshPending();
    emit({ kind: "offline", pending });
    return;
  }
  emit({ kind: "syncing" });
  const client = api();
  try {
    const fetchedAt = Number((await getMeta(db, "catalog_at")) ?? "0");
    const hasCatalog = (await db.getFirstAsync<{ n: number }>("select count(*) as n from rows where entity = 'exercises'"))?.n ?? 0;
    if (!hasCatalog || Date.now() - fetchedAt > CATALOG_MAX_AGE) {
      const catalog = await client.catalog();
      await storeCatalog(db, catalog.exercises as unknown as Record<string, unknown>[], catalog.version);
      await db.runAsync("insert or replace into meta (key, value) values ('catalog_at', ?)", String(Date.now()));
    }
    let conflicts = 0;
    // Big offline backlogs go up in batches of 200.
    for (let round = 0; round < 20; round += 1) {
      const result = await flushSync(storeFor(db), (body) => client.sync(body));
      endFlight();
      if (result.offline) {
        await refreshPending();
        emit({ kind: "offline", pending });
        notifyChange();
        return;
      }
      conflicts += result.conflicts;
      if ((await pendingCount(db)) === 0) break;
    }
    await drainUploads(db, client);
    await refreshPending();
    emit({ kind: "synced", at: Date.now(), conflicts });
  } catch (error) {
    endFlight();
    await refreshPending();
    if (isOfflineError(error)) emit({ kind: "offline", pending });
    else emit({ kind: "error", message: errorMessage(error), pending });
  }
  notifyChange();
}

/** Run a sync now. Calls while one is running queue exactly one more run. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

export function resetSyncState() {
  pending = 0;
  emit({ kind: "idle" });
}

export function useSyncState() {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
  const count = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
  );
  return { state: snapshot, pending: count };
}

/** Sync whenever the network comes back. Returns an unsubscribe function. */
export function watchNetwork() {
  let wasConnected: boolean | null = null;
  const subscription = Network.addNetworkStateListener((event) => {
    const connected = Boolean(event.isConnected);
    if (connected && wasConnected === false) void syncNow();
    wasConnected = connected;
  });
  return () => subscription.remove();
}
