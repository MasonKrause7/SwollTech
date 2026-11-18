import { flushSync, isOfflineError } from "@swolltech/sync";
import * as Network from "expo-network";
import { useSyncExternalStore } from "react";
import { api } from "./api";
import {
  discardFailed as discardFailedRows,
  endFlight,
  failedCount,
  getMeta,
  notifyChange,
  onNotebookChange,
  openNotebook,
  pendingCount,
  retryFailed as retryFailedRows,
  storeCatalog,
  storeFor,
  SyncCancelled,
  unsavedCount,
} from "./db";
import { errorMessage, type SyncState } from "./logic/status";

let state: SyncState = { kind: "idle" };
let pending = 0;
let failed = 0;
let running: Promise<void> | null = null;
let again = false;
/** Bumped by stopSync(). A sync from an older generation writes nothing more. */
let generation = 0;
let stopped = false;
const listeners = new Set<() => void>();

function emitAll() {
  for (const listener of listeners) listener();
}

function emit(next: SyncState) {
  state = next;
  emitAll();
}

export async function refreshPending() {
  const db = await openNotebook();
  pending = await pendingCount(db);
  failed = await failedCount(db);
  emitAll();
}

// Every local save or delete changes what is waiting to sync. Screens save straight through
// db.ts, so follow the notebook instead of relying on each screen to refresh the count.
onNotebookChange(() => {
  void refreshPending().catch(() => undefined);
});

const CATALOG_MAX_AGE = 24 * 3600 * 1000;
/** The catalog version this build's starter programs expect (apps/api/migrations/0002_catalog.sql). An older stored copy is refetched on the next sync. */
export const MIN_CATALOG_VERSION = 2;
/** Rounds per sync: outbox batches of 200 plus pages of pulled changes. */
const MAX_ROUNDS = 50;

async function syncOnce() {
  const mine = generation;
  const alive = () => mine === generation;
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
    const storedVersion = Number((await getMeta(db, "catalog_version")) ?? "0");
    if (!hasCatalog || storedVersion < MIN_CATALOG_VERSION || Date.now() - fetchedAt > CATALOG_MAX_AGE) {
      const catalog = await client.catalog();
      if (!alive()) throw new SyncCancelled();
      await storeCatalog(db, catalog.exercises as unknown as Record<string, unknown>[], catalog.version);
      await db.runAsync("insert or replace into meta (key, value) values ('catalog_at', ?)", String(Date.now()));
    }
    let conflicts = 0;
    const store = storeFor(db, alive);
    // Big offline backlogs go up in batches of 200, and a long history comes down in pages.
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const result = await flushSync(store, (body) => client.sync(body));
      endFlight();
      if (result.offline) {
        await refreshPending();
        emit({ kind: "offline", pending });
        notifyChange();
        return;
      }
      conflicts += result.conflicts;
      if (!result.hasMore && (await pendingCount(db)) === 0) break;
    }
    if (!alive()) throw new SyncCancelled();
    await refreshPending();
    emit({ kind: "synced", at: Date.now(), conflicts });
  } catch (error) {
    endFlight();
    if (error instanceof SyncCancelled || !alive()) return;
    await refreshPending();
    if (isOfflineError(error)) emit({ kind: "offline", pending });
    else emit({ kind: "error", message: errorMessage(error), pending });
  }
  notifyChange();
}

/** Run a sync now. Calls while one is running queue exactly one more run. Does nothing while stopped. */
export function syncNow(): Promise<void> {
  if (stopped) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again && !stopped);
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Stop syncing (sign out, or the session was lost). A running sync is cancelled: it writes
 * nothing more, and this waits for it to finish (up to `waitMs`, since a request can hang).
 */
export async function stopSync(waitMs = 5000) {
  stopped = true;
  generation += 1;
  again = false;
  const current = running;
  if (current) {
    await Promise.race([current.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, waitMs))]);
  }
}

/** Allow syncing again after stopSync() (someone signed in). */
export function startSync() {
  stopped = false;
}

/** Try to sync, but give up waiting after `timeoutMs`. For flows that must not hang, like sign out. */
export async function syncBriefly(timeoutMs = 15000) {
  await Promise.race([syncNow().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/** Read straight from the notebook: how many changes are not in the account yet. */
export async function countUnsaved() {
  return unsavedCount(await openNotebook());
}

export async function retryFailed() {
  await retryFailedRows(await openNotebook());
  await syncNow();
}

export async function discardFailed() {
  await discardFailedRows(await openNotebook());
}

export function resetSyncState() {
  pending = 0;
  failed = 0;
  emit({ kind: "idle" });
}

/** The current sync state outside React. */
export function syncSnapshot() {
  return { state, pending, failed };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSyncState() {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  const count = useSyncExternalStore(subscribe, () => pending);
  const failedChanges = useSyncExternalStore(subscribe, () => failed);
  return { state: snapshot, pending: count, failed: failedChanges };
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
