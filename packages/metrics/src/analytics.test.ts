import { describe, expect, it } from "vitest";
import { ALL_LIFTS, buildAnalytics, liftChoices, normalizeOptions, type StatSession, type StatSet } from "./index";

const NOW = new Date("2026-11-06T18:00:00Z");
let counter = 0;
function session(day: string): StatSession {
  counter += 1;
  return { id: `s${String(counter).padStart(3, "0")}`, startedAt: `${day}T12:00:00.000Z` };
}
function lift(s: StatSession, exerciseId: string, weightKg: number, reps: number): StatSet {
  return { sessionId: s.id, exerciseId, exerciseName: exerciseId === "bench" ? "Bench Press" : "Back Squat", muscle: "", weightKg, reps };
}

// Mon Oct 19, Wed Oct 21, Mon Oct 26 (next week), and one in September.
const a = session("2026-10-19");
const b = session("2026-10-21");
const c = session("2026-10-26");
const old = session("2026-09-02");
const sessions = [a, b, c, old];
const sets = [
  lift(a, "bench", 100, 5),
  lift(a, "bench", 100, 5),
  lift(a, "squat", 140, 5),
  lift(b, "squat", 150, 3),
  lift(c, "bench", 105, 3),
  lift(c, "bench", 90, 10),
  lift(old, "bench", 95, 5),
];

describe("analytics", () => {
  it("plots one point per session for a lift, oldest first", () => {
    const result = buildAnalytics(sessions, sets, { exerciseId: "bench", measure: "e1rm", period: "session", range: "all" }, NOW, "UTC");
    expect(result.points.map((point) => point.day)).toEqual(["2026-09-02", "2026-10-19", "2026-10-26"]);
    // 90 x 10 = 120 beats 105 x 3 = 115.5 on Oct 26.
    expect(result.points.map((point) => point.value)).toEqual([110.833333, 116.666667, 120]);
    expect(result.summary.best).toBe(120);
    expect(result.summary.changePercent).toBeCloseTo(8.27, 1);
  });

  it("keeps top weight separate from the estimated max", () => {
    const result = buildAnalytics(sessions, sets, { exerciseId: "bench", measure: "topSet", period: "session", range: "all" }, NOW, "UTC");
    expect(result.points.map((point) => point.value)).toEqual([95, 100, 105]);
  });

  it("sums volume per week and keeps empty weeks as zero", () => {
    const result = buildAnalytics(sessions, sets, { exerciseId: ALL_LIFTS, measure: "volume", period: "week", range: "all" }, NOW, "UTC");
    const byWeek = Object.fromEntries(result.points.map((point) => [point.day, point.value]));
    expect(byWeek["2026-10-19"]).toBe(100 * 5 * 2 + 140 * 5 + 150 * 3);
    expect(byWeek["2026-10-26"]).toBe(105 * 3 + 90 * 10);
    expect(byWeek["2026-09-07"]).toBe(0);
    expect(result.points[0].day).toBe("2026-08-31");
    expect(result.points[result.points.length - 1].day).toBe("2026-11-02");
  });

  it("counts frequency as sessions that trained the lift", () => {
    const squat = buildAnalytics(sessions, sets, { exerciseId: "squat", measure: "sessions", period: "week", range: "all" }, NOW, "UTC");
    expect(squat.points.find((point) => point.day === "2026-10-19")?.value).toBe(2);
    expect(squat.summary.total).toBe(2);
    const all = buildAnalytics(sessions, sets, { exerciseId: ALL_LIFTS, measure: "sessions", period: "month", range: "all" }, NOW, "UTC");
    expect(all.points.map((point) => [point.day, point.value])).toEqual([
      ["2026-09-01", 1],
      ["2026-10-01", 3],
      ["2026-11-01", 0],
    ]);
  });

  it("keeps the unfinished month out of average, latest and change", () => {
    const result = buildAnalytics(sessions, sets, { exerciseId: ALL_LIFTS, measure: "sessions", period: "month", range: "all" }, NOW, "UTC");
    // September 1, October 3, November (under way) 0.
    expect(result.summary.total).toBe(4);
    expect(result.summary.latest).toBe(3);
    expect(result.summary.average).toBe(2);
    expect(result.summary.changePercent).toBe(200);
  });

  it("leaves gaps instead of zeros for max measures", () => {
    const result = buildAnalytics(sessions, sets, { exerciseId: "bench", measure: "topSet", period: "week", range: "3m" }, NOW, "UTC");
    expect(result.points.find((point) => point.day === "2026-09-14")?.value).toBeNull();
    expect(result.points.find((point) => point.day === "2026-09-14")?.trend).toBeNull();
  });

  it("drops sessions outside the range", () => {
    const result = buildAnalytics(sessions, sets, { exerciseId: "bench", measure: "sets", period: "session", range: "3m" }, NOW, "UTC");
    expect(result.points).toHaveLength(3);
    const recent = buildAnalytics(sessions, sets, { exerciseId: "bench", measure: "sets", period: "month", range: "3m" }, new Date("2027-01-15T12:00:00Z"), "UTC");
    expect(recent.points[0].day).toBe("2026-10-01");
  });

  it("smooths a trend over the last four points", () => {
    const result = buildAnalytics(sessions, sets, { exerciseId: "bench", measure: "reps", period: "session", range: "all" }, NOW, "UTC");
    expect(result.points.map((point) => point.value)).toEqual([5, 10, 13]);
    expect(result.points.map((point) => point.trend)).toEqual([5, 7.5, 9.333333]);
  });

  it("falls back to volume when a max is asked of every lift", () => {
    expect(normalizeOptions({ exerciseId: ALL_LIFTS, measure: "e1rm", period: "week", range: "all" }).measure).toBe("volume");
    expect(normalizeOptions({ exerciseId: "bench", measure: "e1rm", period: "week", range: "all" }).measure).toBe("e1rm");
  });

  it("lists lifts by how often they are trained", () => {
    expect(liftChoices(sets).map((item) => [item.exerciseId, item.sessions])).toEqual([
      [ALL_LIFTS, 4],
      ["bench", 3],
      ["squat", 2],
    ]);
  });

  it("opens on the lift with the most volume", async () => {
    const { defaultLift } = await import("./index");
    expect(defaultLift(sets)).toBe("bench");
    expect(defaultLift(sets.filter((item) => item.exerciseId === "squat"))).toBe("squat");
    expect(defaultLift([])).toBe(ALL_LIFTS);
  });

  it("is empty when nothing matches", () => {
    const result = buildAnalytics(sessions, sets, { exerciseId: "nope", measure: "volume", period: "week", range: "all" }, NOW, "UTC");
    expect(result.points).toEqual([]);
    expect(result.summary.points).toBe(0);
  });
});

describe("analytics labels", () => {
  it("adds the year only when the chart crosses one", async () => {
    const { analyticsLabel } = await import("./index");
    expect(analyticsLabel("2026-03-04", "week", false)).toBe("Mar 4");
    expect(analyticsLabel("2025-03-04", "session", true)).toBe("Mar 4 '25");
    expect(analyticsLabel("2025-12-01", "month", true)).toBe("Dec '25");
    expect(analyticsLabel("2025-12-01", "month", false)).toBe("Dec");
  });
});
