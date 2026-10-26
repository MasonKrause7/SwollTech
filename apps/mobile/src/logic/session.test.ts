import { describe, expect, it } from "vitest";
import { BENCH, SQUAT, emptyData, ids } from "./fixtures";
import {
  assembleSession,
  blankSet,
  buildQuickSession,
  buildSessionFromWorkout,
  finishSession,
  isCounted,
  logSet,
  previousSets,
  referenceKg,
  roundLoadable,
  skipSet,
  validateSet,
  type LocalData,
} from "./session";
import type { SessionSetRow, WorkoutSetRow } from "./rows";

const NOW = new Date("2026-10-20T17:00:00Z");

function planned(id: string, parent: string, position: number, extra: Partial<WorkoutSetRow> = {}): WorkoutSetRow {
  return {
    id,
    workout_exercise_id: parent,
    position,
    kind: "working",
    target_reps: 5,
    target_weight: null,
    target_unit: null,
    target_percent: null,
    target_rpe: null,
    rest_seconds: 180,
    ...extra,
  };
}

function withWorkout(): LocalData {
  const data = emptyData();
  data.workouts.push({ id: "w1", name: "Push", notes: "", archived_at: null });
  data.workoutExercises.push(
    { id: "we-squat", workout_id: "w1", exercise_id: SQUAT, position: 1, notes: "belt" },
    { id: "we-bench", workout_id: "w1", exercise_id: BENCH, position: 0, notes: "" },
    { id: "we-gone", workout_id: "w1", exercise_id: BENCH, position: 2, notes: "", deleted_at: "2026-10-01T00:00:00Z" },
  );
  data.workoutSets.push(
    planned("ps2", "we-bench", 1, { target_weight: 100, target_unit: "kg" }),
    planned("ps1", "we-bench", 0, { kind: "warmup", target_weight: 60, target_unit: "kg", rest_seconds: 60 }),
    planned("ps3", "we-squat", 0, { target_percent: 80 }),
    planned("ps-gone", "we-squat", 1, { deleted_at: "2026-10-01T00:00:00Z" }),
  );
  return data;
}

function completedSet(id: string, parent: string, weight: number, reps: number, extra: Partial<SessionSetRow> = {}): SessionSetRow {
  return {
    ...blankSet(parent, 0, () => id),
    actual_weight: weight,
    actual_unit: "kg",
    actual_reps: reps,
    completed_at: "2026-10-01T12:00:00Z",
    ...extra,
  };
}

describe("buildSessionFromWorkout", () => {
  it("copies live exercises and sets in order with fresh ids", () => {
    const built = buildSessionFromWorkout(withWorkout(), "w1", "lb", ids("n"), NOW);
    expect(built.session).toMatchObject({ workout_id: "w1", name: "Push", status: "in_progress", started_at: NOW.toISOString(), ended_at: null });
    expect(built.exercises.map((row) => row.exercise_id)).toEqual([BENCH, SQUAT]);
    expect(built.exercises.map((row) => row.position)).toEqual([0, 1]);
    expect(built.exercises[1].notes).toBe("belt");
    expect(built.exercises.every((row) => row.session_id === built.session.id)).toBe(true);
    const bench = built.sets.filter((row) => row.session_exercise_id === built.exercises[0].id);
    expect(bench.map((row) => [row.kind, row.target_weight, row.target_unit, row.rest_seconds])).toEqual([
      ["warmup", 60, "kg", 60],
      ["working", 100, "kg", 180],
    ]);
    const all = [built.session.id, ...built.exercises.map((row) => row.id), ...built.sets.map((row) => row.id)];
    expect(new Set(all).size).toBe(all.length);
    expect(built.sets.every((row) => row.completed_at == null && row.actual_weight == null && !row.skipped)).toBe(true);
  });

  it("leaves percent targets open without a reference", () => {
    const built = buildSessionFromWorkout(withWorkout(), "w1", "lb", ids(), NOW);
    const squat = built.sets.find((row) => row.target_percent === 80)!;
    expect(squat.target_weight).toBeNull();
    expect(squat.target_unit).toBeNull();
  });

  it("resolves percent targets against the training max in the lifter's unit", () => {
    const data = withWorkout();
    data.references.push({ id: "r1", exercise_id: SQUAT, weight: 315, unit: "lb", noted_on: "2026-10-01" });
    const built = buildSessionFromWorkout(data, "w1", "lb", ids(), NOW);
    const squat = built.sets.find((row) => row.target_percent === 80)!;
    expect(squat.target_weight).toBe(252.5);
    expect(squat.target_unit).toBe("lb");
  });

  it("falls back to the best estimated max from completed sessions", () => {
    const data = withWorkout();
    data.sessions.push({ id: "old", workout_id: null, name: "Old", status: "completed", started_at: "2026-10-01T12:00:00Z", ended_at: null, notes: "" });
    data.sessionExercises.push({ id: "old-squat", session_id: "old", exercise_id: SQUAT, position: 0, notes: "" });
    data.sessionSets.push(completedSet("a", "old-squat", 150, 1), completedSet("b", "old-squat", 140, 3));
    expect(referenceKg(data, SQUAT)).toBe(154);
    const built = buildSessionFromWorkout(data, "w1", "kg", ids(), NOW);
    expect(built.sets.find((row) => row.target_percent === 80)!.target_weight).toBe(123);
  });

  it("refuses archived or missing workouts", () => {
    const data = withWorkout();
    expect(() => buildSessionFromWorkout(data, "nope", "lb", ids(), NOW)).toThrow("not on this phone");
    data.workouts[0].archived_at = "2026-10-01T00:00:00Z";
    expect(() => buildSessionFromWorkout(data, "w1", "lb", ids(), NOW)).toThrow("archived");
  });
});

describe("previous sets and assembly", () => {
  function history(): LocalData {
    const data = withWorkout();
    data.sessions.push(
      { id: "s1", workout_id: "w1", name: "Push", status: "completed", started_at: "2026-10-10T12:00:00Z", ended_at: null, notes: "" },
      { id: "s2", workout_id: "w1", name: "Push", status: "completed", started_at: "2026-10-15T12:00:00Z", ended_at: null, notes: "" },
      { id: "s3", workout_id: "w1", name: "Push", status: "in_progress", started_at: "2026-10-18T12:00:00Z", ended_at: null, notes: "" },
      { id: "s4", workout_id: "w1", name: "Push", status: "completed", started_at: "2026-10-25T12:00:00Z", ended_at: null, notes: "" },
    );
    data.sessionExercises.push(
      { id: "e1", session_id: "s1", exercise_id: BENCH, position: 0, notes: "" },
      { id: "e2", session_id: "s2", exercise_id: BENCH, position: 0, notes: "" },
      { id: "e3", session_id: "s3", exercise_id: BENCH, position: 0, notes: "" },
      { id: "e4", session_id: "s4", exercise_id: BENCH, position: 0, notes: "" },
    );
    data.sessionSets.push(
      completedSet("x1", "e1", 90, 5),
      completedSet("x2b", "e2", 97.5, 5, { position: 1 }),
      completedSet("x2a", "e2", 95, 5, { position: 0 }),
      completedSet("x3", "e3", 200, 5),
      completedSet("x4", "e4", 300, 5),
    );
    return data;
  }

  it("uses the latest completed session before the start time", () => {
    const result = previousSets(history(), [BENCH, SQUAT], "2026-10-20T12:00:00Z");
    expect(result.get(BENCH)!.map((row) => row.id)).toEqual(["x2a", "x2b"]);
    expect(result.has(SQUAT)).toBe(false);
  });

  it("assembles a session view with names, ordered sets and history", () => {
    const data = history();
    const built = buildSessionFromWorkout(data, "w1", "kg", ids("new"), NOW);
    data.sessions.push(built.session);
    data.sessionExercises.push(...built.exercises);
    data.sessionSets.push(...built.sets);
    const view = assembleSession(data, built.session.id)!;
    expect(view.exercises.map((row) => row.exercise_name)).toEqual(["Bench Press", "Back Squat"]);
    expect(view.exercises[0].muscle).toBe("chest");
    expect(view.exercises[0].previous_sets.map((row) => row.actual_weight)).toEqual([95, 97.5]);
    expect(view.exercises[1].previous_sets).toEqual([]);
    expect(assembleSession(data, "missing")).toBeNull();
  });
});

describe("logging", () => {
  it("logs a set with kilograms and keeps the first completion time", () => {
    const set = blankSet("e", 0, () => "s");
    const logged = logSet(set, { weight: 225, reps: 5, unit: "lb", rpe: 8 }, NOW);
    expect(logged).toMatchObject({ actual_weight: 225, actual_reps: 5, actual_unit: "lb", weight_kg: 102.058283, rpe: 8, completed_at: NOW.toISOString() });
    expect(isCounted(logged)).toBe(true);
    const edited = logSet(logged, { weight: 230, reps: 5, unit: "lb", rpe: null }, new Date("2026-10-20T18:00:00Z"));
    expect(edited.completed_at).toBe(NOW.toISOString());
    expect(edited.weight_kg).toBe(104.326245);
  });

  it("skipping clears completion and stops the set counting", () => {
    const skipped = skipSet(logSet(blankSet("e", 0, () => "s"), { weight: 100, reps: 5, unit: "kg", rpe: null }, NOW));
    expect(skipped.skipped).toBe(true);
    expect(skipped.completed_at).toBeNull();
    expect(isCounted(skipped)).toBe(false);
  });

  it("does not count warmups", () => {
    const warm = logSet(blankSet("e", 0, () => "s", { kind: "warmup" }), { weight: 60, reps: 5, unit: "kg", rpe: null }, NOW);
    expect(isCounted(warm)).toBe(false);
  });

  it("finishes a session once", () => {
    const session = buildQuickSession(() => "q", NOW);
    expect(session).toMatchObject({ name: "Workout", workout_id: null, status: "in_progress" });
    const done = finishSession(session, new Date("2026-10-20T18:00:00Z"));
    expect(done.status).toBe("completed");
    expect(finishSession(done, new Date("2026-10-21T00:00:00Z")).ended_at).toBe("2026-10-20T18:00:00.000Z");
  });

  it("validates the log inputs", () => {
    expect(validateSet(100, null)).toMatch(/reps/);
    expect(validateSet(100, 0)).toMatch(/reps/);
    expect(validateSet(100, 2.5)).toMatch(/reps/);
    expect(validateSet(null, 5)).toMatch(/weight/);
    expect(validateSet(5000, 5)).toMatch(/off/);
    expect(validateSet(0, 10)).toBeNull();
  });

  it("templates added sets", () => {
    const set = blankSet("e", 3, () => "n", { kind: "warmup", target_reps: 8, target_weight: 135, target_unit: "lb", rest_seconds: 90 });
    expect(set).toMatchObject({ position: 3, kind: "warmup", target_reps: 8, target_weight: 135, target_unit: "lb", rest_seconds: 90 });
    expect(blankSet("e", 0, () => "n", { target_unit: "lb" }).target_unit).toBeNull();
  });

  it("rounds to loadable weights", () => {
    expect(roundLoadable(251.9, "lb")).toBe(252.5);
    expect(roundLoadable(122.8, "kg")).toBe(123);
  });
});
