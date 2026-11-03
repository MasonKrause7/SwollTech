import { describe, expect, it } from "vitest";
import { emptyData, ids } from "./fixtures";
import { toPayload } from "./payloads";
import { newPlans, planViews } from "./schedule";
import { newWorkout } from "./workouts";

describe("schedule on the phone", () => {
  it("repeats a plan weekly", () => {
    const rows = newPlans("w", "2026-11-02", 3, ids("p"));
    expect(rows.map((row) => row.scheduled_on)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(4);
    expect(toPayload("scheduled_workouts", { ...rows[0], updated_at: "T", user_id: "u" })).toEqual({ id: "p-1", workout_id: "w", scheduled_on: "2026-11-02", notes: "" });
  });

  it("joins plans with workouts and sessions", () => {
    const data = emptyData();
    data.workouts.push(newWorkout("push", "Push"), { ...newWorkout("gone", "Gone"), deleted_at: "2026-11-01T00:00:00Z" });
    data.schedule.push(
      { id: "b", workout_id: "push", scheduled_on: "2026-11-04", notes: "" },
      { id: "a", workout_id: "push", scheduled_on: "2026-11-02", notes: "" },
      { id: "c", workout_id: "gone", scheduled_on: "2026-11-04", notes: "" },
      { id: "d", workout_id: "push", scheduled_on: "2026-11-06", notes: "", deleted_at: "2026-11-01T00:00:00Z" },
    );
    data.sessions.push({ id: "s", workout_id: "push", name: "Push", status: "completed", started_at: "2026-11-02T17:00:00Z", ended_at: null, notes: "" });
    const views = planViews(data, "2026-11-04", "UTC");
    expect(views.map((view) => [view.plan.id, view.status.state])).toEqual([
      ["a", "done"],
      ["b", "today"],
    ]);
    expect(views[0].status.sessionId).toBe("s");
    expect(views[1].workout.name).toBe("Push");
  });
});
