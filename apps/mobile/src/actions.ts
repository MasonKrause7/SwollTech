import { deleteRow, loadAll, newId, saveRow, saveRows, type Notebook } from "./db";
import type { ProfileRow, ScheduledWorkoutRow, SessionExerciseRow, SessionRow, SessionSetRow, Unit } from "./logic/rows";
import { newPlans } from "./logic/schedule";
import {
  applyRest,
  blankSet,
  buildQuickSession,
  buildSessionFromWorkout,
  cleanNote,
  finishSession,
  insertWarmup,
  replaceExercise,
  type LocalData,
} from "./logic/session";
import { moveRow, nextPosition } from "./logic/workouts";
import { syncNow } from "./sync";

/** Write a new session and its planned sets to the phone. Returns the session id. */
export async function startWorkout(db: Notebook, workoutId: string, unit: Unit) {
  const data = await loadAll(db);
  const built = buildSessionFromWorkout(data, workoutId, unit, newId, new Date());
  await saveRow(db, "sessions", built.session);
  await saveRows(db, "session_exercises", built.exercises);
  await saveRows(db, "session_sets", built.sets);
  void syncNow();
  return built.session.id;
}

/** Put a workout on the calendar, optionally on the same weekday for more weeks. */
export async function scheduleWorkout(db: Notebook, workoutId: string, day: string, repeatWeeks: number) {
  await saveRows(db, "scheduled_workouts", newPlans(workoutId, day, repeatWeeks, newId));
  void syncNow();
}

export async function movePlan(db: Notebook, plan: ScheduledWorkoutRow, day: string) {
  await saveRow(db, "scheduled_workouts", { ...plan, scheduled_on: day });
  void syncNow();
}

export async function removePlan(db: Notebook, planId: string) {
  await deleteRow(db, "scheduled_workouts", planId);
  void syncNow();
}

export async function startQuick(db: Notebook) {
  const session = buildQuickSession(newId, new Date());
  await saveRow(db, "sessions", session);
  return session.id;
}

/** Add an exercise to a session with one empty working set, ready to log. */
export async function addExerciseToSession(db: Notebook, sessionId: string, exerciseId: string, siblings: SessionExerciseRow[]) {
  const item: SessionExerciseRow = { id: newId(), session_id: sessionId, exercise_id: exerciseId, position: nextPosition(siblings), notes: "" };
  await saveRow(db, "session_exercises", item);
  await saveRow(db, "session_sets", blankSet(item.id, 0, newId));
  return item.id;
}

export async function addSetToExercise(db: Notebook, sessionExerciseId: string, sets: SessionSetRow[], template: Partial<SessionSetRow>) {
  const row = blankSet(sessionExerciseId, nextPosition(sets), newId, template);
  await saveRow(db, "session_sets", row);
  return row.id;
}

/** Move an exercise one place up or down in the session. */
export async function moveSessionExercise(db: Notebook, siblings: SessionExerciseRow[], id: string, direction: -1 | 1) {
  const changed = moveRow(siblings, id, direction);
  if (changed.length) await saveRows(db, "session_exercises", changed);
}

/** Swap the lift, keeping planned sets and clearing anything logged on them. */
export async function replaceSessionExercise(db: Notebook, data: LocalData, item: SessionExerciseRow, sets: SessionSetRow[], exerciseId: string, unit: Unit) {
  const replaced = replaceExercise(data, item, sets, exerciseId, unit);
  await saveRow(db, "session_exercises", replaced.exercise);
  if (replaced.sets.length) await saveRows(db, "session_sets", replaced.sets);
}

/** Remove an exercise and its sets from the session. */
export async function removeSessionExercise(db: Notebook, sessionExerciseId: string) {
  await deleteRow(db, "session_exercises", sessionExerciseId);
}

/** Add a warm-up before the first working set. Returns the new set id. */
export async function addWarmupSet(db: Notebook, sessionExerciseId: string, sets: SessionSetRow[], template: Partial<SessionSetRow> = {}) {
  const { added, rows } = insertWarmup(sets, sessionExerciseId, newId, template);
  await saveRows(db, "session_sets", rows);
  return added.id;
}

/** Change the rest on every open set of an exercise. */
export async function setExerciseRest(db: Notebook, sets: SessionSetRow[], seconds: number) {
  const changed = applyRest(sets, seconds);
  if (changed.length) await saveRows(db, "session_sets", changed);
}

export async function saveSessionDetails(db: Notebook, session: SessionRow, changes: { name: string; notes: string }) {
  await saveRow(db, "sessions", { ...session, name: changes.name.trim(), notes: cleanNote(changes.notes) });
}

export async function completeSession(db: Notebook, session: SessionRow) {
  await saveRow(db, "sessions", finishSession(session, new Date()));
  void syncNow();
}

export async function saveProfile(db: Notebook, profile: ProfileRow, changes: Partial<Pick<ProfileRow, "display_name" | "unit_preference">>) {
  await saveRow(db, "profiles", { ...profile, ...changes });
  void syncNow();
}
