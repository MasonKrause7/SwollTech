import { loadAll, newId, saveRow, saveRows, type Notebook } from "./db";
import type { ProfileRow, SessionExerciseRow, SessionRow, SessionSetRow, Unit } from "./logic/rows";
import { blankSet, buildQuickSession, buildSessionFromWorkout, finishSession } from "./logic/session";
import { nextPosition } from "./logic/workouts";
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

export async function completeSession(db: Notebook, session: SessionRow) {
  await saveRow(db, "sessions", finishSession(session, new Date()));
  void syncNow();
}

export async function saveProfile(db: Notebook, profile: ProfileRow, changes: Partial<Pick<ProfileRow, "display_name" | "unit_preference">>) {
  await saveRow(db, "profiles", { ...profile, ...changes });
  void syncNow();
}
