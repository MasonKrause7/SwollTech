/**
 * Building and reading sessions from the rows stored on the phone. No React
 * Native imports so this runs under vitest.
 */
import { DEFAULT_BAR, epley, fromKilograms, toKilograms, type GuideExercise } from "@swolltech/metrics";
import {
  byPosition,
  live,
  type ExerciseRow,
  type ReferenceRow,
  type ScheduledWorkoutRow,
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
  schedule: ScheduledWorkoutRow[];
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
  /** Catalog equipment, e.g. "barbell". Empty when the exercise is unknown. */
  equipment: string;
  /** The note on this exercise in the session (copied from the workout plan). */
  notes: string;
  position: number;
  sets: SessionSetRow[];
  previous_sets: SessionSetRow[];
  /** Best estimated 1RM (kg) from completed sessions before this one, or null if never done. */
  best_e1rm_kg: number | null;
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
  const bests = bestsBefore(
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
        equipment: exercise?.equipment ?? "",
        notes: item.notes ?? "",
        position: item.position,
        sets: byPosition(live(data.sessionSets).filter((row) => row.session_exercise_id === item.id)),
        previous_sets: history.get(item.exercise_id) ?? [],
        best_e1rm_kg: bests.get(item.exercise_id) ?? null,
      };
    }),
  };
}

/** The set row after logging it from the guided screen. */
export function logSet(
  set: SessionSetRow,
  values: { weight: number; reps: number; unit: Unit; rpe: number | null; notes?: string },
  now: Date,
): SessionSetRow {
  return {
    ...set,
    notes: values.notes != null ? cleanNote(values.notes) : set.notes,
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
  if (reps > MAX_REPS) return `Reps top out at ${MAX_REPS}`;
  if (weight == null || weight < 0) return "Enter the weight. Use 0 for bodyweight";
  if (weight > MAX_WEIGHT) return `Weight tops out at ${MAX_WEIGHT}`;
  return null;
}

// ---------------------------------------------------------------------------
// In-session helpers: units, limits, equipment, records, rest, notes and
// managing the exercises in a session.

export const MAX_WEIGHT = 2000;
export const MAX_REPS = 1000;
export const NOTE_LIMIT = 500;
export const SESSION_NAME_LIMIT = 80;
export const DEFAULT_REST_SECONDS = 120;
/** Rest choices offered in the session. 0 means the timer is off. */
export const REST_CHOICES = [0, 60, 90, 120, 180] as const;

/**
 * Convert a typed weight to the other unit and round it to something you can
 * load. On a barbell lift the empty bar maps to the other unit's bar (45 lb ↔ 20 kg).
 */
export function convertWeight(weight: number, from: Unit, to: Unit, barbell = false): number {
  if (from === to) return weight;
  if (barbell && weight === DEFAULT_BAR[from]) return DEFAULT_BAR[to];
  return roundLoadable(fromKilograms(toKilograms(weight, from), to), to);
}

/**
 * Keep a typed amount inside what can be logged. Returns the value to show and
 * a gentle message when the typed amount was over the limit.
 */
export function clampAmount(value: number | null, max: number): { value: number | null; message: string | null } {
  if (value == null || !Number.isFinite(value)) return { value: null, message: null };
  if (value < 0) return { value: 0, message: null };
  if (value > max) return { value: max, message: `${max} is the most you can log here` };
  return { value, message: null };
}

export function clampWeight(value: number | null) {
  return clampAmount(value, MAX_WEIGHT);
}

export function clampReps(value: number | null) {
  const clamped = clampAmount(value, MAX_REPS);
  return clamped.value == null ? clamped : { ...clamped, value: Math.round(clamped.value) };
}

export function isBarbell(equipment: string | null | undefined): boolean {
  return (equipment ?? "").trim().toLowerCase() === "barbell";
}

/** The weight to start the input at when there is nothing to prefill: the empty bar for barbell lifts. */
export function startingWeight(prefilled: number | null, equipment: string, unit: Unit): number | null {
  if (prefilled != null) return prefilled;
  return isBarbell(equipment) ? DEFAULT_BAR[unit] : null;
}

/** Best estimated 1RM (kg) per exercise from completed sessions that started before `before`. */
export function bestsBefore(data: LocalData, exerciseIds: string[], before: string, excludeSessionId?: string): Map<string, number> {
  const cutoff = Date.parse(before);
  const wanted = new Set(exerciseIds);
  const sessions = new Set(
    live(data.sessions)
      .filter((row) => row.status === "completed" && row.id !== excludeSessionId && Date.parse(row.started_at) < cutoff)
      .map((row) => row.id),
  );
  const parents = new Map<string, string>();
  for (const item of live(data.sessionExercises)) {
    if (wanted.has(item.exercise_id) && sessions.has(item.session_id)) parents.set(item.id, item.exercise_id);
  }
  const bests = new Map<string, number>();
  for (const set of data.sessionSets) {
    const exerciseId = parents.get(set.session_exercise_id);
    if (!exerciseId || !isCounted(set)) continue;
    const estimate = epley(setWeightKg(set)!, set.actual_reps!);
    if (estimate == null) continue;
    const current = bests.get(exerciseId);
    if (current == null || estimate > current) bests.set(exerciseId, estimate);
  }
  return bests;
}

const RECORD_EPSILON = 1e-9;

/**
 * The new estimated 1RM (kg) when logging this working set beats the lift's best
 * from earlier sessions and every other set logged for it in this session.
 * Null otherwise, including the first time you do a lift (nothing to beat yet),
 * which matches how the summary counts records.
 */
export function recordFor(
  exercise: Pick<SessionExerciseView, "best_e1rm_kg" | "sets">,
  setId: string,
  values: { weight: number; reps: number; unit: Unit; kind: SessionSetRow["kind"] },
): number | null {
  if (values.kind !== "working" || exercise.best_e1rm_kg == null || values.reps < 1) return null;
  const estimate = epley(toKilograms(values.weight, values.unit), values.reps);
  if (estimate == null) return null;
  let bar = exercise.best_e1rm_kg;
  for (const set of exercise.sets) {
    if (set.id === setId || !isCounted(set)) continue;
    const other = epley(setWeightKg(set)!, set.actual_reps!);
    if (other != null && other > bar) bar = other;
  }
  return estimate > bar + RECORD_EPSILON ? estimate : null;
}

/** Rest for a planned set: blank means the default, 0 only when you chose Off. */
export function restFromText(text: string, fallback = DEFAULT_REST_SECONDS): number | null {
  const cleaned = text.trim();
  if (!cleaned) return fallback;
  const value = Number(cleaned.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

export function restLabel(seconds: number) {
  if (seconds <= 0) return "Off";
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds}s`;
}

/** Sets in this exercise not yet logged or skipped, with the new rest. Only changed rows are returned. */
export function applyRest(sets: SessionSetRow[], seconds: number): SessionSetRow[] {
  const rest = Math.max(0, Math.round(seconds));
  return sets.filter((set) => set.completed_at == null && !set.skipped && set.rest_seconds !== rest).map((set) => ({ ...set, rest_seconds: rest }));
}

export function cleanNote(text: string) {
  return text.trim().slice(0, NOTE_LIMIT);
}

export function validateSessionName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the session a name";
  if (trimmed.length > SESSION_NAME_LIMIT) return `Keep the name under ${SESSION_NAME_LIMIT} characters`;
  return null;
}

/** The note on last session's matching set, if it had one. */
export function previousNote(exercise: SessionExerciseView, setIndex: number): string | null {
  const set = exercise.sets[setIndex];
  if (!set) return null;
  const ordinal = exercise.sets.slice(0, setIndex).filter((item) => item.kind === set.kind).length;
  const match = exercise.previous_sets.filter((item) => item.kind === set.kind && item.completed_at)[ordinal];
  return match?.notes?.trim() ? match.notes.trim() : null;
}

/**
 * Add a warm-up set before the first working set. Returns the new warm-up and
 * every row to save: it plus any set whose position moved (positions end up 0..n).
 */
export function insertWarmup(
  sets: SessionSetRow[],
  sessionExerciseId: string,
  newId: () => string,
  template: Partial<SessionSetRow> = {},
): { added: SessionSetRow; rows: SessionSetRow[] } {
  const ordered = byPosition(sets);
  const firstWorking = ordered.findIndex((set) => set.kind === "working");
  const at = firstWorking < 0 ? ordered.length : firstWorking;
  const added = blankSet(sessionExerciseId, at, newId, { rest_seconds: 60, ...template, kind: "warmup" });
  const rows: SessionSetRow[] = [added];
  ordered.forEach((set, index) => {
    const position = index < at ? index : index + 1;
    if (set.position !== position) rows.push({ ...set, position });
  });
  return { added, rows };
}

/** Clear everything logged on a set, keeping what was planned. */
export function clearActuals(set: SessionSetRow): SessionSetRow {
  return { ...set, actual_reps: null, actual_weight: null, actual_unit: null, weight_kg: null, rpe: null, notes: "", skipped: false, completed_at: null };
}

/**
 * Swap the lift on a session exercise. Planned sets stay, logged numbers are
 * cleared, and percent targets are worked out again against the new lift's max.
 */
export function replaceExercise(
  data: LocalData,
  item: SessionExerciseRow,
  sets: SessionSetRow[],
  exerciseId: string,
  unit: Unit,
): { exercise: SessionExerciseRow; sets: SessionSetRow[] } {
  const reference = referenceKg(data, exerciseId);
  return {
    exercise: { ...item, exercise_id: exerciseId, notes: "" },
    sets: sets.map((set) => {
      const cleared = clearActuals(set);
      if (set.target_percent == null) return cleared;
      const percent = Number(set.target_percent);
      if (reference == null) return { ...cleared, target_weight: null, target_unit: null };
      return { ...cleared, target_weight: roundLoadable(fromKilograms((reference * percent) / 100, unit), unit), target_unit: unit };
    }),
  };
}

/** The session exercise row behind a view, for saving. */
export function exerciseRow(sessionId: string, view: Pick<SessionExerciseView, "id" | "exercise_id" | "position" | "notes">): SessionExerciseRow {
  return { id: view.id, session_id: sessionId, exercise_id: view.exercise_id, position: view.position, notes: view.notes };
}
