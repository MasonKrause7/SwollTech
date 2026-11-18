import { describe, expect, it } from "vitest";
import { BENCH, SQUAT, emptyData, ids } from "./fixtures";
import type { SessionExerciseRow, SessionSetRow } from "./rows";
import {
  DEFAULT_REST_SECONDS,
  MAX_REPS,
  MAX_WEIGHT,
  applyRest,
  assembleSession,
  bestsBefore,
  blankSet,
  clampReps,
  clampWeight,
  cleanNote,
  convertWeight,
  insertWarmup,
  isBarbell,
  logSet,
  previousNote,
  recordFor,
  replaceExercise,
  restFromText,
  restLabel,
  startingWeight,
  validateSessionName,
  validateSet,
  type LocalData,
} from "./session";
import { moveRow, validatePlannedSet } from "./workouts";

const CURL = "curl-id";

function set(id: string, parent: string, position: number, extra: Partial<SessionSetRow> = {}): SessionSetRow {
  return { ...blankSet(parent, position, () => id), ...extra };
}

function logged(id: string, parent: string, position: number, weight: number, reps: number, extra: Partial<SessionSetRow> = {}): SessionSetRow {
  return set(id, parent, position, {
    actual_weight: weight,
    actual_unit: "kg",
    actual_reps: reps,
    weight_kg: weight,
    completed_at: "2026-10-01T12:00:00Z",
    ...extra,
  });
}

/** One completed bench session on Oct 1 and an open one on Oct 20. */
function withHistory(): LocalData {
  const data = emptyData();
  data.exercises.push({ id: CURL, owner_id: null, name: "Dumbbell Curl", primary_muscle: "biceps", equipment: "dumbbell" });
  data.sessions.push(
    { id: "old", workout_id: null, name: "Workout", status: "completed", started_at: "2026-10-01T12:00:00Z", ended_at: null, notes: "" },
    { id: "now", workout_id: null, name: "Workout", status: "in_progress", started_at: "2026-10-20T12:00:00Z", ended_at: null, notes: "" },
  );
  data.sessionExercises.push(
    { id: "old-bench", session_id: "old", exercise_id: BENCH, position: 0, notes: "" },
    { id: "now-bench", session_id: "now", exercise_id: BENCH, position: 0, notes: "" },
    { id: "now-curl", session_id: "now", exercise_id: CURL, position: 1, notes: "" },
  );
  data.sessionSets.push(
    logged("o1", "old-bench", 0, 100, 5, { notes: "grip wider" }),
    logged("o2", "old-bench", 1, 90, 8),
    set("n1", "now-bench", 0),
    set("n2", "now-bench", 1),
    set("c1", "now-curl", 0),
  );
  return data;
}

describe("unit conversion", () => {
  it("converts and rounds to a loadable weight", () => {
    expect(convertWeight(225, "lb", "kg")).toBe(102);
    expect(convertWeight(100, "kg", "lb")).toBe(220);
    expect(convertWeight(102.5, "kg", "lb")).toBe(225);
    expect(convertWeight(135, "lb", "lb")).toBe(135);
  });

  it("maps the empty bar to the other unit's bar on barbell lifts", () => {
    expect(convertWeight(45, "lb", "kg", true)).toBe(20);
    expect(convertWeight(20, "kg", "lb", true)).toBe(45);
    expect(convertWeight(45, "lb", "kg")).toBe(20.5);
  });
});

describe("input limits", () => {
  it("clamps weight to 0-2000 and says so", () => {
    expect(clampWeight(2500)).toEqual({ value: MAX_WEIGHT, message: expect.stringMatching(/2000/) });
    expect(clampWeight(315)).toEqual({ value: 315, message: null });
    expect(clampWeight(null)).toEqual({ value: null, message: null });
    expect(clampWeight(-5).value).toBe(0);
  });

  it("clamps reps to 0-1000", () => {
    expect(clampReps(5000)).toEqual({ value: MAX_REPS, message: expect.stringMatching(/1000/) });
    expect(clampReps(12).value).toBe(12);
  });

  it("refuses absurd sets at log time", () => {
    expect(validateSet(2001, 5)).toMatch(/2000/);
    expect(validateSet(100, 1001)).toMatch(/1000/);
    expect(validateSet(2000, 1000)).toBeNull();
  });

  it("refuses absurd planned sets", () => {
    const base = { kind: "working" as const, reps: 5, weight: null, percent: null, unit: "lb" as const, restSeconds: 120 };
    expect(validatePlannedSet({ ...base, weight: 2500 })).toMatch(/2000/);
    expect(validatePlannedSet({ ...base, reps: 1001 })).toMatch(/1000/);
  });
});

describe("barbell lifts", () => {
  it("knows barbell equipment", () => {
    expect(isBarbell("barbell")).toBe(true);
    expect(isBarbell(" Barbell ")).toBe(true);
    expect(isBarbell("dumbbell")).toBe(false);
    expect(isBarbell("")).toBe(false);
  });

  it("starts a never-done barbell lift at the empty bar", () => {
    expect(startingWeight(null, "barbell", "lb")).toBe(45);
    expect(startingWeight(null, "barbell", "kg")).toBe(20);
    expect(startingWeight(null, "dumbbell", "lb")).toBeNull();
    expect(startingWeight(135, "barbell", "lb")).toBe(135);
  });

  it("carries equipment and notes on the session view", () => {
    const data = withHistory();
    data.sessionExercises[1].notes = "pause first rep";
    const view = assembleSession(data, "now")!;
    expect(view.exercises.map((row) => row.equipment)).toEqual(["barbell", "dumbbell"]);
    expect(view.exercises[0].notes).toBe("pause first rep");
  });
});

describe("rest", () => {
  it("defaults a blank rest to two minutes and keeps an explicit Off", () => {
    expect(restFromText("")).toBe(DEFAULT_REST_SECONDS);
    expect(restFromText("  ")).toBe(120);
    expect(restFromText("0")).toBe(0);
    expect(restFromText("90")).toBe(90);
    expect(restFromText("abc")).toBeNull();
    expect(restFromText("-5")).toBeNull();
  });

  it("labels rest choices", () => {
    expect([0, 60, 90, 120, 180].map(restLabel)).toEqual(["Off", "1 min", "90s", "2 min", "3 min"]);
  });

  it("changes rest only on sets still to do", () => {
    const sets = [
      logged("a", "x", 0, 100, 5),
      set("b", "x", 1, { skipped: true }),
      set("c", "x", 2),
      set("d", "x", 3, { rest_seconds: 90 }),
    ];
    expect(applyRest(sets, 90).map((row) => [row.id, row.rest_seconds])).toEqual([["c", 90]]);
    expect(applyRest(sets, 0).map((row) => row.id)).toEqual(["c", "d"]);
  });
});

describe("managing exercises", () => {
  it("reorders session exercises", () => {
    const rows: SessionExerciseRow[] = [
      { id: "a", session_id: "s", exercise_id: BENCH, position: 0, notes: "" },
      { id: "b", session_id: "s", exercise_id: SQUAT, position: 1, notes: "keep" },
    ];
    expect(moveRow(rows, "b", -1)).toEqual([
      { ...rows[1], position: 0 },
      { ...rows[0], position: 1 },
    ]);
  });

  it("replaces the lift, keeps planned sets and clears what was logged", () => {
    const item: SessionExerciseRow = { id: "now-bench", session_id: "now", exercise_id: BENCH, position: 0, notes: "belt" };
    const sets = [
      logged("a", "now-bench", 0, 100, 5, { target_reps: 5, target_weight: 100, target_unit: "kg", rpe: 8, notes: "easy" }),
      set("b", "now-bench", 1, { target_reps: 3, target_percent: 80, target_weight: 120, target_unit: "kg" }),
    ];
    const data = withHistory();
    data.references.push({ id: "r", exercise_id: SQUAT, weight: 200, unit: "kg", noted_on: "2026-10-01" });
    const replaced = replaceExercise(data, item, sets, SQUAT, "kg");
    expect(replaced.exercise).toEqual({ ...item, exercise_id: SQUAT, notes: "" });
    expect(replaced.sets[0]).toMatchObject({
      id: "a",
      target_reps: 5,
      target_weight: 100,
      actual_weight: null,
      actual_reps: null,
      actual_unit: null,
      weight_kg: null,
      rpe: null,
      notes: "",
      completed_at: null,
      skipped: false,
    });
    // Percent targets are worked out against the new lift's max.
    expect(replaced.sets[1]).toMatchObject({ target_percent: 80, target_weight: 160, target_unit: "kg" });
    expect(replaceExercise(withHistory(), item, sets, CURL, "kg").sets[1]).toMatchObject({ target_weight: null, target_unit: null });
  });

  it("adds a warm-up before the first working set", () => {
    const sets = [set("w", "x", 0, { kind: "warmup" }), set("a", "x", 1), set("b", "x", 2)];
    const { added, rows } = insertWarmup(sets, "x", ids("new"));
    expect(added).toMatchObject({ id: "new-1", kind: "warmup", position: 1, session_exercise_id: "x" });
    expect(rows.map((row) => [row.id, row.position])).toEqual([
      ["new-1", 1],
      ["a", 2],
      ["b", 3],
    ]);
  });

  it("adds a warm-up to an exercise with no sets", () => {
    const { added, rows } = insertWarmup([], "x", ids("new"));
    expect(added.position).toBe(0);
    expect(rows).toHaveLength(1);
  });
});

describe("in-session records", () => {
  it("finds the best estimate from earlier completed sessions", () => {
    const data = withHistory();
    const bests = bestsBefore(data, [BENCH, CURL], "2026-10-20T12:00:00Z", "now");
    expect(bests.get(BENCH)).toBeCloseTo(116.666667, 5);
    expect(bests.has(CURL)).toBe(false);
    expect(assembleSession(data, "now")!.exercises[0].best_e1rm_kg).toBeCloseTo(116.666667, 5);
  });

  it("calls out a working set that beats the best", () => {
    const view = assembleSession(withHistory(), "now")!;
    const bench = view.exercises[0];
    expect(recordFor(bench, "n1", { weight: 105, reps: 5, unit: "kg", kind: "working" })).toBeCloseTo(122.5, 5);
    expect(recordFor(bench, "n1", { weight: 100, reps: 5, unit: "kg", kind: "working" })).toBeNull();
    expect(recordFor(bench, "n1", { weight: 120, reps: 5, unit: "kg", kind: "warmup" })).toBeNull();
    // Never done before: nothing to beat yet.
    expect(recordFor(view.exercises[1], "c1", { weight: 20, reps: 10, unit: "kg", kind: "working" })).toBeNull();
  });

  it("only calls out a set that also beats earlier sets today", () => {
    const data = withHistory();
    data.sessionSets = data.sessionSets.map((row) => (row.id === "n1" ? logged("n1", "now-bench", 0, 110, 5) : row));
    const bench = assembleSession(data, "now")!.exercises[0];
    expect(recordFor(bench, "n2", { weight: 105, reps: 5, unit: "kg", kind: "working" })).toBeNull();
    expect(recordFor(bench, "n2", { weight: 115, reps: 5, unit: "kg", kind: "working" })).not.toBeNull();
  });
});

describe("notes", () => {
  it("saves a trimmed note with the set", () => {
    const row = logSet(set("a", "x", 0), { weight: 100, reps: 5, unit: "kg", rpe: null, notes: "  felt fast  " }, new Date());
    expect(row.notes).toBe("felt fast");
    expect(logSet({ ...row }, { weight: 100, reps: 5, unit: "kg", rpe: null }, new Date()).notes).toBe("felt fast");
    expect(cleanNote("x".repeat(600))).toHaveLength(500);
  });

  it("shows last time's note for the matching set", () => {
    const view = assembleSession(withHistory(), "now")!;
    expect(previousNote(view.exercises[0], 0)).toBe("grip wider");
    expect(previousNote(view.exercises[0], 1)).toBeNull();
  });

  it("validates session names", () => {
    expect(validateSessionName("  ")).toMatch(/name/);
    expect(validateSessionName("x".repeat(81))).toMatch(/80/);
    expect(validateSessionName("Heavy lower")).toBeNull();
  });
});
