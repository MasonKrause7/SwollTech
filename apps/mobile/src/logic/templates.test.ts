/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ids } from "./fixtures";
import { ACCESSORY_REST, buildProgramRows, LIFT, MAIN_REST, PROGRAMS, uniqueWorkoutName } from "./templates";
import { newWorkout, validatePlannedSet } from "./workouts";

const migrations = join(__dirname, "../../../api/migrations");
const sql = ["0001_init.sql", "0002_catalog.sql"].map((file) => readFileSync(join(migrations, file), "utf8")).join("\n");
const catalog = [...sql.matchAll(/\('([0-9a-f-]{36})', null, '((?:[^']|'')+)'/g)].map((match) => ({ id: match[1], name: match[2], deleted_at: null }));
const oldCatalog = [...readFileSync(join(migrations, "0001_init.sql"), "utf8").matchAll(/\('([0-9a-f-]{36})', null, '/g)].map((match) => ({ id: match[1], deleted_at: null }));

describe("starter programs", () => {
  it("offers five programs that only use catalog lifts", () => {
    expect(PROGRAMS.map((program) => program.id)).toEqual(["upper-lower", "push-pull-legs", "full-body", "531-big-4", "beginner-3x5"]);
    const known = new Set(catalog.map((row) => row.id));
    for (const id of Object.values(LIFT)) expect(known.has(id), id).toBe(true);
    for (const program of PROGRAMS) {
      for (const workout of program.workouts) {
        for (const exercise of workout.exercises) {
          expect(known.has(exercise.exerciseId)).toBe(true);
          for (const alternate of exercise.alternates ?? []) expect(oldCatalog.some((row) => row.id === alternate)).toBe(true);
          for (const block of exercise.blocks) {
            expect([MAIN_REST, ACCESSORY_REST]).toContain(block.restSeconds);
            expect(block.reps).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("rests 120 s on the first lift of every day and never 0", () => {
    for (const program of PROGRAMS) {
      for (const workout of program.workouts) expect(workout.exercises[0].blocks[0].restSeconds).toBe(MAIN_REST);
    }
  });

  it("builds valid, linked rows for every program", () => {
    for (const program of PROGRAMS) {
      const rows = buildProgramRows(program, catalog, [], ids(program.id), "lb");
      expect(rows.skipped).toBe(0);
      expect(rows.workouts).toHaveLength(program.workouts.length);
      const workoutIds = new Set(rows.workouts.map((row) => row.id));
      const itemIds = new Set(rows.workoutExercises.map((row) => row.id));
      for (const item of rows.workoutExercises) expect(workoutIds.has(item.workout_id)).toBe(true);
      for (const set of rows.workoutSets) {
        expect(itemIds.has(set.workout_exercise_id)).toBe(true);
        expect(set.rest_seconds).toBeGreaterThan(0);
        expect(set.kind).toBe("working");
        expect(
          validatePlannedSet({ kind: set.kind, reps: set.target_reps, weight: set.target_weight, percent: set.target_percent, unit: "lb", restSeconds: set.rest_seconds }),
        ).toBeNull();
      }
      for (const workout of rows.workouts) {
        const items = rows.workoutExercises.filter((row) => row.workout_id === workout.id);
        expect(items.map((row) => row.position)).toEqual(items.map((_, index) => index));
        for (const item of items) {
          const sets = rows.workoutSets.filter((row) => row.workout_exercise_id === item.id);
          expect(sets.map((row) => row.position)).toEqual(sets.map((_, index) => index));
        }
      }
      const planned = program.workouts.reduce((total, workout) => total + workout.exercises.reduce((sum, item) => sum + item.blocks.reduce((n, block) => n + block.count, 0), 0), 0);
      expect(rows.workoutSets).toHaveLength(planned);
    }
  });

  it("uses percent targets for 5/3/1", () => {
    const rows = buildProgramRows(PROGRAMS[3], catalog, [], ids(), "kg");
    const squat = rows.workoutExercises[0];
    expect(rows.workoutSets.filter((row) => row.workout_exercise_id === squat.id).map((row) => [row.target_reps, row.target_percent])).toEqual([
      [5, 65],
      [5, 75],
      [5, 85],
    ]);
  });

  it("falls back to older lifts on a phone without the new catalog", () => {
    const rows = buildProgramRows(PROGRAMS[2], oldCatalog, [], ids(), "lb");
    const fullBodyB = rows.workouts[1];
    const lifts = rows.workoutExercises.filter((row) => row.workout_id === fullBodyB.id).map((row) => row.exercise_id);
    expect(lifts).toContain(LIFT.PULL_UP);
    expect(lifts).not.toContain(LIFT.CHIN_UP);
    // Hanging leg raise and cable crunch have no older equivalent, so they are left out.
    expect(rows.skipped).toBe(2);
  });

  it("never clashes with a routine you already have", () => {
    const existing = [newWorkout("w1", "Upper A"), newWorkout("w2", "Upper A (2)")];
    expect(uniqueWorkoutName("Upper A", existing)).toBe("Upper A (3)");
    expect(uniqueWorkoutName("Lower A", existing)).toBe("Lower A");
    const rows = buildProgramRows(PROGRAMS[0], catalog, existing, ids(), "lb");
    expect(rows.workouts.map((row) => row.name)).toEqual(["Upper A (3)", "Lower A", "Upper B", "Lower B"]);
    expect(rows.workouts[0].notes).toBe("From the Upper/Lower program.");
  });
});
