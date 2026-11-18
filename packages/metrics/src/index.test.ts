import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { E1RM_MAX_REPS, epley, summarizeSets, toKilograms, type PerformedSet } from "./index";

const golden = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../fixtures/golden.json"), "utf8"),
);

describe("golden metrics", () => {
  it("caps the estimate at the same rep count as the server", () => {
    expect(E1RM_MAX_REPS).toBe(golden.e1rm_max_reps);
    expect(epley(100, 12)).toBe(140);
    expect(epley(60, 13)).toBeNull();
    // 30 reps at 60 kg must not "beat" 5 x 100 kg.
    expect(epley(60, 30)).toBeNull();
    expect(epley(100, 5)).toBe(116.666667);
  });

  it("still counts high-rep sets toward volume and falls back to the heaviest set", () => {
    const summary = summarizeSets(
      [
        { weightKg: 40, reps: 20, kind: "working" },
        { weightKg: 50, reps: 15, kind: "working" },
        { weightKg: 30, reps: 10, kind: "warmup" },
      ],
      100,
    );
    expect(summary.bestE1rmKg).toBeNull();
    expect(summary.volumeKg).toBe(1550);
    expect(summary.topSetWeightKg).toBe(50);
    expect(summary.topSetPercent).toBe(50);
  });

  it("matches the shared fixture", () => {
    for (const item of golden.cases) {
      const kg = toKilograms(item.weight, item.unit);
      expect(kg).toBe(item.kg);
      const estimate = item.kind === "working" ? epley(kg, item.reps) : null;
      expect(estimate).toBe(item.e1rm);
    }
    const sets: PerformedSet[] = golden.session.sets.map((item: { weight: number; unit: "lb" | "kg"; reps: number; kind: "warmup" | "working" }) => ({
      weightKg: toKilograms(item.weight, item.unit),
      reps: item.reps,
      kind: item.kind,
      completed: true,
    }));
    const summary = summarizeSets(sets, golden.session.reference_kg);
    expect(summary.bestE1rmKg).toBe(golden.session.best_e1rm_kg);
    expect(summary.volumeKg).toBe(golden.session.volume_kg);
    expect(summary.topSetWeightKg).toBe(golden.session.top_set_weight_kg);
    expect(summary.topSetPercent).toBe(golden.session.top_set_percent);
  });
});
