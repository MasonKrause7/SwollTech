/**
 * Training statistics for the progress screens. This mirrors apps/api/swolltech/stats.py
 * so the phone can show the same numbers offline. Both are checked against
 * fixtures/stats-golden.json.
 *
 * - Only completed sessions are passed in.
 * - Only counted sets are passed in: working, not skipped, completed, reps >= 1, has a weight.
 * - Weeks start on Monday in the given time zone.
 * - The first session of an exercise is a baseline. A record is a later session whose best
 *   estimated 1RM beats every earlier one.
 */
import { epley, round6 } from "./index";

export const WEEKS = 12;
export const CALENDAR_DAYS = 112;
export const SPLIT_DAYS = 28;
export const RECORD_LIMIT = 10;
const EPSILON = 1e-9;

export interface StatSession {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  name?: string;
}

export interface StatSet {
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  muscle: string;
  weightKg: number;
  reps: number;
}

export interface RecordEvent {
  exerciseId: string;
  exerciseName: string;
  sessionId: string;
  achievedAt: string;
  e1rmKg: number;
  previousE1rmKg: number;
  weightKg: number;
  reps: number;
}

export interface OverviewStats {
  totals: {
    sessions: number;
    sets: number;
    volumeKg: number;
    thisWeekSessions: number;
    thisWeekVolumeKg: number;
    lastWeekVolumeKg: number;
    currentStreakWeeks: number;
    longestStreakWeeks: number;
    records: number;
  };
  weekly: { weekStart: string; sessions: number; sets: number; volumeKg: number }[];
  calendar: { day: string; sessions: number }[];
  muscleSplit: { muscle: string; sets: number; volumeKg: number }[];
  recentRecords: RecordEvent[];
  exercises: {
    exerciseId: string;
    exerciseName: string;
    muscle: string;
    sessions: number;
    bestE1rmKg: number | null;
    lastPerformedAt: string;
  }[];
}

/** Integer micro-kilograms so sums match the server's Decimal math exactly. */
function micro(weightKg: number, reps: number) {
  return Math.round(weightKg * 1e6) * reps;
}

function fromMicro(value: number) {
  return round6(value / 1e6);
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day (YYYY-MM-DD) a moment falls on in a time zone. */
export function localDay(moment: string | Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(typeof moment === "string" ? new Date(moment) : moment);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayNumber(day: string) {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

function dayString(value: number) {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number) {
  return dayString(dayNumber(day) + days);
}

export function weekStart(day: string) {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

function compareSessions(a: StatSession, b: StatSession) {
  const left = Date.parse(a.startedAt);
  const right = Date.parse(b.startedAt);
  if (left !== right) return left - right;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sessionBests(sets: StatSet[]) {
  const bests = new Map<string, Map<string, { e1rm: number; weightKg: number; reps: number }>>();
  for (const item of sets) {
    const estimate = epley(item.weightKg, item.reps);
    if (estimate == null) continue;
    let perSession = bests.get(item.sessionId);
    if (!perSession) {
      perSession = new Map();
      bests.set(item.sessionId, perSession);
    }
    const current = perSession.get(item.exerciseId);
    if (!current || estimate > current.e1rm + EPSILON) {
      perSession.set(item.exerciseId, { e1rm: estimate, weightKg: item.weightKg, reps: item.reps });
    }
  }
  return bests;
}

export function personalRecords(sessions: StatSession[], sets: StatSet[]): RecordEvent[] {
  const names = new Map(sets.map((item) => [item.exerciseId, item.exerciseName]));
  const bests = sessionBests(sets);
  const running = new Map<string, number>();
  const records: RecordEvent[] = [];
  for (const session of [...sessions].sort(compareSessions)) {
    const entries = [...(bests.get(session.id) ?? new Map()).entries()].sort((a, b) =>
      (names.get(a[0]) ?? "") < (names.get(b[0]) ?? "") ? -1 : 1,
    );
    for (const [exerciseId, best] of entries) {
      const previous = running.get(exerciseId);
      if (previous != null && best.e1rm > previous + EPSILON) {
        records.push({
          exerciseId,
          exerciseName: names.get(exerciseId) ?? "",
          sessionId: session.id,
          achievedAt: session.startedAt,
          e1rmKg: best.e1rm,
          previousE1rmKg: previous,
          weightKg: best.weightKg,
          reps: best.reps,
        });
      }
      if (previous == null || best.e1rm > previous) running.set(exerciseId, best.e1rm);
    }
  }
  return records;
}

function streaks(weeks: Set<string>, currentWeek: string): [number, number] {
  if (!weeks.size) return [0, 0];
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const week of [...weeks].sort()) {
    run = previous != null && dayNumber(week) - dayNumber(previous) === 7 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = week;
  }
  let anchor = weeks.has(currentWeek) ? currentWeek : addDays(currentWeek, -7);
  let current = 0;
  while (weeks.has(anchor)) {
    current += 1;
    anchor = addDays(anchor, -7);
  }
  return [current, longest];
}

export function buildOverview(sessions: StatSession[], sets: StatSet[], now: Date, timeZone: string): OverviewStats {
  const today = localDay(now, timeZone);
  const thisWeek = weekStart(today);
  const sessionDay = new Map(sessions.map((item) => [item.id, localDay(item.startedAt, timeZone)]));

  const weekly = new Map<string, { weekStart: string; sessions: number; sets: number; volume: number }>();
  for (let offset = WEEKS - 1; offset >= 0; offset -= 1) {
    const start = addDays(thisWeek, -7 * offset);
    weekly.set(start, { weekStart: start, sessions: 0, sets: 0, volume: 0 });
  }

  const calendar = new Map<string, number>();
  const calendarStart = addDays(today, -(CALENDAR_DAYS - 1));
  const activeWeeks = new Set<string>();
  for (const item of sessions) {
    const day = sessionDay.get(item.id)!;
    const start = weekStart(day);
    activeWeeks.add(start);
    const bucket = weekly.get(start);
    if (bucket) bucket.sessions += 1;
    if (day >= calendarStart && day <= today) calendar.set(day, (calendar.get(day) ?? 0) + 1);
  }

  let totalVolume = 0;
  const split = new Map<string, { sets: number; volume: number }>();
  const splitStart = addDays(today, -(SPLIT_DAYS - 1));
  const exercises = new Map<
    string,
    { exerciseId: string; exerciseName: string; muscle: string; sessions: Set<string>; bestE1rmKg: number | null }
  >();
  for (const item of sets) {
    const day = sessionDay.get(item.sessionId);
    if (!day) continue;
    const volume = micro(item.weightKg, item.reps);
    totalVolume += volume;
    const bucket = weekly.get(weekStart(day));
    if (bucket) {
      bucket.sets += 1;
      bucket.volume += volume;
    }
    if (day >= splitStart && day <= today) {
      const key = item.muscle || "other";
      const entry = split.get(key) ?? { sets: 0, volume: 0 };
      entry.sets += 1;
      entry.volume += volume;
      split.set(key, entry);
    }
    let summary = exercises.get(item.exerciseId);
    if (!summary) {
      summary = {
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        muscle: item.muscle || "other",
        sessions: new Set(),
        bestE1rmKg: null,
      };
      exercises.set(item.exerciseId, summary);
    }
    summary.sessions.add(item.sessionId);
    const estimate = epley(item.weightKg, item.reps);
    if (estimate != null && (summary.bestE1rmKg == null || estimate > summary.bestE1rmKg)) summary.bestE1rmKg = estimate;
  }

  const started = new Map(sessions.map((item) => [item.id, item.startedAt]));
  const [currentStreak, longestStreak] = streaks(activeWeeks, thisWeek);
  const records = personalRecords(sessions, sets);
  const current = weekly.get(thisWeek)!;
  const lastWeek = weekly.get(addDays(thisWeek, -7));

  return {
    totals: {
      sessions: sessions.length,
      sets: sets.length,
      volumeKg: fromMicro(totalVolume),
      thisWeekSessions: current.sessions,
      thisWeekVolumeKg: fromMicro(current.volume),
      lastWeekVolumeKg: lastWeek ? fromMicro(lastWeek.volume) : 0,
      currentStreakWeeks: currentStreak,
      longestStreakWeeks: longestStreak,
      records: records.length,
    },
    weekly: [...weekly.values()].map((row) => ({
      weekStart: row.weekStart,
      sessions: row.sessions,
      sets: row.sets,
      volumeKg: fromMicro(row.volume),
    })),
    calendar: [...calendar.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, count]) => ({ day, sessions: count })),
    muscleSplit: [...split.entries()]
      .sort((a, b) => b[1].sets - a[1].sets || (a[0] < b[0] ? -1 : 1))
      .map(([muscle, entry]) => ({ muscle, sets: entry.sets, volumeKg: fromMicro(entry.volume) })),
    recentRecords: [...records].reverse().slice(0, RECORD_LIMIT),
    exercises: [...exercises.values()]
      .map((row) => ({
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName,
        muscle: row.muscle,
        sessions: row.sessions.size,
        bestE1rmKg: row.bestE1rmKg,
        lastPerformedAt: [...row.sessions].map((id) => started.get(id)!).sort((a, b) => Date.parse(b) - Date.parse(a))[0],
      }))
      .sort((a, b) => Date.parse(b.lastPerformedAt) - Date.parse(a.lastPerformedAt)),
  };
}

export interface SessionReportStats {
  sets: number;
  volumeKg: number;
  durationSeconds: number | null;
  exercises: { exerciseId: string; exerciseName: string; sets: number; bestE1rmKg: number; topWeightKg: number; topReps: number }[];
  records: RecordEvent[];
}

export function buildSessionReport(target: StatSession, sessions: StatSession[], sets: StatSet[]): SessionReportStats {
  const mine = sets.filter((item) => item.sessionId === target.id);
  const earlier = sessions.filter((item) => item.id !== target.id && compareSessions(item, target) < 0);
  const considered = [...earlier, target];
  const ids = new Set(considered.map((item) => item.id));
  const records = personalRecords(
    considered,
    sets.filter((item) => ids.has(item.sessionId)),
  ).filter((record) => record.sessionId === target.id);
  const bests = sessionBests(mine).get(target.id) ?? new Map();
  const names = new Map(mine.map((item) => [item.exerciseId, item.exerciseName]));
  const counts = new Map<string, number>();
  for (const item of mine) counts.set(item.exerciseId, (counts.get(item.exerciseId) ?? 0) + 1);
  const duration =
    target.endedAt != null ? Math.max(0, Math.floor((Date.parse(target.endedAt) - Date.parse(target.startedAt)) / 1000)) : null;
  return {
    sets: mine.length,
    volumeKg: fromMicro(mine.reduce((total, item) => total + micro(item.weightKg, item.reps), 0)),
    durationSeconds: duration,
    exercises: [...bests.entries()]
      .sort((a, b) => ((names.get(a[0]) ?? "") < (names.get(b[0]) ?? "") ? -1 : 1))
      .map(([exerciseId, best]) => ({
        exerciseId,
        exerciseName: names.get(exerciseId) ?? "",
        sets: counts.get(exerciseId) ?? 0,
        bestE1rmKg: best.e1rm,
        topWeightKg: best.weightKg,
        topReps: best.reps,
      })),
    records,
  };
}
