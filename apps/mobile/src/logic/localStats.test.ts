import { buildOverview } from "@swolltech/metrics";
import { describe, expect, it } from "vitest";
import { BENCH, SQUAT, emptyData } from "./fixtures";
import { exerciseProgress, historyByWeek, statLog, weekLabel } from "./localStats";
import { blankSet, logSet, skipSet, type LocalData } from "./session";

function log(data: LocalData, id: string, startedAt: string, status: "completed" | "in_progress", lifts: [string, number, number, ("warmup" | "working")?][]) {
  data.sessions.push({ id, workout_id: null, name: id, status, started_at: startedAt, ended_at: null, notes: "" });
  lifts.forEach(([exercise, weight, reps, kind], index) => {
    const itemId = `${id}-${exercise}`;
    if (!data.sessionExercises.some((row) => row.id === itemId)) {
      data.sessionExercises.push({ id: itemId, session_id: id, exercise_id: exercise, position: index, notes: "" });
    }
    data.sessionSets.push(logSet(blankSet(itemId, index, () => `${id}-set-${index}`, { kind: kind ?? "working" }), { weight, reps, unit: "kg", rpe: null }, new Date(startedAt)));
  });
}

describe("statLog", () => {
  it("keeps completed sessions and counted sets only", () => {
    const data = emptyData();
    log(data, "a", "2026-10-13T12:00:00Z", "completed", [[BENCH, 100, 5], [BENCH, 60, 10, "warmup"], [SQUAT, 140, 5]]);
    log(data, "b", "2026-10-20T12:00:00Z", "in_progress", [[BENCH, 200, 5]]);
    data.sessionSets.push(skipSet(blankSet("a-" + BENCH, 9, () => "skipped")));
    const deleted = logSet(blankSet("a-" + BENCH, 10, () => "deleted"), { weight: 500, reps: 1, unit: "kg", rpe: null }, new Date());
    data.sessionSets.push({ ...deleted, deleted_at: "2026-10-14T00:00:00Z" });
    const result = statLog(data);
    expect(result.sessions.map((row) => row.id)).toEqual(["a"]);
    expect(result.sets.map((row) => [row.exerciseName, row.weightKg, row.reps, row.muscle])).toEqual([
      ["Bench Press", 100, 5, "chest"],
      ["Back Squat", 140, 5, "quads"],
    ]);
    expect(statLog(data, "b").sessions).toHaveLength(2);
  });

  it("feeds buildOverview so records show up offline", () => {
    const data = emptyData();
    log(data, "a", "2026-10-13T12:00:00Z", "completed", [[BENCH, 100, 5]]);
    log(data, "b", "2026-10-20T12:00:00Z", "completed", [[BENCH, 105, 5]]);
    const { sessions, sets } = statLog(data);
    const overview = buildOverview(sessions, sets, new Date("2026-10-22T12:00:00Z"), "UTC");
    expect(overview.totals.records).toBe(1);
    expect(overview.totals.currentStreakWeeks).toBe(2);
  });
});

describe("exerciseProgress", () => {
  it("returns one point per completed session in date order", () => {
    const data = emptyData();
    log(data, "b", "2026-10-20T12:00:00Z", "completed", [[BENCH, 105, 5], [BENCH, 110, 3]]);
    log(data, "a", "2026-10-13T12:00:00Z", "completed", [[BENCH, 100, 5]]);
    log(data, "c", "2026-10-22T12:00:00Z", "in_progress", [[BENCH, 120, 5]]);
    const points = exerciseProgress(data, BENCH);
    expect(points.map((row) => row.sessionId)).toEqual(["a", "b"]);
    expect(points[1]).toMatchObject({ bestE1rmKg: 122.5, volumeKg: 855, topSetWeightKg: 105 });
    expect(exerciseProgress(data, SQUAT)).toEqual([]);
  });
});

describe("history", () => {
  it("groups completed sessions by week, newest first", () => {
    const data = emptyData();
    log(data, "a", "2026-10-13T12:00:00Z", "completed", [[BENCH, 100, 5]]);
    log(data, "b", "2026-10-20T12:00:00Z", "completed", [[BENCH, 100, 5], [SQUAT, 100, 5]]);
    log(data, "c", "2026-10-21T12:00:00Z", "completed", []);
    const weeks = historyByWeek(data, "UTC");
    expect(weeks.map((row) => row.weekStart)).toEqual(["2026-10-19", "2026-10-12"]);
    expect(weeks[0].sessions.map((row) => row.session.id)).toEqual(["c", "b"]);
    expect(weeks[0].volumeKg).toBe(1000);
    expect(weeks[0].sessions[1].sets).toBe(2);
  });

  it("labels weeks", () => {
    expect(weekLabel("2026-10-19")).toBe("Oct 19 to 25");
    expect(weekLabel("2026-10-26")).toBe("Oct 26 to Nov 1");
  });
});
