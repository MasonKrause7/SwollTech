/**
 * Payloads for POST /v1/sync. Each list matches the pydantic model of the same
 * name in apps/api/swolltech/services/syncing.py. Only these keys are sent.
 */
import type { Entity } from "./rows";

export const SYNC_FIELDS: Record<Entity, readonly string[]> = {
  profiles: ["display_name", "unit_preference"],
  exercises: ["id", "name", "primary_muscle", "equipment"],
  exercise_references: ["id", "exercise_id", "weight", "unit", "noted_on"],
  workouts: ["id", "name", "notes", "archived_at"],
  workout_exercises: ["id", "workout_id", "exercise_id", "position", "notes"],
  workout_sets: [
    "id",
    "workout_exercise_id",
    "position",
    "kind",
    "target_reps",
    "target_weight",
    "target_unit",
    "target_percent",
    "target_rpe",
    "rest_seconds",
  ],
  sessions: ["id", "workout_id", "name", "status", "started_at", "ended_at", "notes"],
  session_exercises: ["id", "session_id", "exercise_id", "position", "notes"],
  session_sets: [
    "id",
    "session_exercise_id",
    "position",
    "kind",
    "target_reps",
    "target_weight",
    "target_unit",
    "target_percent",
    "target_rpe",
    "rest_seconds",
    "actual_reps",
    "actual_weight",
    "actual_unit",
    "rpe",
    "notes",
    "skipped",
    "completed_at",
  ],
};

export function toPayload(entity: Entity, row: object): Record<string, unknown> {
  const source = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of SYNC_FIELDS[entity]) {
    if (key in source) payload[key] = source[key] === undefined ? null : source[key];
  }
  return payload;
}

/** Entities whose rows the server deletes along with a parent. */
export const CHILDREN: Partial<Record<Entity, { entity: Entity; key: string }[]>> = {
  workouts: [{ entity: "workout_exercises", key: "workout_id" }],
  workout_exercises: [{ entity: "workout_sets", key: "workout_exercise_id" }],
  sessions: [{ entity: "session_exercises", key: "session_id" }],
  session_exercises: [{ entity: "session_sets", key: "session_exercise_id" }],
};
