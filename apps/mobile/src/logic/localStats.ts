import { addDays, localDay, summarizeSets, weekStart, type PerformedSet, type StatSession, type StatSet } from "@swolltech/metrics";
import { isCounted, setWeightKg, type LocalData } from "./session";
import { live, type SessionRow } from "./rows";

/** Completed sessions and their counted sets, in the shape packages/metrics expects. */
export function statLog(data: LocalData, includeSessionId?: string): { sessions: StatSession[]; sets: StatSet[] } {
  const sessions = live(data.sessions).filter((row) => row.status === "completed" || row.id === includeSessionId);
  const ids = new Set(sessions.map((row) => row.id));
  const exercises = new Map(data.exercises.map((row) => [row.id, row]));
  const items = new Map(live(data.sessionExercises).filter((row) => ids.has(row.session_id)).map((row) => [row.id, row]));
  const sets: StatSet[] = [];
  for (const set of data.sessionSets) {
    const item = items.get(set.session_exercise_id);
    if (!item || !isCounted(set)) continue;
    const exercise = exercises.get(item.exercise_id);
    sets.push({
      sessionId: item.session_id,
      exerciseId: item.exercise_id,
      exerciseName: exercise?.name ?? "Exercise",
      muscle: exercise?.primary_muscle ?? "",
      weightKg: setWeightKg(set)!,
      reps: set.actual_reps!,
    });
  }
  return {
    sessions: sessions.map((row) => ({ id: row.id, startedAt: row.started_at, endedAt: row.ended_at, name: row.name })),
    sets,
  };
}

export interface ExercisePoint {
  sessionId: string;
  startedAt: string;
  bestE1rmKg: number | null;
  volumeKg: number;
  topSetWeightKg: number | null;
}

/** One point per completed session that has counted sets for this exercise, oldest first. */
export function exerciseProgress(data: LocalData, exerciseId: string): ExercisePoint[] {
  const sessions = new Map(live(data.sessions).filter((row) => row.status === "completed").map((row) => [row.id, row]));
  const grouped = new Map<string, PerformedSet[]>();
  const items = new Map(
    live(data.sessionExercises)
      .filter((row) => row.exercise_id === exerciseId && sessions.has(row.session_id))
      .map((row) => [row.id, row.session_id]),
  );
  for (const set of data.sessionSets) {
    const sessionId = items.get(set.session_exercise_id);
    if (!sessionId || !isCounted(set)) continue;
    const list = grouped.get(sessionId) ?? [];
    list.push({ weightKg: setWeightKg(set)!, reps: set.actual_reps!, kind: set.kind, skipped: set.skipped, completed: true });
    grouped.set(sessionId, list);
  }
  return [...grouped.entries()]
    .map(([sessionId, sets]) => {
      const summary = summarizeSets(sets, null);
      return {
        sessionId,
        startedAt: sessions.get(sessionId)!.started_at,
        bestE1rmKg: summary.bestE1rmKg,
        volumeKg: summary.volumeKg,
        topSetWeightKg: summary.topSetWeightKg,
      };
    })
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

export interface HistoryWeek {
  weekStart: string;
  volumeKg: number;
  sessions: { session: SessionRow; volumeKg: number; sets: number }[];
}

/** Completed sessions grouped by Monday-start week, newest first. */
export function historyByWeek(data: LocalData, timeZone: string): HistoryWeek[] {
  const { sessions, sets } = statLog(data);
  const rows = new Map(live(data.sessions).map((row) => [row.id, row]));
  const totals = new Map<string, { volume: number; sets: number }>();
  for (const set of sets) {
    const entry = totals.get(set.sessionId) ?? { volume: 0, sets: 0 };
    entry.volume += Math.round(set.weightKg * 1e6) * set.reps;
    entry.sets += 1;
    totals.set(set.sessionId, entry);
  }
  const weeks = new Map<string, HistoryWeek>();
  for (const item of [...sessions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
    const start = weekStart(localDay(item.startedAt, timeZone));
    const week = weeks.get(start) ?? { weekStart: start, volumeKg: 0, sessions: [] };
    const total = totals.get(item.id) ?? { volume: 0, sets: 0 };
    week.sessions.push({ session: rows.get(item.id)!, volumeKg: total.volume / 1e6, sets: total.sets });
    week.volumeKg += total.volume / 1e6;
    weeks.set(start, week);
  }
  return [...weeks.values()];
}

/** "Oct 19 to 25" for a week starting on the given Monday. */
export function weekLabel(start: string) {
  const end = addDays(start, 6);
  const month = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const date = (day: string) => Number(day.slice(8, 10));
  if (month(start) === month(end)) return `${month(start)} ${date(start)} to ${date(end)}`;
  return `${month(start)} ${date(start)} to ${month(end)} ${date(end)}`;
}
