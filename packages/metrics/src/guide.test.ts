import { describe, expect, it } from "vitest";
import { formatClock, matchingPrevious, nextInExercise, nextPosition, nextSetTemplate, parseAmount, prefill, progress, type GuideExercise, type GuideSet } from "./index";

function set(overrides: Partial<GuideSet> = {}): GuideSet {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "working",
    target_reps: null,
    target_weight: null,
    target_unit: null,
    rest_seconds: 120,
    actual_reps: null,
    actual_weight: null,
    actual_unit: null,
    skipped: false,
    completed_at: null,
    ...overrides,
  };
}
const done = (overrides: Partial<GuideSet> = {}) => set({ completed_at: "2026-10-20T12:00:00Z", ...overrides });

describe("next set", () => {
  it("walks exercises in order and skips finished or skipped sets", () => {
    const exercises: GuideExercise[] = [
      { id: "a", exercise_name: "Squat", sets: [done(), set({ skipped: true })] },
      { id: "b", exercise_name: "Bench", sets: [done(), set(), set()] },
    ];
    expect(nextPosition(exercises)).toEqual({ exerciseIndex: 1, setIndex: 1 });
    expect(nextInExercise(exercises[0])).toBeNull();
    expect(progress(exercises)).toEqual({ done: 3, total: 5, fraction: 0.6 });
  });

  it("returns null when the workout is finished", () => {
    expect(nextPosition([{ id: "a", exercise_name: "Squat", sets: [done()] }])).toBeNull();
    expect(nextPosition([])).toBeNull();
    expect(progress([]).fraction).toBe(0);
  });
});

describe("prefill", () => {
  it("prefers what was already logged", () => {
    const exercise = { id: "a", exercise_name: "Bench", sets: [set({ target_weight: 100, target_unit: "kg", actual_weight: 102.5, actual_unit: "kg", actual_reps: 4 })] };
    expect(prefill(exercise, 0, "lb")).toMatchObject({ weight: 102.5, reps: 4, unit: "kg", source: "logged" });
  });

  it("uses the plan and fills gaps from last time", () => {
    const exercise: GuideExercise = {
      id: "a",
      exercise_name: "Bench",
      sets: [set({ target_reps: 5 })],
      previous_sets: [done({ actual_weight: 185, actual_unit: "lb", actual_reps: 5 })],
    };
    expect(prefill(exercise, 0, "kg")).toMatchObject({ weight: 185, reps: 5, unit: "lb", source: "plan" });
  });

  it("matches last time by position among sets of the same kind", () => {
    const exercise: GuideExercise = {
      id: "a",
      exercise_name: "Squat",
      sets: [set({ kind: "warmup" }), set(), set()],
      previous_sets: [
        done({ kind: "warmup", actual_weight: 135, actual_unit: "lb", actual_reps: 5 }),
        done({ actual_weight: 275, actual_unit: "lb", actual_reps: 5 }),
        done({ actual_weight: 285, actual_unit: "lb", actual_reps: 3 }),
      ],
    };
    expect(prefill(exercise, 0, "lb")).toMatchObject({ weight: 135, source: "last-time" });
    expect(prefill(exercise, 2, "lb")).toMatchObject({ weight: 285, reps: 3, source: "last-time" });
    expect(matchingPrevious(exercise, 1)?.actual_weight).toBe(275);
  });

  it("falls back to the set just done, then to empty", () => {
    const exercise: GuideExercise = { id: "a", exercise_name: "Curl", sets: [done({ actual_weight: 30, actual_unit: "lb", actual_reps: 12 }), set()] };
    expect(prefill(exercise, 1, "lb")).toMatchObject({ weight: 30, reps: 12, source: "previous-set" });
    expect(prefill({ id: "b", exercise_name: "Dip", sets: [set()] }, 0, "kg")).toMatchObject({ weight: null, unit: "kg", source: "empty" });
    expect(prefill({ id: "b", exercise_name: "Dip", sets: [] }, 3, "kg").source).toBe("empty");
  });
});

describe("helpers", () => {
  it("templates an extra set from the last one", () => {
    const exercise = { id: "a", exercise_name: "Row", sets: [done({ actual_weight: 80, actual_unit: "kg" as const, actual_reps: 8, rest_seconds: 90 })] };
    expect(nextSetTemplate(exercise, "lb")).toEqual({ kind: "working", target_reps: 8, target_weight: 80, target_unit: "kg", rest_seconds: 90 });
    expect(nextSetTemplate({ id: "b", exercise_name: "Row", sets: [] }, "lb")).toEqual({ kind: "working", target_reps: null, target_weight: null, target_unit: null, rest_seconds: 120 });
  });

  it("formats the rest clock", () => {
    expect(formatClock(185)).toBe("3:05");
    expect(formatClock(-4)).toBe("0:00");
  });

  it("parses typed amounts", () => {
    expect(parseAmount("102,5")).toBe(102.5);
    expect(parseAmount(" 225 ")).toBe(225);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });
});
