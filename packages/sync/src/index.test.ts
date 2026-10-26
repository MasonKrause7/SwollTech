import { describe, expect, it } from "vitest";
import { OfflineError, flushSync, type OutboxItem, type SyncStore } from "./index";

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
});
