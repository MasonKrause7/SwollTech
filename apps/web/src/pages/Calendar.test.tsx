import type { ScheduledWorkout } from "@swolltech/api-client";
import { addDays, localDay } from "@swolltech/metrics";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { timeZone } from "../format";
import { fakeApi, makeSession, renderPage } from "../test/render";
import { CalendarPage } from "./Calendar";
import { HomePage } from "./Home";

const today = localDay(new Date(), timeZone());
const push = { id: "w1", name: "Push day", notes: "", archived_at: null, updated_at: "2026-10-01T00:00:00Z" };
const pull = { id: "w2", name: "Pull day", notes: "", archived_at: null, updated_at: "2026-10-01T00:00:00Z" };

function plan(overrides: Partial<ScheduledWorkout> = {}): ScheduledWorkout {
  return {
    id: "p1",
    workout_id: "w1",
    workout_name: "Push day",
    workout_archived: false,
    scheduled_on: today,
    notes: "",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("Today with a plan", () => {
  it("offers to start today's planned workout", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      workouts: vi.fn(async () => [push]),
      schedule: vi.fn(async () => [plan({ notes: "Go heavy" })]),
      startSession: vi.fn(async () => makeSession({ id: "planned" })),
    });
    renderPage(<HomePage />, { api });
    const card = await screen.findByTestId("today-plan");
    expect(card).toHaveTextContent("Push day");
    expect(card).toHaveTextContent("Go heavy");
    await user.click(within(card).getByRole("button", { name: "Start today's workout" }));
    expect(api.startSession).toHaveBeenCalledWith("w1");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sessions/planned"));
  });

  it("hides the card once today's workout is logged and points at the next one", async () => {
    const api = fakeApi({
      workouts: vi.fn(async () => [push, pull]),
      sessions: vi.fn(async () => [makeSession({ id: "done", workout_id: "w1", status: "completed", started_at: new Date().toISOString() })]),
      schedule: vi.fn(async () => [plan(), plan({ id: "p2", workout_id: "w2", workout_name: "Pull day", scheduled_on: addDays(today, 2) })]),
    });
    renderPage(<HomePage />, { api });
    expect(await screen.findByTestId("plan-hint")).toHaveTextContent(/Today's plan is done\. Next up: Pull day/);
    expect(screen.queryByTestId("today-plan")).not.toBeInTheDocument();
  });

  it("nudges you to plan when nothing is on the calendar", async () => {
    renderPage(<HomePage />, { api: fakeApi({ workouts: vi.fn(async () => [push]) }) });
    expect(await screen.findByTestId("plan-hint")).toHaveAttribute("href", "/calendar");
    expect(screen.getByTestId("plan-hint")).toHaveTextContent("Nothing planned");
  });
});

describe("Calendar", () => {
  it("plans a workout on the chosen day, repeating weekly", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      workouts: vi.fn(async () => [push, pull]),
      scheduleWorkout: vi.fn(async () => []),
    });
    renderPage(<CalendarPage />, { api });
    const detail = await screen.findByTestId("day-detail");
    await user.selectOptions(within(detail).getByLabelText("Workout"), "w2");
    await user.selectOptions(within(detail).getByLabelText(/^Repeat every/), "3");
    await user.click(within(detail).getByRole("button", { name: "Add to today" }));
    expect(api.scheduleWorkout).toHaveBeenCalledWith({ workout_id: "w2", scheduled_on: today, repeat_weeks: 3 });
    expect(api.schedule).toHaveBeenCalledTimes(2);
  });

  it("shows what happened to each plan and lets you remove one", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      workouts: vi.fn(async () => [push]),
      sessions: vi.fn(async () => [makeSession({ id: "done", workout_id: "w1", status: "completed", started_at: new Date().toISOString() })]),
      schedule: vi.fn(async () => [plan()]),
      deleteScheduled: vi.fn(async () => undefined),
    });
    renderPage(<CalendarPage />, { api });
    const detail = await screen.findByTestId("day-detail");
    expect(await within(detail).findByText("Done")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "View" })).toHaveAttribute("href", "/sessions/done/summary");
    await user.click(within(detail).getByRole("button", { name: "Remove Push day" }));
    expect(api.deleteScheduled).toHaveBeenCalledWith("p1");
  });

  it("selects another day from the grid", async () => {
    const user = userEvent.setup();
    const tomorrow = addDays(today, 1);
    const api = fakeApi({ workouts: vi.fn(async () => [push]), schedule: vi.fn(async () => [plan({ scheduled_on: tomorrow })]) });
    renderPage(<CalendarPage />, { api });
    const day = await screen.findByRole("button", { name: /Push day, planned/ });
    await user.click(day);
    expect(day).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("day-detail")).getByText("Planned")).toBeInTheDocument();
    expect(within(screen.getByTestId("day-detail")).getByText("Coming up")).toBeInTheDocument();
  });
});
