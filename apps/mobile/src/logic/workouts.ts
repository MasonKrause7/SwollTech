import { byPosition, type Unit, type WorkoutExerciseRow, type WorkoutRow, type WorkoutSetRow } from "./rows";

export function newWorkout(id: string, name: string): WorkoutRow {
  return { id, name: name.trim(), notes: "", archived_at: null };
}

export function validateWorkoutName(name: string, others: WorkoutRow[], selfId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the workout a name";
  if (trimmed.length > 80) return "Keep the name under 80 characters";
  const clash = others.find(
    (row) => row.id !== selfId && !row.deleted_at && !row.archived_at && row.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return clash ? "You already have a workout with that name" : null;
}

export function nextPosition(rows: { position: number }[]) {
  return rows.length ? Math.max(...rows.map((row) => row.position)) + 1 : 0;
}

export function newWorkoutExercise(id: string, workoutId: string, exerciseId: string, siblings: WorkoutExerciseRow[]): WorkoutExerciseRow {
  return { id, workout_id: workoutId, exercise_id: exerciseId, position: nextPosition(siblings), notes: "" };
}

export interface PlannedSetInput {
  kind: "warmup" | "working";
  reps: number | null;
  weight: number | null;
  percent: number | null;
  unit: Unit;
  restSeconds: number;
}

export function validatePlannedSet(input: PlannedSetInput): string | null {
  if (input.reps != null && (!Number.isInteger(input.reps) || input.reps < 1)) return "Reps must be a whole number of 1 or more";
  if (input.weight != null && input.percent != null) return "Use a weight or a percent, not both";
  if (input.percent != null && (input.percent < 1 || input.percent > 120)) return "Percent must be between 1 and 120";
  if (input.weight != null && input.weight < 0) return "Weight cannot be negative";
  if (!Number.isFinite(input.restSeconds) || input.restSeconds < 0) return "Rest must be 0 seconds or more";
  return null;
}

export function newPlannedSet(id: string, workoutExerciseId: string, input: PlannedSetInput, siblings: WorkoutSetRow[]): WorkoutSetRow {
  return {
    id,
    workout_exercise_id: workoutExerciseId,
    position: nextPosition(siblings),
    kind: input.kind,
    target_reps: input.reps,
    target_weight: input.weight,
    target_unit: input.weight != null ? input.unit : null,
    target_percent: input.percent,
    target_rpe: null,
    rest_seconds: Math.round(input.restSeconds),
  };
}

/** Move one row up or down. Returns only the rows whose position changed. */
export function moveRow<T extends { id: string; position: number }>(rows: T[], id: string, direction: -1 | 1): T[] {
  const ordered = byPosition(rows);
  const index = ordered.findIndex((row) => row.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return [];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered
    .map((row, position) => ({ row, position }))
    .filter(({ row, position }) => row.position !== position)
    .map(({ row, position }) => ({ ...row, position }));
}

export function describePlannedSet(set: WorkoutSetRow): string {
  const reps = set.target_reps != null ? `${set.target_reps} reps` : "Any reps";
  if (set.target_percent != null) return `${reps} at ${Number(set.target_percent)}%`;
  if (set.target_weight != null) return `${reps} at ${Number(set.target_weight)} ${set.target_unit ?? ""}`.trim();
  return reps;
}
