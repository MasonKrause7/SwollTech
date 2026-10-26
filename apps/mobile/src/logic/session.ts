/**
 * Building and reading sessions from the rows stored on the phone. No React
 * Native imports so this runs under vitest.
 */
import { epley, fromKilograms, toKilograms, type GuideExercise } from "@swolltech/metrics";
import {
  byPosition,
  live,
  type ExerciseRow,
  type ReferenceRow,
  type SessionExerciseRow,
  type SessionRow,
  type SessionSetRow,
  type Unit,
  type WorkoutExerciseRow,
  type WorkoutRow,
  type WorkoutSetRow,
} from "./rows";

export interface LocalData {
  exercises: ExerciseRow[];
  references: ReferenceRow[];
  workouts: WorkoutRow[];
  workoutExercises: WorkoutExerciseRow[];
  workoutSets: WorkoutSetRow[];
  sessions: SessionRow[];
  sessionExercises: SessionExerciseRow[];
  sessionSets: SessionSetRow[];
}

export interface NewSession {
  session: SessionRow;
  exercises: SessionExerciseRow[];
  sets: SessionSetRow[];
}

export function setWeightKg(set: Pick<SessionSetRow, "weight_kg" | "actual_weight" | "actual_unit">): number | null {
  if (set.weight_kg != null) return Number(set.weight_kg);
  if (set.actual_weight == null) return null;
  return toKilograms(Number(set.actual_weight), set.actual_unit ?? "lb");
}

/** True for sets that count toward volume, estimates and records. */
export function isCounted(set: SessionSetRow): boolean {
  return (
    !set.deleted_at &&
    set.kind === "working" &&
    !set.skipped &&
    set.completed_at != null &&
    set.actual_reps != null &&
    set.actual_reps >= 1 &&
    setWeightKg(set) != null
  );
}

/**
 * The max a percent target resolves against: the training max you set, or else
 * your best estimated 1RM from completed sessions on this phone. Matches the
 * server's reference_max.
 */
export function referenceKg(data: LocalData, exerciseId: string): number | null {
  const reference = live(data.references).find((row) => row.exercise_id === exerciseId);
  if (reference) return reference.weight_kg != null ? Number(reference.weight_kg) : toKilograms(Number(reference.weight), reference.unit);
  const completed = new Set(live(data.sessions).filter((row) => row.status === "completed").map((row) => row.id));
  const mine = new Set(
    live(data.sessionExercises)
      .filter((row) => row.exercise_id === exerciseId && completed.has(row.session_id))
      .map((row) => row.id),
  );
  let best: number | null = null;
  for (const set of data.sessionSets) {
    if (!mine.has(set.session_exercise_id) || !isCounted(set)) continue;
    const estimate = epley(setWeightKg(set)!, set.actual_reps!);
    if (estimate != null && (best == null || estimate > best)) best = estimate;
  }
  return best;
}

/** Round to a weight you can load: nearest 2.5 lb or 0.5 kg. */
export function roundLoadable(weight: number, unit: Unit) {
  const step = unit === "lb" ? 2.5 : 0.5;
  return Math.round(weight / step) * step;
}

export function buildSessionFromWorkout(
  data: LocalData,
  workoutId: string,
  unit: Unit,
  newId: () => string,
  now: Date,
): NewSession {
  const workout = live(data.workouts).find((row) => row.id === workoutId);
  if (!workout) throw new Error("That workout is not on this phone");
  if (workout.archived_at) throw new Error("That workout is archived");
  const session: SessionRow = {
    id: newId(),
    workout_id: workout.id,
    name: workout.name,
    status: "in_progress",
    started_at: now.toISOString(),
    ended_at: null,
    notes: "",
  };
  const exercises: SessionExerciseRow[] = [];
  const sets: SessionSetRow[] = [];
  const planned = byPosition(live(data.workoutExercises).filter((row) => row.workout_id === workout.id));
  planned.forEach((item, index) => {
    const sessionExercise: SessionExerciseRow = {
      id: newId(),
      session_id: session.id,
      exercise_id: item.exercise_id,
      position: index,
      notes: item.notes ?? "",
    };
    exercises.push(sessionExercise);
    const reference = referenceKg(data, item.exercise_id);
    const plannedSets = byPosition(live(data.workoutSets).filter((row) => row.workout_exercise_id === item.id));
    plannedSets.forEach((target, setIndex) => {
      let targetWeight = target.target_weight != null ? Number(target.target_weight) : null;
      let targetUnit = target.target_unit;
      const percent = target.target_percent != null ? Number(target.target_percent) : null;
      if (percent != null) {
        if (reference != null) {
          targetWeight = roundLoadable(fromKilograms((reference * percent) / 100, unit), unit);
          targetUnit = unit;
        } else {
          targetWeight = null;
          targetUnit = null;
        }
      }
      sets.push({
        id: newId(),
        session_exercise_id: sessionExercise.id,
        position: setIndex,
        kind: target.kind,
        target_reps: target.target_reps,
        target_weight: targetWeight,
        target_unit: targetWeight != null ? targetUnit ?? unit : null,
        target_percent: percent,
        target_rpe: target.target_rpe,
        rest_seconds: target.rest_seconds ?? 120,
        actual_reps: null,
        actual_weight: null,
        actual_unit: null,
        rpe: null,
        notes: "",
        skipped: false,
        completed_at: null,
      });
    });
  });
  return { session, exercises, sets };
}

export function buildQuickSession(newId: () => string, now: Date, name = "Workout"): SessionRow {
  return {
    id: newId(),
    workout_id: null,
    name,
    status: "in_progress",
    started_at: now.toISOString(),
    ended_at: null,
    notes: "",
  };
}

export function blankSet(sessionExerciseId: string, position: number, newId: () => string, template?: Partial<SessionSetRow>): SessionSetRow {
  return {
    id: newId(),
    session_exercise_id: sessionExerciseId,
    position,
    kind: template?.kind ?? "working",
    target_reps: template?.target_reps ?? null,
    target_weight: template?.target_weight ?? null,
    target_unit: template?.target_weight != null ? template?.target_unit ?? null : null,
    target_percent: null,
    target_rpe: null,
    rest_seconds: template?.rest_seconds ?? 120,
    actual_reps: null,
    actual_weight: null,
    actual_unit: null,
    rpe: null,
    notes: "",
    skipped: false,
    completed_at: null,
  };
}

/** Sets from the most recent completed session before `before`, per exercise. */
export function previousSets(data: LocalData, exerciseIds: string[], before: string, excludeSessionId?: string) {
  const cutoff = Date.parse(before);
  const sessions = new Map(
    live(data.sessions)
      .filter((row) => row.status === "completed" && row.id !== excludeSessionId && Date.parse(row.started_at) < cutoff)
      .map((row) => [row.id, row]),
  );
  const result = new Map<string, SessionSetRow[]>();
  for (const exerciseId of exerciseIds) {
    let latest: { item: SessionExerciseRow; started: number } | null = null;
    for (const item of live(data.sessionExercises)) {
      if (item.exercise_id !== exerciseId) continue;
      const session = sessions.get(item.session_id);
      if (!session) continue;
      const started = Date.parse(session.started_at);
      if (!latest || started > latest.started) latest = { item, started };
    }
    if (latest) {
      const chosen = latest.item.id;
      result.set(exerciseId, byPosition(live(data.sessionSets).filter((row) => row.session_exercise_id === chosen)));
    }
  }
  return result;
}

export interface SessionExerciseView extends GuideExercise<SessionSetRow> {
  id: string;
  exercise_id: string;
  exercise_name: string;
  muscle: string;
  position: number;
  sets: SessionSetRow[];
  previous_sets: SessionSetRow[];
}

export interface SessionView {
  session: SessionRow;
  exercises: SessionExerciseView[];
}

export function exerciseName(data: Pick<LocalData, "exercises">, exerciseId: string) {
  return data.exercises.find((row) => row.id === exerciseId)?.name ?? "Exercise";
}

export function assembleSession(data: LocalData, sessionId: string): SessionView | null {
  const session = live(data.sessions).find((row) => row.id === sessionId);
  if (!session) return null;
  const items = byPosition(live(data.sessionExercises).filter((row) => row.session_id === session.id));
  const history = previousSets(
    data,
    items.map((row) => row.exercise_id),
    session.started_at,
    session.id,
  );
  return {
    session,
    exercises: items.map((item) => {
      const exercise = data.exercises.find((row) => row.id === item.exercise_id);
      return {
        id: item.id,
        exercise_id: item.exercise_id,
        exercise_name: exercise?.name ?? "Exercise",
        muscle: exercise?.primary_muscle ?? "",
        position: item.position,
        sets: byPosition(live(data.sessionSets).filter((row) => row.session_exercise_id === item.id)),
        previous_sets: history.get(item.exercise_id) ?? [],
      };
    }),
  };
}

/** The set row after logging it from the guided screen. */
export function logSet(
  set: SessionSetRow,
  values: { weight: number; reps: number; unit: Unit; rpe: number | null },
  now: Date,
): SessionSetRow {
  return {
    ...set,
    actual_weight: values.weight,
    actual_reps: values.reps,
    actual_unit: values.unit,
    weight_kg: toKilograms(values.weight, values.unit),
    rpe: values.rpe,
    skipped: false,
    completed_at: set.completed_at ?? now.toISOString(),
  };
}

export function skipSet(set: SessionSetRow): SessionSetRow {
  return { ...set, skipped: true, completed_at: null };
}

export function finishSession(session: SessionRow, now: Date): SessionRow {
  return { ...session, status: "completed", ended_at: session.ended_at ?? now.toISOString() };
}

/** Validation for the log button. Returns a message or null when the set can be logged. */
export function validateSet(weight: number | null, reps: number | null): string | null {
  if (reps == null || !Number.isInteger(reps) || reps < 1) return "Enter the reps you did";
  if (weight == null || weight < 0) return "Enter the weight. Use 0 for bodyweight";
  if (weight > 2000) return "That weight looks off";
  return null;
}
