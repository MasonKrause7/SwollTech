import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { addDays, buildOverview, buildSessionReport, localDay, personalRecords, weekStart, type StatSession, type StatSet } from "./index";

const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../fixtures/stats-golden.json"), "utf8"));

const BENCH = "bench";
const SQUAT = "squat";
let counter = 0;
function session(day: string, hour = 12): StatSession {
  counter += 1;
  const start = `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
  return { id: `s${String(counter).padStart(3, "0")}`, startedAt: start, endedAt: new Date(Date.parse(start) + 3_600_000).toISOString() };
}
function lift(s: StatSession, exerciseId = BENCH, weightKg = 100, reps = 5, muscle = "chest"): StatSet {
  return { sessionId: s.id, exerciseId, exerciseName: exerciseId === BENCH ? "Bench Press" : "Back Squat", muscle, weightKg, reps };
}

describe("dates", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("uses the time zone to decide the day", () => {
    expect(localDay("2026-10-20T02:30:00Z", "UTC")).toBe("2026-10-20");
    expect(localDay("2026-10-20T02:30:00Z", "America/Detroit")).toBe("2026-10-19");
  });
});

describe("personal records", () => {
  it("treats the first session as a baseline", () => {
    const first = session("2026-10-01");
    expect(personalRecords([first], [lift(first)])).toEqual([]);
  });

  it("only counts sessions that beat every earlier one", () => {
    const [a, b, c, d] = ["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-07"].map((day) => session(day));
    const records = personalRecords([d, c, b, a], [lift(a, BENCH, 100), lift(b, BENCH, 95), lift(c, BENCH, 100), lift(d, BENCH, 105)]);
    expect(records.map((r) => r.sessionId)).toEqual([d.id]);
    expect(records[0].previousE1rmKg).toBe(116.666667);
    expect(records[0].e1rmKg).toBe(122.5);
  });
});

describe("overview", () => {
  it("computes streaks across consecutive weeks", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const sessions = ["2026-09-21", "2026-09-29", "2026-10-06", "2026-10-14", "2026-08-03", "2026-08-10"].map((day) => session(day));
    expect(buildOverview(sessions, [], now, "UTC").totals.currentStreakWeeks).toBe(4);
    sessions.push(session("2026-10-21"));
    const result = buildOverview(sessions, [], now, "UTC");
    expect(result.totals.currentStreakWeeks).toBe(5);
    expect(result.totals.longestStreakWeeks).toBe(5);
  });

  it("handles an empty log", () => {
    const result = buildOverview([], [], new Date("2026-10-22T12:00:00Z"), "UTC");
    expect(result.totals.sessions).toBe(0);
    expect(result.weekly).toHaveLength(12);
    expect(result.recentRecords).toEqual([]);
  });

  it("matches the server on the shared fixture", () => {
    const sessions: StatSession[] = golden.sessions.map((row: { id: string; started_at: string }) => ({ id: row.id, startedAt: row.started_at }));
    const sets: StatSet[] = golden.sets.map((row: Record<string, string | number>) => ({
      sessionId: row.session_id,
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      muscle: row.muscle,
      weightKg: row.weight_kg,
      reps: row.reps,
    }));
    const result = buildOverview(sessions, sets, new Date(golden.now), "UTC");
    const expected = golden.expected;
    expect(result.totals).toEqual({
      sessions: expected.totals.sessions,
      sets: expected.totals.sets,
      volumeKg: expected.totals.volume_kg,
      thisWeekSessions: expected.totals.this_week_sessions,
      thisWeekVolumeKg: expected.totals.this_week_volume_kg,
      lastWeekVolumeKg: expected.totals.last_week_volume_kg,
      currentStreakWeeks: expected.totals.current_streak_weeks,
      longestStreakWeeks: expected.totals.longest_streak_weeks,
      records: expected.totals.records,
    });
    expect(result.weekly).toEqual(
      expected.weekly.map((row: Record<string, string | number>) => ({ weekStart: row.week_start, sessions: row.sessions, sets: row.sets, volumeKg: row.volume_kg })),
    );
    expect(result.calendar).toEqual(expected.calendar);
    expect(result.muscleSplit).toEqual(
      expected.muscle_split.map((row: Record<string, string | number>) => ({ muscle: row.muscle, sets: row.sets, volumeKg: row.volume_kg })),
    );
    expect(result.recentRecords.map((r) => ({ exercise_name: r.exerciseName, e1rm_kg: r.e1rmKg, previous_e1rm_kg: r.previousE1rmKg, session_id: r.sessionId }))).toEqual(
      expected.recent_records,
    );
  });
});

describe("session report", () => {
  it("reports volume and records against earlier sessions only", () => {
    const [a, b, c] = ["2026-10-01", "2026-10-03", "2026-10-05"].map((day) => session(day));
    const sets = [lift(a, BENCH, 100), lift(b, BENCH, 110), lift(b, BENCH, 60, 12), lift(c, BENCH, 120)];
    const report = buildSessionReport(b, [a, b, c], sets);
    expect(report.sets).toBe(2);
    expect(report.volumeKg).toBe(1270);
    expect(report.durationSeconds).toBe(3600);
    expect(report.records.map((r) => r.e1rmKg)).toEqual([128.333333]);
    expect(report.exercises[0]).toMatchObject({ topWeightKg: 110, topReps: 5, sets: 2 });
    expect(buildSessionReport(a, [a, b, c], sets).records).toEqual([]);
  });
});
