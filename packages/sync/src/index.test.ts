import { describe, expect, it } from "vitest";
import { OfflineError, PULL_LIMIT, flushSync, type FailedChange, type OutboxItem, type SyncStore } from "./index";

class MemoryStore implements SyncStore {
  items: OutboxItem[] = [];
  cursorValue = 0;
  rows = new Map<string, Record<string, unknown>>();

  async cursor() {
    return this.cursorValue;
  }
  async setCursor(cursor: number) {
    this.cursorValue = cursor;
  }
  async outbox() {
    return [...this.items];
  }
  dead: FailedChange[] = [];
  remapped: { entity: string; from: string; to: Record<string, unknown> }[] = [];
  async deadLetter(failed: FailedChange[]) {
    this.dead.push(...failed);
    await this.removeOutbox(failed.map((entry) => entry.item.clientMutationId));
  }
  async remap(entity: string, from: string, to: Record<string, unknown>) {
    this.remapped.push({ entity, from, to });
  }
  async removeOutbox(ids: string[]) {
    const drop = new Set(ids);
    this.items = this.items.filter((item) => !drop.has(item.clientMutationId));
  }
  async applyRemote(change: { entity: string; entityId: string; op: string; row: Record<string, unknown> | null }) {
    const key = `${change.entity}:${change.entityId}`;
    if (change.op === "delete" || !change.row) this.rows.delete(key);
    else this.rows.set(key, change.row);
  }
}

const session: OutboxItem = {
  clientMutationId: "m1",
  entity: "sessions",
  op: "upsert",
  entityId: "s1",
  baseUpdatedAt: null,
  payload: { id: "s1", name: "Garage", status: "completed" },
};

describe("flushSync", () => {
  it("keeps the outbox when the network is down, then replays it", async () => {
    const store = new MemoryStore();
    store.items = [session];
    let calls = 0;
    const first = await flushSync(store, async () => {
      calls += 1;
      throw new OfflineError();
    });
    expect(first.offline).toBe(true);
    expect(store.items).toHaveLength(1);
    expect(calls).toBe(1);

    const second = await flushSync(store, async (body) => {
      calls += 1;
      expect(body.mutations).toHaveLength(1);
      expect(body.mutations[0].payload.name).toBe("Garage");
      return {
        cursor: 4,
        applied: [{ client_mutation_id: "m1", status: "applied", server_row: { id: "s1", name: "Garage" } }],
        changes: [{ id: 4, entity: "sessions", entity_id: "s1", op: "upsert", row: { id: "s1", name: "Garage" } }],
      };
    });
    expect(second.offline).toBe(false);
    expect(store.items).toHaveLength(0);
    expect(store.cursorValue).toBe(4);
    expect(store.rows.get("sessions:s1")?.name).toBe("Garage");
  });

  it("keeps refused changes as dead letters instead of dropping them", async () => {
    const store = new MemoryStore();
    const bad: OutboxItem = { ...session, clientMutationId: "m2", entityId: "s2", payload: { id: "s2", notes: "x" } };
    store.items = [session, bad];
    const result = await flushSync(store, async () => ({
      cursor: 1,
      applied: [
        { client_mutation_id: "m1", status: "applied" },
        { client_mutation_id: "m2", status: "error", detail: "Invalid notes" },
      ],
      changes: [],
    }));
    expect(result.failed).toBe(1);
    expect(store.items).toHaveLength(0);
    expect(store.dead).toEqual([{ item: bad, detail: "Invalid notes" }]);
    expect(store.dead[0].item.payload.notes).toBe("x");
  });

  it("leaves unknown statuses queued for another try", async () => {
    const store = new MemoryStore();
    store.items = [session];
    await flushSync(store, async () => ({ cursor: 1, applied: [{ client_mutation_id: "m1", status: "something-new" }], changes: [] }));
    expect(store.items).toHaveLength(1);
  });

  it("repoints local rows when the server merges a new exercise into an existing one", async () => {
    const store = new MemoryStore();
    const exercise: OutboxItem = { clientMutationId: "e1", entity: "exercises", op: "upsert", entityId: "x-new", baseUpdatedAt: null, payload: { id: "x-new", name: "Cable Fly" } };
    store.items = [exercise];
    await flushSync(store, async () => ({
      cursor: 2,
      applied: [{ client_mutation_id: "e1", status: "merged", server_row: { id: "x-old", name: "Cable Fly" } }],
      changes: [],
    }));
    expect(store.items).toHaveLength(0);
    expect(store.remapped).toEqual([{ entity: "exercises", from: "x-new", to: { id: "x-old", name: "Cable Fly" } }]);
  });

  it("asks for a page of changes and reports when more are waiting", async () => {
    const store = new MemoryStore();
    let limit: number | undefined;
    const result = await flushSync(store, async (body) => {
      limit = body.limit;
      return { cursor: 9, applied: [], changes: [], has_more: true };
    });
    expect(limit).toBe(PULL_LIMIT);
    expect(result.hasMore).toBe(true);
    expect(store.cursorValue).toBe(9);
  });
});
