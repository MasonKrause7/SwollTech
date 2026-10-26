import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { epley, summarizeSets, toKilograms, type PerformedSet } from "./index";

const golden = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../fixtures/golden.json"), "utf8"),
);

describe("golden metrics", () => {
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
