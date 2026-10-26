/**
 * The guided workout: given a session, work out which set is next and what to
 * prefill. Shared by the web logger and the phone so they behave the same.
 */
import type { Unit } from "./plates";

export interface GuideSet {
  id: string;
  kind: "warmup" | "working";
  target_reps: number | null;
  target_weight: number | null;
  target_unit: Unit | null;
  target_rpe?: number | null;
  rest_seconds: number;
  actual_reps: number | null;
  actual_weight: number | null;
  actual_unit: Unit | null;
  rpe?: number | null;
  skipped: boolean;
  completed_at: string | null;
}

export interface GuideExercise<S extends GuideSet = GuideSet> {
  id: string;
  exercise_name: string;
  sets: S[];
  previous_sets?: S[];
}

export interface GuidePosition {
  exerciseIndex: number;
  setIndex: number;
}

export function isDone(set: GuideSet) {
  return set.skipped || set.completed_at != null;
}

/** The first set that is neither completed nor skipped, in workout order. */
export function nextPosition(exercises: GuideExercise[]): GuidePosition | null {
  for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
    const sets = exercises[exerciseIndex].sets;
    for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
      if (!isDone(sets[setIndex])) return { exerciseIndex, setIndex };
    }
  }
  return null;
}

/** Next open set within one exercise, so tapping an exercise jumps to where you left off. */
export function nextInExercise(exercise: GuideExercise): number | null {
  const index = exercise.sets.findIndex((set) => !isDone(set));
  return index < 0 ? null : index;
}

export function progress(exercises: GuideExercise[]) {
  let done = 0;
  let total = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      total += 1;
      if (isDone(set)) done += 1;
    }
  }
  return { done, total, fraction: total === 0 ? 0 : done / total };
}

export interface Prefill {
  weight: number | null;
  reps: number | null;
  unit: Unit;
  rpe: number | null;
  /** Where the numbers came from, so the screen can say "Last time" or "Plan". */
  source: "logged" | "plan" | "last-time" | "previous-set" | "empty";
}

/**
 * What to put in the inputs for a set.
 * 1. What you already logged for it.
 * 2. The plan's target.
 * 3. The matching set from last session (same position among sets of the same kind).
 * 4. The set you just did in this exercise.
 */
export function prefill(exercise: GuideExercise, setIndex: number, fallbackUnit: Unit): Prefill {
  const set = exercise.sets[setIndex];
  if (!set) return { weight: null, reps: null, unit: fallbackUnit, rpe: null, source: "empty" };
  if (set.actual_weight != null || set.actual_reps != null) {
    return {
      weight: set.actual_weight,
      reps: set.actual_reps,
      unit: set.actual_unit ?? set.target_unit ?? fallbackUnit,
      rpe: set.rpe ?? null,
      source: "logged",
    };
  }
  if (set.target_weight != null || set.target_reps != null) {
    const last = matchingPrevious(exercise, setIndex);
    return {
      weight: set.target_weight ?? last?.actual_weight ?? null,
      reps: set.target_reps ?? last?.actual_reps ?? null,
      unit: set.target_unit ?? last?.actual_unit ?? fallbackUnit,
      rpe: set.target_rpe ?? null,
      source: "plan",
    };
  }
  const last = matchingPrevious(exercise, setIndex);
  if (last && (last.actual_weight != null || last.actual_reps != null)) {
    return { weight: last.actual_weight, reps: last.actual_reps, unit: last.actual_unit ?? fallbackUnit, rpe: null, source: "last-time" };
  }
  for (let index = setIndex - 1; index >= 0; index -= 1) {
    const earlier = exercise.sets[index];
    if (earlier.completed_at && earlier.kind === set.kind) {
      return {
        weight: earlier.actual_weight,
        reps: earlier.actual_reps,
        unit: earlier.actual_unit ?? fallbackUnit,
        rpe: null,
        source: "previous-set",
      };
    }
  }
  return { weight: null, reps: null, unit: fallbackUnit, rpe: null, source: "empty" };
}

/** Last session's set at the same position among sets of the same kind. */
export function matchingPrevious(exercise: GuideExercise, setIndex: number): GuideSet | null {
  const set = exercise.sets[setIndex];
  const previous = exercise.previous_sets ?? [];
  if (!set || !previous.length) return null;
  const ordinal = exercise.sets.slice(0, setIndex).filter((item) => item.kind === set.kind).length;
  const sameKind = previous.filter((item) => item.kind === set.kind && item.completed_at);
  return sameKind[ordinal] ?? null;
}

/** Values for a new set added at the end of an exercise. */
export function nextSetTemplate(exercise: GuideExercise, fallbackUnit: Unit) {
  const last = exercise.sets[exercise.sets.length - 1];
  return {
    kind: last?.kind ?? ("working" as const),
    target_reps: last?.actual_reps ?? last?.target_reps ?? null,
    target_weight: last?.actual_weight ?? last?.target_weight ?? null,
    target_unit: last?.actual_unit ?? last?.target_unit ?? (last?.actual_weight != null || last?.target_weight != null ? fallbackUnit : null),
    rest_seconds: last?.rest_seconds ?? 120,
  };
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Parse a typed number. Accepts "102,5" from keyboards that use a decimal comma. */
export function parseAmount(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
