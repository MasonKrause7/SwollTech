import { describe, expect, it } from "vitest";
import { createChunkedStorage, safeKey, type KeyValueStore } from "./chunkedStorage";
import { describeSync, errorMessage } from "./status";
import { describePlannedSet, moveRow, newPlannedSet, validatePlannedSet, validateWorkoutName } from "./workouts";

class Memory implements KeyValueStore {
  data = new Map<string, string>();
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    if (value.length > 2048) throw new Error("too big");
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error("bad key");
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
}

describe("chunked secure storage", () => {
  it("round trips values larger than the SecureStore limit", async () => {
    const memory = new Memory();
    const storage = createChunkedStorage(memory);
    const big = "x".repeat(5000) + "end";
    await storage.setItem("sb-abc-auth-token", big);
    expect(await storage.getItem("sb-abc-auth-token")).toBe(big);
    expect(memory.data.get("sb-abc-auth-token.count")).toBe("3");
  });

  it("shrinks cleanly and removes every part", async () => {
    const memory = new Memory();
    const storage = createChunkedStorage(memory);
    await storage.setItem("k", "y".repeat(4000));
    await storage.setItem("k", "small");
    expect(await storage.getItem("k")).toBe("small");
    expect([...memory.data.keys()].sort()).toEqual(["k.0", "k.count"]);
    await storage.removeItem("k");
    expect(memory.data.size).toBe(0);
    expect(await storage.getItem("k")).toBeNull();
  });

  it("returns null when a part is missing and stores empty strings", async () => {
    const memory = new Memory();
    const storage = createChunkedStorage(memory, 10);
    await storage.setItem("k", "0123456789abc");
    memory.data.delete("k.1");
    expect(await storage.getItem("k")).toBeNull();
    await storage.setItem("e", "");
    expect(await storage.getItem("e")).toBe("");
  });

  it("makes keys SecureStore accepts", () => {
    expect(safeKey("sb:abc/auth token")).toBe("sb_abc_auth_token");
  });
});

describe("sync status", () => {
  it("describes each state", () => {
    expect(describeSync({ kind: "synced", at: 1, conflicts: 0 }, 0)).toEqual({ label: "Synced", tone: "ok" });
    expect(describeSync({ kind: "synced", at: 1, conflicts: 0 }, 2).label).toBe("Saving on this phone (2)");
    expect(describeSync({ kind: "synced", at: 1, conflicts: 1 }, 0).label).toBe("Synced. 1 change replaced by a newer edit");
    expect(describeSync({ kind: "offline", pending: 3 }, 3)).toEqual({ label: "Saving on this phone (3)", tone: "wait" });
    expect(describeSync({ kind: "error", message: "server unavailable", pending: 0 }, 0)).toEqual({ label: "Sync failed: server unavailable", tone: "bad" });
    expect(describeSync({ kind: "syncing" }, 0).label).toBe("Syncing");
    expect(describeSync({ kind: "idle" }, 0).label).toBe("Not synced yet");
  });

  it("turns errors into short reasons", () => {
    expect(errorMessage({ status: 401 })).toBe("sign in again");
    expect(errorMessage({ status: 503 })).toBe("server unavailable");
    expect(errorMessage({ status: 429 })).toMatch(/too many/);
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage(null)).toBe("unknown error");
  });
});

describe("workout editing", () => {
  it("validates names against other live workouts", () => {
    const others = [
      { id: "a", name: "Push", notes: "", archived_at: null },
      { id: "b", name: "Old", notes: "", archived_at: "2026-01-01" },
    ];
    expect(validateWorkoutName(" ", others)).toMatch(/name/);
    expect(validateWorkoutName("push", others)).toMatch(/already/);
    expect(validateWorkoutName("push", others, "a")).toBeNull();
    expect(validateWorkoutName("Old", others)).toBeNull();
    expect(validateWorkoutName("x".repeat(81), others)).toMatch(/80/);
  });

  it("validates planned sets", () => {
    const base = { kind: "working" as const, reps: 5, weight: null, percent: null, unit: "lb" as const, restSeconds: 120 };
    expect(validatePlannedSet(base)).toBeNull();
    expect(validatePlannedSet({ ...base, reps: 0 })).toMatch(/Reps/);
    expect(validatePlannedSet({ ...base, weight: 100, percent: 80 })).toMatch(/not both/);
    expect(validatePlannedSet({ ...base, percent: 150 })).toMatch(/120/);
    expect(validatePlannedSet({ ...base, restSeconds: -1 })).toMatch(/Rest/);
  });

  it("describes planned sets", () => {
    const set = newPlannedSet("s", "we", { kind: "working", reps: 5, weight: 225, percent: null, unit: "lb", restSeconds: 90 }, []);
    expect(describePlannedSet(set)).toBe("5 reps at 225 lb");
    expect(describePlannedSet({ ...set, target_weight: null, target_percent: 75 })).toBe("5 reps at 75%");
    expect(describePlannedSet({ ...set, target_weight: null, target_reps: null })).toBe("Any reps");
    expect(newPlannedSet("t", "we", { kind: "working", reps: 5, weight: null, percent: null, unit: "lb", restSeconds: 90 }, [set]).position).toBe(1);
  });

  it("moves rows and reports only changed positions", () => {
    const rows = [
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ];
    expect(moveRow(rows, "c", -1)).toEqual([
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
    expect(moveRow(rows, "a", -1)).toEqual([]);
    expect(moveRow(rows, "zzz", 1)).toEqual([]);
  });
});
