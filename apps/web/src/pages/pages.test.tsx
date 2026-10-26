import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyOverview, fakeApi, makeSession, renderPage } from "../test/render";
import { AccountPage } from "./Account";
import { SignInPage, SignUpPage } from "./AuthPages";
import { HistoryPage } from "./History";
import { HomePage } from "./Home";
import { ProgressPage } from "./Progress";
import { SummaryPage } from "./Summary";
import { EditorPage } from "./Workouts";

const workout = { id: "w1", name: "Push day", notes: "", archived_at: null, updated_at: "2026-10-01T00:00:00Z" };

describe("Today", () => {
  it("invites you to write a first workout", async () => {
    renderPage(<HomePage />);
    expect(await screen.findByText(/No workouts yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Write a workout" })).toHaveAttribute("href", "/workouts/new");
  });

  it("starts a workout and opens the guided session", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      workouts: vi.fn(async () => [workout]),
      startSession: vi.fn(async () => makeSession({ id: "new-session" })),
    });
    renderPage(<HomePage />, { api });
    await user.click(await screen.findByTestId("start-Push day"));
    expect(api.startSession).toHaveBeenCalledWith("w1");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/sessions/new-session"));
  });

  it("offers to resume a session in progress and shows this week", async () => {
    const overview = emptyOverview();
    overview.totals = { ...overview.totals, sessions: 5, this_week_sessions: 2, this_week_volume_kg: 4535.9237, last_week_volume_kg: 4535.9237, current_streak_weeks: 3, records: 4 };
    const api = fakeApi({
      workouts: vi.fn(async () => [workout]),
      sessions: vi.fn(async () => [makeSession({ id: "live", name: "Push day" })]),
      overview: vi.fn(async () => overview),
    });
    renderPage(<HomePage />, { api });
    expect(await screen.findByTestId("resume")).toHaveAttribute("href", "/sessions/live");
    expect(await screen.findByText("sessions this week")).toBeInTheDocument();
    expect(screen.getByText("lifted, +0% on last week")).toBeInTheDocument();
    expect(screen.getByText("10k")).toBeInTheDocument();
  });
});

describe("Summary", () => {
  it("celebrates records in the user's unit", async () => {
    const api = fakeApi({
      sessionSummary: vi.fn(async () => ({
        session_id: "s1",
        name: "Push day",
        started_at: "2026-10-25T12:00:00Z",
        ended_at: "2026-10-25T13:05:00Z",
        duration_seconds: 3900,
        sets: 6,
        volume_kg: 2000,
        exercises: [{ exercise_id: "b", exercise_name: "Bench Press", sets: 3, best_e1rm_kg: 116.666667, top_weight_kg: 100, top_reps: 5 }],
        records: [
          { exercise_id: "b", exercise_name: "Bench Press", session_id: "s1", achieved_at: "2026-10-25T12:00:00Z", e1rm_kg: 116.666667, previous_e1rm_kg: 110, weight_kg: 100, reps: 5 },
        ],
      })),
    });
    renderPage(<SummaryPage />, { api, path: "/sessions/:sessionId/summary", route: "/sessions/s1/summary" });
    expect(await screen.findByTestId("summary-headline")).toHaveTextContent("1 new record.");
    expect(screen.getByTestId("record")).toHaveTextContent("220.5 lb for 5 reps");
    expect(screen.getByText("1 h 5 min")).toBeInTheDocument();
  });
});

describe("History", () => {
  it("lists sessions and links finished ones to their summary", async () => {
    const api = fakeApi({
      sessions: vi.fn(async () => [
        makeSession({ id: "a", status: "completed", name: "Legs" }),
        makeSession({ id: "b", status: "in_progress", name: "Arms" }),
      ]),
    });
    renderPage(<HistoryPage />, { api });
    expect((await screen.findByText("Legs")).closest("a")).toHaveAttribute("href", "/sessions/a/summary");
    expect(screen.getByText("Arms").closest("a")).toHaveAttribute("href", "/sessions/b");
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });
});

describe("Progress", () => {
  it("shows a starting point when nothing is logged", async () => {
    renderPage(<ProgressPage />);
    expect(await screen.findByText(/Finish your first workout/)).toBeInTheDocument();
  });

  it("lists lifts and records", async () => {
    const overview = emptyOverview();
    overview.totals = { ...overview.totals, sessions: 3, records: 1, current_streak_weeks: 2, longest_streak_weeks: 4 };
    overview.exercises = [{ exercise_id: "b", exercise_name: "Bench Press", muscle: "chest", sessions: 3, best_e1rm_kg: 100, last_performed_at: "2026-10-20T12:00:00Z" }] as never;
    overview.recent_records = [
      { exercise_id: "b", exercise_name: "Bench Press", session_id: "s", achieved_at: "2026-10-20T12:00:00Z", e1rm_kg: 100, previous_e1rm_kg: 95, weight_kg: 90, reps: 3 },
    ] as never;
    overview.muscle_split = [{ muscle: "chest", sets: 9, volume_kg: 1000 }] as never;
    renderPage(<ProgressPage />, { api: fakeApi({ overview: vi.fn(async () => overview) }) });
    expect(await screen.findByTestId("lift-Bench Press")).toHaveAttribute("href", "/progress/b");
    expect(screen.getByText("week streak, best 4")).toBeInTheDocument();
    expect(screen.getByText("9 sets")).toBeInTheDocument();
    expect(screen.getByText("Recent records")).toBeInTheDocument();
  });
});

describe("Workout editor", () => {
  it("creates a workout and moves to its page", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ createWorkout: vi.fn(async () => workout) });
    renderPage(<EditorPage />, { api, path: "/workouts/new" , route: "/workouts/new" });
    await user.type(screen.getByTestId("workout-name"), "Push day");
    await user.click(screen.getByTestId("save-workout"));
    expect(api.createWorkout).toHaveBeenCalledWith({ name: "Push day", notes: "" });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/workouts/w1"));
  });

  it("shows the API's reason when a name is taken", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ createWorkout: vi.fn(async () => Promise.reject(new Error("You already have a workout with that name"))) });
    renderPage(<EditorPage />, { api, path: "/workouts/new", route: "/workouts/new" });
    await user.type(screen.getByTestId("workout-name"), "Push day");
    await user.click(screen.getByTestId("save-workout"));
    expect(await screen.findByRole("alert")).toHaveTextContent("already have a workout");
  });
});

describe("Account", () => {
  it("only deletes after typing DELETE", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ deleteMe: vi.fn(async () => undefined) });
    const { auth } = renderPage(<AccountPage />, { api });
    const button = screen.getByRole("button", { name: "Delete my account" });
    expect(button).toBeDisabled();
    await user.type(screen.getByTestId("delete-confirm"), "DELETE");
    await user.click(button);
    await waitFor(() => expect(api.deleteMe).toHaveBeenCalled());
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("switches units", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ updateMe: vi.fn(async () => ({ id: "u1", display_name: "Mason", unit_preference: "kg", updated_at: "" })) });
    renderPage(<AccountPage />, { api });
    await user.click(await screen.findByTestId("unit-kg"));
    expect(api.updateMe).toHaveBeenCalledWith({ unit_preference: "kg" });
    expect(await screen.findByRole("status")).toHaveTextContent("Showing weights in kilograms");
  });
});

describe("Auth pages", () => {
  it("shows sign-in errors from Supabase", async () => {
    const user = userEvent.setup();
    renderPage(<SignInPage />, { path: "/signin", route: "/signin", auth: { signedIn: false, signInWithPassword: vi.fn(async () => "Invalid login credentials") } });
    await user.type(screen.getByTestId("email"), "a@b.co");
    await user.type(screen.getByTestId("password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
  });

  it("asks new users to confirm their email", async () => {
    const user = userEvent.setup();
    const signUp = vi.fn(async () => ({ error: null, needsConfirmation: true }));
    renderPage(<SignUpPage />, { path: "/signup", route: "/signup", auth: { signedIn: false, signUp } });
    await user.type(screen.getByLabelText("Email"), "new@lifter.co");
    await user.type(screen.getByLabelText(/^Password/), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(signUp).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(/^Password/));
    await user.type(screen.getByLabelText(/^Password/), "longenough");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(signUp).toHaveBeenCalledWith("new@lifter.co", "longenough", "");
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });

  it("sends signed-in users away from sign in", async () => {
    renderPage(<SignInPage />, { path: "/signin", route: "/signin" });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
  });
});
