/** Local mirrors of the server rows the sync feed sends. Optional fields are server-owned. */
export type Unit = "lb" | "kg";
export type SetKind = "warmup" | "working";
export type SessionStatus = "in_progress" | "completed" | "abandoned";

export interface ServerStamp {
  updated_at?: string | null;
  deleted_at?: string | null;
  user_id?: string;
}

export interface ProfileRow extends ServerStamp {
  id: string;
  display_name: string;
  unit_preference: Unit;
}

export interface ExerciseRow extends ServerStamp {
  id: string;
  owner_id: string | null;
  name: string;
  primary_muscle: string;
  equipment: string;
}

export interface ReferenceRow extends ServerStamp {
  id: string;
  exercise_id: string;
  weight: number;
  unit: Unit;
  weight_kg?: number;
  noted_on: string;
}

export interface WorkoutRow extends ServerStamp {
  id: string;
  name: string;
  notes: string;
  archived_at: string | null;
}

export interface WorkoutExerciseRow extends ServerStamp {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  notes: string;
}

export interface WorkoutSetRow extends ServerStamp {
  id: string;
  workout_exercise_id: string;
  position: number;
  kind: SetKind;
  target_reps: number | null;
  target_weight: number | null;
  target_unit: Unit | null;
  target_percent: number | null;
  target_rpe: number | null;
  rest_seconds: number;
}

export interface SessionRow extends ServerStamp {
  id: string;
  workout_id: string | null;
  name: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  notes: string;
}

export interface SessionExerciseRow extends ServerStamp {
  id: string;
  session_id: string;
  exercise_id: string;
  position: number;
  notes: string;
}

export interface SessionSetRow extends ServerStamp {
  id: string;
  session_exercise_id: string;
  position: number;
  kind: SetKind;
  target_reps: number | null;
  target_weight: number | null;
  target_unit: Unit | null;
  target_percent: number | null;
  target_rpe: number | null;
  rest_seconds: number;
  actual_reps: number | null;
  actual_weight: number | null;
  actual_unit: Unit | null;
  weight_kg?: number | null;
  rpe: number | null;
  notes: string;
  skipped: boolean;
  completed_at: string | null;
}

export interface EntityRows {
  profiles: ProfileRow;
  exercises: ExerciseRow;
  exercise_references: ReferenceRow;
  workouts: WorkoutRow;
  workout_exercises: WorkoutExerciseRow;
  workout_sets: WorkoutSetRow;
  sessions: SessionRow;
  session_exercises: SessionExerciseRow;
  session_sets: SessionSetRow;
}

export type Entity = keyof EntityRows;

export function live<T extends ServerStamp>(rows: T[]): T[] {
  return rows.filter((row) => !row.deleted_at);
}

export function byPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position);
}
