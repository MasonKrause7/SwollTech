/** The training calendar from rows on the phone. No React Native imports. */
import { addDays, planStates, type PlanStatus } from "@swolltech/metrics";
import { live, type ScheduledWorkoutRow, type WorkoutRow } from "./rows";
import type { LocalData } from "./session";

export interface PlanView {
  plan: ScheduledWorkoutRow;
  workout: WorkoutRow;
  status: PlanStatus;
}

/** Every live plan with its workout and state, in day order. Plans for deleted workouts are dropped. */
export function planViews(data: Pick<LocalData, "schedule" | "workouts" | "sessions">, today: string, timeZone: string): PlanView[] {
  const workouts = new Map(live(data.workouts).map((row) => [row.id, row]));
  const plans = live(data.schedule)
    .filter((row) => workouts.has(row.workout_id))
    .sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on) || a.id.localeCompare(b.id));
  const states = planStates(
    plans.map((row) => ({ id: row.id, workoutId: row.workout_id, day: row.scheduled_on })),
    live(data.sessions).map((row) => ({ id: row.id, workoutId: row.workout_id, status: row.status, startedAt: row.started_at })),
    today,
    timeZone,
  );
  return plans.map((plan) => ({ plan, workout: workouts.get(plan.workout_id)!, status: states.get(plan.id)! }));
}

/** Plans for one workout on `day` and the same weekday for `repeatWeeks` more weeks. */
export function newPlans(workoutId: string, day: string, repeatWeeks: number, newId: () => string): ScheduledWorkoutRow[] {
  return Array.from({ length: repeatWeeks + 1 }, (_, week) => ({
    id: newId(),
    workout_id: workoutId,
    scheduled_on: addDays(day, week * 7),
    notes: "",
  }));
}
