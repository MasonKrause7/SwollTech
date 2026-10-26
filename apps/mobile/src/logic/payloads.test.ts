import { describe, expect, it } from "vitest";
import { SYNC_FIELDS, toPayload } from "./payloads";
import { blankSet, buildSessionFromWorkout, logSet } from "./session";
import { emptyData, ids, BENCH } from "./fixtures";
import { newPlannedSet, newWorkout, newWorkoutExercise } from "./workouts";

// Copied from the pydantic models in apps/api/swolltech/services/syncing.py.
const SERVER = {
  SessionSetSync: ["id", "session_exercise_id", "position", "kind", "target_reps", "target_weight", "target_unit", "target_percent", "target_rpe", "rest_seconds", "actual_reps", "actual_weight", "actual_unit", "rpe", "notes", "skipped", "completed_at"],
  SessionSync: ["id", "workout_id", "name", "status", "started_at", "ended_at", "notes"],
  SessionExerciseSync: ["id", "session_id", "exercise_id", "position", "notes"],
  WorkoutSync: ["id", "name", "notes", "archived_at"],
  WorkoutExerciseSync: ["id", "workout_id", "exercise_id", "position", "notes"],
  WorkoutSetSync: ["id", "workout_exercise_id", "position", "kind", "target_reps", "target_weight", "target_unit", "target_percent", "target_rpe", "rest_seconds"],
  ProfileSync: ["display_name", "unit_preference"],
};

function subset(keys: string[], allowed: string[]) {
  return keys.filter((key) => !allowed.includes(key));
}

describe("sync payloads", () => {
  it("field lists match the server models", () => {
    expect(SYNC_FIELDS.session_sets).toEqual(SERVER.SessionSetSync);
    expect(SYNC_FIELDS.sessions).toEqual(SERVER.SessionSync);
    expect(SYNC_FIELDS.session_exercises).toEqual(SERVER.SessionExerciseSync);
    expect(SYNC_FIELDS.workouts).toEqual(SERVER.WorkoutSync);
    expect(SYNC_FIELDS.workout_exercises).toEqual(SERVER.WorkoutExerciseSync);
    expect(SYNC_FIELDS.workout_sets).toEqual(SERVER.WorkoutSetSync);
    expect(SYNC_FIELDS.profiles).toEqual(SERVER.ProfileSync);
  });

  it("a logged session set only sends fields the server accepts, and all of them", () => {
    const set = logSet(blankSet("e", 0, () => "11111111-1111-4111-8111-111111111111"), { weight: 100, reps: 5, unit: "kg", rpe: 8 }, new Date());
    const payload = toPayload("session_sets", { ...set, updated_at: "T", user_id: "u" });
    expect(subset(Object.keys(payload), SERVER.SessionSetSync)).toEqual([]);
    expect(Object.keys(payload).sort()).toEqual([...SERVER.SessionSetSync].sort());
    expect(payload).not.toHaveProperty("weight_kg");
  });

  it("built sessions and workouts produce valid payloads", () => {
    const data = emptyData();
    const workout = newWorkout("w", "  Pull  ");
    expect(workout.name).toBe("Pull");
    const item = newWorkoutExercise("we", "w", BENCH, []);
    const set = newPlannedSet("ps", "we", { kind: "working", reps: 5, weight: 100, percent: null, unit: "kg", restSeconds: 90 }, []);
    data.workouts.push(workout);
    data.workoutExercises.push(item);
    data.workoutSets.push(set);
    expect(subset(Object.keys(toPayload("workouts", workout)), SERVER.WorkoutSync)).toEqual([]);
    expect(Object.keys(toPayload("workout_sets", set)).sort()).toEqual([...SERVER.WorkoutSetSync].sort());
    const built = buildSessionFromWorkout(data, "w", "kg", ids(), new Date());
    expect(Object.keys(toPayload("sessions", built.session)).sort()).toEqual([...SERVER.SessionSync].sort());
    expect(Object.keys(toPayload("session_exercises", built.exercises[0])).sort()).toEqual([...SERVER.SessionExerciseSync].sort());
    expect(Object.keys(toPayload("session_sets", built.sets[0])).sort()).toEqual([...SERVER.SessionSetSync].sort());
  });

  it("turns undefined into null", () => {
    expect(toPayload("workouts", { id: "w", name: "A", notes: "", archived_at: undefined })).toEqual({ id: "w", name: "A", notes: "", archived_at: null });
  });
});
