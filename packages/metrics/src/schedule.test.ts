import { describe, expect, it } from "vitest";
import { monthGrid, planStates, shiftMonth, type PlanSession } from "./index";

const TODAY = "2026-11-04";

function session(id: string, workoutId: string, startedAt: string, status: PlanSession["status"] = "completed"): PlanSession {
  return { id, workoutId, startedAt, status };
}

describe("plan states", () => {
  it("reads past, today and future plans with no sessions", () => {
    const states = planStates(
      [
        { id: "a", workoutId: "push", day: "2026-11-02" },
        { id: "b", workoutId: "push", day: TODAY },
        { id: "c", workoutId: "push", day: "2026-11-06" },
      ],
      [],
      TODAY,
      "UTC",
    );
    expect(states.get("a")?.state).toBe("missed");
    expect(states.get("b")?.state).toBe("today");
    expect(states.get("c")?.state).toBe("upcoming");
  });

  it("matches sessions of the same workout on the same local day", () => {
    const states = planStates(
      [
        { id: "a", workoutId: "push", day: "2026-11-02" },
        { id: "b", workoutId: "pull", day: "2026-11-03" },
        { id: "c", workoutId: "legs", day: TODAY },
      ],
      [
        session("s1", "push", "2026-11-02T18:00:00Z"),
        session("s2", "push", "2026-11-03T18:00:00Z"),
        session("s3", "legs", "2026-11-04T09:00:00Z", "in_progress"),
      ],
      TODAY,
      "UTC",
    );
    expect(states.get("a")).toEqual({ state: "done", sessionId: "s1" });
    expect(states.get("b")?.state).toBe("missed");
    expect(states.get("c")).toEqual({ state: "in_progress", sessionId: "s3" });
  });

  it("uses the time zone for the session day", () => {
    const plans = [{ id: "a", workoutId: "push", day: "2026-11-03" }];
    const late = [session("s1", "push", "2026-11-04T02:30:00Z")];
    expect(planStates(plans, late, TODAY, "UTC").get("a")?.state).toBe("missed");
    expect(planStates(plans, late, TODAY, "America/Detroit").get("a")?.state).toBe("done");
  });

  it("needs one session per plan and ignores abandoned ones", () => {
    const states = planStates(
      [
        { id: "am", workoutId: "push", day: TODAY },
        { id: "pm", workoutId: "push", day: TODAY },
      ],
      [session("x", "push", "2026-11-04T07:00:00Z", "abandoned"), session("s1", "push", "2026-11-04T08:00:00Z")],
      TODAY,
      "UTC",
    );
    expect(states.get("am")?.state).toBe("done");
    expect(states.get("pm")?.state).toBe("today");
  });
});

describe("month grid", () => {
  it("covers the month in Monday-first weeks", () => {
    const weeks = monthGrid("2026-11");
    expect(weeks[0][0]).toBe("2026-10-26");
    expect(weeks.at(-1)!.at(-1)).toBe("2026-12-06");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat()).toContain("2026-11-30");
  });

  it("does not add a trailing week when the month ends on Sunday", () => {
    expect(monthGrid("2026-05").at(-1)!.at(-1)).toBe("2026-05-31");
  });

  it("shifts months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", -13)).toBe("2025-10");
  });
});
