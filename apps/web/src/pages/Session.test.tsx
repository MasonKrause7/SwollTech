import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Session, SessionSet } from "@swolltech/api-client";
import { fakeApi, makeSession, makeSet, renderPage } from "../test/render";
import { SessionPage } from "./Session";

function benchSession(): Session {
  return makeSession({
    exercises: [
      {
        id: "e1",
        exercise_id: "bench",
        exercise_name: "Bench Press",
        position: 0,
        notes: "",
        updated_at: "2026-10-25T12:00:00Z",
        sets: [
          makeSet({ id: "a", target_reps: 5, target_weight: 185, target_unit: "lb", rest_seconds: 120 }),
          makeSet({ id: "b", target_reps: 5, target_weight: 185, target_unit: "lb" }),
        ],
        previous_sets: [makeSet({ id: "p", actual_weight: 180, actual_unit: "lb", actual_reps: 5, completed_at: "2026-10-20T12:00:00Z" })],
      },
      {
        id: "e2",
        exercise_id: "row",
        exercise_name: "Barbell Row",
        position: 1,
        notes: "",
        updated_at: "2026-10-25T12:00:00Z",
        sets: [makeSet({ id: "c", target_reps: 8 })],
        previous_sets: [],
      },
    ],
  });
}

function setup(session = benchSession(), extra = {}) {
  let current = session;
  const updateSessionSet = vi.fn(async (id: string, body: Record<string, unknown>) => {
    const done: Partial<SessionSet> = body.skipped
      ? { skipped: true }
      : {
          actual_weight: body.actual_weight as number,
          actual_unit: body.actual_unit as "lb",
          actual_reps: body.actual_reps as number,
          rpe: (body.rpe as number) ?? null,
          completed_at: "2026-10-25T12:10:00Z",
        };
    let updated: SessionSet | undefined;
    current = {
      ...current,
      exercises: current.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((item) => {
          if (item.id !== id) return item;
          updated = { ...item, ...done, updated_at: "2026-10-25T12:10:00Z" };
          return updated;
        }),
      })),
    };
    return updated!;
  });
  const api = fakeApi({
    session: vi.fn(async () => current),
    updateSessionSet,
    updateSession: vi.fn(async () => ({ ...current, status: "completed" })),
    ...extra,
  });
  return renderPage(<SessionPage />, { api, path: "/sessions/:sessionId", route: "/sessions/s1" });
}

describe("guided session", () => {
  it("opens on the first open set with the plan and last time prefilled", async () => {
    setup();
    expect(await screen.findByTestId("focus-exercise")).toHaveTextContent("Bench Press");
    expect(screen.getByTestId("focus-set")).toHaveTextContent("Set 1 of 2");
    expect(screen.getByTestId("weight-0")).toHaveValue("185");
    expect(screen.getByTestId("reps-0")).toHaveValue("5");
    expect(screen.getByTestId("previous-sets")).toHaveTextContent("180 lb × 5");
    expect(screen.getByRole("figure", { name: /Each side: 45 \+ 25 lb/ })).toBeInTheDocument();
  });

  it("steps weight by 5 lb and reps by 1", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId("focus-exercise");
    await user.click(screen.getByRole("button", { name: "More weight" }));
    expect(screen.getByTestId("weight-0")).toHaveValue("190");
    await user.click(screen.getByRole("button", { name: "Less reps" }));
    expect(screen.getByTestId("reps-0")).toHaveValue("4");
  });

  it("logs a set, starts the rest timer, and moves to the next set", async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await screen.findByTestId("focus-exercise");
    await user.click(screen.getByRole("button", { name: "8" }));
    await user.click(screen.getByTestId("done-0"));
    expect(api.updateSessionSet).toHaveBeenCalledWith("a", {
      actual_weight: 185,
      actual_unit: "lb",
      actual_reps: 5,
      rpe: 8,
      skipped: false,
      completed: true,
    });
    expect(await screen.findByTestId("rest-timer")).toHaveTextContent("2:00");
    await waitFor(() => expect(screen.getByTestId("focus-set")).toHaveTextContent("Set 2 of 2"));
    expect(screen.getByText("1 of 3 sets done")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Skip rest" }));
    expect(screen.queryByTestId("rest-timer")).not.toBeInTheDocument();
  });

  it("moves to the next exercise after the last set and skips without logging numbers", async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await screen.findByTestId("focus-exercise");
    await user.click(screen.getByRole("button", { name: /^Skip$/ }));
    await user.click(await screen.findByRole("button", { name: /^Skip$/ }));
    expect(api.updateSessionSet).toHaveBeenNthCalledWith(1, "a", { skipped: true });
    await waitFor(() => expect(screen.getByTestId("focus-exercise")).toHaveTextContent("Barbell Row"));
    expect(screen.queryByTestId("rest-timer")).not.toBeInTheDocument();
  });

  it("refuses to log without reps", async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await screen.findByTestId("focus-exercise");
    await user.clear(screen.getByTestId("reps-0"));
    await user.click(screen.getByTestId("done-0"));
    expect(screen.getByRole("alert")).toHaveTextContent("whole number of reps");
    expect(api.updateSessionSet).not.toHaveBeenCalled();
  });

  it("jumps to another exercise from the list", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId("focus-exercise");
    const nav = screen.getByRole("complementary", { name: "Exercises in this workout" });
    await user.click(within(nav).getByRole("button", { name: /Barbell Row/ }));
    expect(screen.getByTestId("focus-exercise")).toHaveTextContent("Barbell Row");
    expect(screen.getByTestId("previous-sets")).toHaveTextContent("first time");
  });

  it("asks before finishing with open sets, then shows the summary", async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await screen.findByTestId("focus-exercise");
    await user.click(screen.getByTestId("finish-session"));
    expect(screen.getByText("3 sets still open. They will not count toward your stats.")).toBeInTheDocument();
    await user.click(screen.getByTestId("confirm"));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sessions/s1/summary"));
    expect(api.updateSession).toHaveBeenCalledWith("s1", { status: "completed" });
  });

  it("shows a finished session read-only", async () => {
    const session = benchSession();
    session.status = "completed";
    setup(session);
    await screen.findByText(/Finished, started/);
    expect(screen.queryByTestId("focus-exercise")).not.toBeInTheDocument();
    expect(screen.queryByTestId("finish-session")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View summary" })).toHaveAttribute("href", "/sessions/s1/summary");
  });
});
