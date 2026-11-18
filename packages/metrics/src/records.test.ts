import { describe, expect, it } from "vitest";
import { buildSessionReport, exerciseHistory, liftRecords, personalRecords, repMaxes, sessionHeadline, type StatSession, type StatSet } from "./index";

const BENCH = "bench";
const SQUAT = "squat";
let counter = 0;
function session(day: string, workoutId: string | null = "upper-a", minutes = 60): StatSession {
  counter += 1;
  const start = `${day}T12:00:00.000Z`;
  return {
    id: `r${String(counter).padStart(3, "0")}`,
    startedAt: start,
    endedAt: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
    name: "Upper A",
    workoutId,
  };
}
function lift(s: StatSession, weightKg: number, reps: number, exerciseId = BENCH): StatSet {
  return { sessionId: s.id, exerciseId, exerciseName: exerciseId === BENCH ? "Bench Press" : "Back Squat", muscle: "chest", weightKg, reps };
}

describe("estimated max cap", () => {
  it("never lets a high-rep set beat a real heavy set", () => {
    const a = session("2026-10-01");
    const b = session("2026-10-03");
    // Uncapped, 60 x 30 "estimates" 120 kg and beats 100 x 5 (116.7).
    const sets = [lift(a, 100, 5), lift(b, 60, 30)];
    expect(personalRecords([a, b], sets)).toEqual([]);
    expect(liftRecords([a, b], sets).filter((record) => record.type === "e1rm")).toEqual([]);
  });
});

describe("lift records", () => {
  it("treats the first session as a baseline for every type", () => {
    const a = session("2026-10-01");
    expect(liftRecords([a], [lift(a, 100, 5), lift(a, 60, 20)])).toEqual([]);
  });

  it("finds heaviest-weight records at any reps", () => {
    const a = session("2026-10-01");
    const b = session("2026-10-03");
    // 105 x 1 is a weight record but not an estimated-max record (105 < 116.7).
    const records = liftRecords([a, b], [lift(a, 100, 5), lift(b, 105, 1)]);
    expect(records.map((record) => record.type)).toEqual(["weight"]);
    expect(records[0]).toMatchObject({ weightKg: 105, reps: 1, previous: 100, sessionId: b.id });
  });

  it("finds rep records at a weight or heavier", () => {
    const a = session("2026-10-01");
    const b = session("2026-10-03");
    const c = session("2026-10-05");
    const sets = [lift(a, 100, 5), lift(a, 80, 8), lift(b, 80, 10), lift(b, 100, 5), lift(c, 90, 6)];
    const records = liftRecords([a, b, c], sets);
    // b: 80 x 10 beats 8 reps at 80+ (e1rm 106.7 < 116.7, so only a rep record).
    // c: 90 x 6 beats the 5 reps done at 90 or heavier (100 x 5), and its e1rm 108 is not a record.
    expect(records.map((record) => [record.sessionId, record.type, record.weightKg, record.reps, record.previous])).toEqual([
      [b.id, "reps", 80, 10, 8],
      [c.id, "reps", 90, 6, 5],
    ]);
  });

  it("counts rep records past the estimate cap", () => {
    const a = session("2026-10-01");
    const b = session("2026-10-03");
    const records = liftRecords([a, b], [lift(a, 0, 15, SQUAT), lift(b, 0, 20, SQUAT)]);
    expect(records.map((record) => record.type)).toEqual(["reps"]);
    expect(records[0].e1rmKg).toBeNull();
  });

  it("reports every type one set earns, in a stable order", () => {
    const a = session("2026-10-01");
    const b = session("2026-10-03");
    const records = liftRecords([b, a], [lift(a, 100, 5), lift(b, 110, 5), lift(a, 140, 5, SQUAT), lift(b, 145, 3, SQUAT)]);
    expect(records.map((record) => `${record.exerciseName}:${record.type}`)).toEqual(["Back Squat:weight", "Bench Press:e1rm", "Bench Press:weight"]);
    expect(records[1].previous).toBe(116.666667);
  });
});

describe("rep maxes", () => {
  it("is the heaviest set done for at least that many reps", () => {
    const a = session("2026-10-01");
    const b = session("2026-10-03");
    const table = repMaxes([a, b], [lift(a, 100, 5), lift(a, 80, 10), lift(b, 110, 2), lift(b, 100, 6)], BENCH);
    expect(table.map((row) => [row.reps, row.weightKg, row.actualReps])).toEqual([
      [1, 110, 2],
      [3, 100, 5],
      [5, 100, 5],
      [8, 80, 10],
      [10, 80, 10],
    ]);
    expect(table[2].sessionId).toBe(a.id);
    expect(repMaxes([a], [], BENCH)[0].weightKg).toBeNull();
  });
});

describe("exercise history", () => {
  it("groups sets by session, newest first, with best set and records", () => {
    const a = session("2026-10-01");
    const b = session("2026-10-03");
    const history = exerciseHistory([a, b], [lift(a, 100, 5), lift(a, 90, 8), lift(b, 110, 3), lift(b, 60, 30), lift(b, 140, 5, SQUAT)], BENCH);
    expect(history.map((row) => row.sessionId)).toEqual([b.id, a.id]);
    expect(history[0].sets).toEqual([
      { weightKg: 110, reps: 3 },
      { weightKg: 60, reps: 30 },
    ]);
    expect(history[0].best).toMatchObject({ weightKg: 110, reps: 3 });
    expect(history[0].volumeKg).toBe(2130);
    // 60 x 30 is also a rep record: more reps than ever at 60 kg or heavier.
    expect(history[0].records).toEqual(["e1rm", "weight", "reps"]);
    expect(history[1].records).toEqual([]);
  });
});

describe("session comparison", () => {
  it("compares with the last session of the same routine and each lift's history", () => {
    const a = session("2026-10-01", "upper-a", 60);
    const other = session("2026-10-02", "lower-a", 50);
    const b = session("2026-10-03", "upper-a", 70);
    const c = session("2026-10-05", "upper-a", 65);
    const sets = [
      lift(a, 100, 5),
      lift(a, 100, 5),
      lift(other, 140, 5, SQUAT),
      lift(b, 102.5, 5),
      lift(b, 100, 5),
      lift(b, 100, 5),
      lift(c, 140, 5, SQUAT),
      lift(c, 150, 5, SQUAT),
    ];
    const report = buildSessionReport(b, [a, other, b, c], sets);
    expect(report.previous).toMatchObject({ sessionId: a.id, sets: 2, volumeKg: 1000, setsDelta: 1, durationDeltaSeconds: 600 });
    expect(report.previous!.volumeDeltaPercent).toBe(51.3);
    const bench = report.exercises[0];
    expect(bench.best).toMatchObject({ weightKg: 102.5, reps: 5 });
    expect(bench.last).toMatchObject({ weightKg: 100, reps: 5 });
    expect(bench.vsBestPercent).toBe(2.5);
    expect(bench.standing).toBe("best");
    expect(bench.records).toEqual(["e1rm", "weight"]);
    expect(report.prs).toHaveLength(2);
    expect(sessionHeadline(report, "Upper A")).toBe("2 PRs, +51% volume vs last Upper A");

    // Squat in c: last time was "other" (a different routine), and 150 x 5 is a new best.
    const later = buildSessionReport(c, [a, other, b, c], sets);
    expect(later.previous?.sessionId).toBe(b.id);
    const squat = later.exercises[0];
    expect(squat.lastAt).toBe(other.startedAt);
    expect(squat.standing).toBe("best");
    expect(squat.vsLastPercent).toBe(7.1);
  });

  it("says how far below your best a lift was", () => {
    const a = session("2026-10-01");
    const b = session("2026-10-03");
    const report = buildSessionReport(b, [a, b], [lift(a, 100, 5), lift(b, 97.5, 5)]);
    expect(report.exercises[0].standing).toBe("below");
    expect(report.exercises[0].vsBestPercent).toBe(-2.5);
    expect(report.prs).toEqual([]);
    // 487.5 vs 500 kg is -2.5%, shown as a whole percent.
    expect(sessionHeadline(report, "Upper A")).toBe("\u22122% volume vs last Upper A");
  });

  it("has no comparison for the first time or a quick session", () => {
    const a = session("2026-10-01");
    const first = buildSessionReport(a, [a], [lift(a, 100, 5)]);
    expect(first.previous).toBeNull();
    expect(first.exercises[0].standing).toBe("first");
    expect(sessionHeadline(first, "Upper A")).toBe("First Upper A logged");

    const quickA = session("2026-10-02", null);
    const quickB = session("2026-10-04", null);
    const quick = buildSessionReport(quickB, [a, quickA, quickB], [lift(a, 100, 5), lift(quickA, 100, 5), lift(quickB, 100, 5)]);
    expect(quick.previous).toBeNull();
    expect(sessionHeadline(quick, "Quick workout")).toBe("1 working set across 1 lift");
  });

  it("keeps a lift with only high-rep sets in the summary", () => {
    const a = session("2026-10-01");
    const report = buildSessionReport(a, [a], [lift(a, 40, 20)]);
    expect(report.exercises[0]).toMatchObject({ bestE1rmKg: null, topWeightKg: 40, topReps: 20 });
  });
});
