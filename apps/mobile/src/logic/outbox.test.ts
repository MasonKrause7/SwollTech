import { describe, expect, it } from "vitest";
import { planRemote, planWrite, type PendingItem } from "./outbox";
import { ids } from "./fixtures";

const pending: PendingItem = {
  clientMutationId: "m1",
  entity: "sessions",
  op: "upsert",
  entityId: "s1",
  baseUpdatedAt: null,
  payload: { id: "s1", status: "in_progress" },
};

describe("planWrite", () => {
  it("queues a new row with no base", () => {
    const action = planWrite({ entity: "sessions", entityId: "s1", op: "upsert", payload: { id: "s1" }, serverUpdatedAt: null, pending: null, inFlight: false, newMutationId: ids("m") });
    expect(action).toEqual({ kind: "insert", item: { clientMutationId: "m-1", entity: "sessions", op: "upsert", entityId: "s1", baseUpdatedAt: null, payload: { id: "s1" } } });
  });

  it("bases an edit of a synced row on the server timestamp", () => {
    const action = planWrite({ entity: "sessions", entityId: "s1", op: "upsert", payload: {}, serverUpdatedAt: "T1", pending: null, inFlight: false, newMutationId: ids() });
    expect(action.kind === "insert" && action.item.baseUpdatedAt).toBe("T1");
  });

  it("folds repeated edits into the pending change and keeps its base and place", () => {
    const action = planWrite({ entity: "sessions", entityId: "s1", op: "upsert", payload: { id: "s1", status: "completed" }, serverUpdatedAt: null, pending, inFlight: false, newMutationId: ids() });
    expect(action).toEqual({ kind: "update", item: { ...pending, payload: { id: "s1", status: "completed" } } });
  });

  it("starts a new change when the pending one is already being sent", () => {
    const action = planWrite({ entity: "sessions", entityId: "s1", op: "upsert", payload: { id: "s1" }, serverUpdatedAt: null, pending, inFlight: true, newMutationId: ids("n") });
    expect(action.kind).toBe("insert");
    expect(action.kind === "insert" && action.item.clientMutationId).toBe("n-1");
  });

  it("forgets a row the server never saw", () => {
    expect(planWrite({ entity: "sessions", entityId: "s1", op: "delete", payload: {}, serverUpdatedAt: null, pending, inFlight: false, newMutationId: ids() })).toEqual({ kind: "remove", clientMutationId: "m1" });
    expect(planWrite({ entity: "sessions", entityId: "s1", op: "delete", payload: {}, serverUpdatedAt: null, pending: null, inFlight: false, newMutationId: ids() })).toEqual({ kind: "none" });
  });

  it("turns a pending edit of a synced row into a delete", () => {
    const synced = { ...pending, baseUpdatedAt: "T1" };
    const action = planWrite({ entity: "sessions", entityId: "s1", op: "delete", payload: { id: "s1" }, serverUpdatedAt: "T1", pending: synced, inFlight: false, newMutationId: ids() });
    expect(action).toEqual({ kind: "update", item: { ...synced, op: "delete", payload: {} } });
  });
});

describe("planRemote", () => {
  it("applies server rows when nothing local is waiting", () => {
    expect(planRemote({ op: "upsert", row: {} }, null, new Set())).toEqual({ kind: "apply" });
  });

  it("lets the server win for changes that were part of this flush", () => {
    expect(planRemote({ op: "upsert", row: { updated_at: "T2" } }, pending, new Set(["m1"]))).toEqual({ kind: "apply" });
  });

  it("keeps edits made during the flush and rebases them", () => {
    expect(planRemote({ op: "upsert", row: { updated_at: "T2" } }, pending, new Set(["other"]))).toEqual({ kind: "rebase", clientMutationId: "m1", baseUpdatedAt: "T2" });
  });

  it("drops a local edit when the row was deleted elsewhere", () => {
    expect(planRemote({ op: "delete", row: null }, pending, new Set())).toEqual({ kind: "drop-local", clientMutationId: "m1" });
  });
});
