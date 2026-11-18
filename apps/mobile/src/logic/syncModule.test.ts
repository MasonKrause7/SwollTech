import { beforeEach, describe, expect, it, vi } from "vitest";

// sync.ts glues the shared sync engine to the phone's notebook. Its dependencies are faked
// so the parts that guard data can be checked: the pending count and cancellation.
const fake = vi.hoisted(() => {
  const notebookListeners: (() => void)[] = [];
  const written: string[] = [];
  return {
    notebookListeners,
    written,
    pending: 0,
    failed: 0,
    respond: null as null | ((value: unknown) => void),
    syncCalls: 0,
  };
});

vi.mock("expo-network", () => ({
  getNetworkStateAsync: async () => ({ isConnected: true }),
  addNetworkStateListener: () => ({ remove() {} }),
}));

vi.mock("../uploads", () => ({ drainUploads: async () => undefined }));

vi.mock("../api", () => ({
  api: () => ({
    catalog: async () => ({ version: 1, exercises: [] }),
    sync: () => {
      fake.syncCalls += 1;
      return new Promise((resolve) => {
        fake.respond = resolve;
      });
    },
  }),
}));

vi.mock("../db", () => {
  class SyncCancelled extends Error {}
  const db = {
    getFirstAsync: async () => ({ n: 1 }),
    runAsync: async () => undefined,
  };
  return {
    SyncCancelled,
    openNotebook: async () => db,
    onNotebookChange: (listener: () => void) => {
      fake.notebookListeners.push(listener);
      return () => undefined;
    },
    notifyChange: () => undefined,
    endFlight: () => undefined,
    getMeta: async () => String(Date.now()),
    storeCatalog: async () => undefined,
    pendingCount: async () => fake.pending,
    failedCount: async () => fake.failed,
    unsavedCount: async () => fake.pending + fake.failed,
    retryFailed: async () => undefined,
    discardFailed: async () => undefined,
    storeFor: (_db: unknown, alive: () => boolean) => {
      const guard = (what: string) => {
        if (!alive()) throw new SyncCancelled();
        fake.written.push(what);
      };
      return {
        cursor: async () => 0,
        setCursor: async () => guard("cursor"),
        outbox: async () => [],
        removeOutbox: async () => guard("removeOutbox"),
        deadLetter: async () => guard("deadLetter"),
        applyRemote: async () => guard("applyRemote"),
      };
    },
  };
});

const sync = await import("../sync");

async function settle() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

beforeEach(() => {
  fake.written.length = 0;
  fake.pending = 0;
  fake.failed = 0;
  fake.respond = null;
  fake.syncCalls = 0;
  sync.startSync();
});

describe("pending count", () => {
  it("follows every local save, not just sync runs", async () => {
    expect(fake.notebookListeners).toHaveLength(1);
    fake.pending = 3;
    fake.failed = 1;
    fake.notebookListeners[0]();
    await settle();
    expect(sync.syncSnapshot()).toMatchObject({ pending: 3, failed: 1 });
    expect(await sync.countUnsaved()).toBe(4);
  });
});

describe("stopSync", () => {
  it("cancels a running sync so it writes nothing into a notebook being wiped", async () => {
    const running = sync.syncNow();
    for (let i = 0; i < 50 && !fake.respond; i += 1) await settle();
    expect(fake.respond).not.toBeNull();
    await sync.stopSync(10);
    // The answer arrives after sign out started.
    fake.respond!({ cursor: 7, applied: [], changes: [{ id: 7, entity: "sessions", entity_id: "s1", op: "upsert", row: { id: "s1" } }] });
    await running;
    expect(fake.written).toEqual([]);
  });

  it("refuses new syncs until someone signs in", async () => {
    await sync.stopSync(10);
    await sync.syncNow();
    expect(fake.syncCalls).toBe(0);
    sync.startSync();
    const run = sync.syncNow();
    for (let i = 0; i < 50 && !fake.respond; i += 1) await settle();
    fake.respond!({ cursor: 1, applied: [], changes: [] });
    await run;
    expect(fake.syncCalls).toBe(1);
    expect(fake.written).toEqual(["removeOutbox", "cursor"]);
  });
});
