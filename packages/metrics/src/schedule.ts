/**
 * The training calendar. A plan is one workout on one local day. Whether it
 * happened is read from sessions: a session of the same workout that started
 * on the same local day fulfils it. Web and phone both use this so they agree.
 */
import { addDays, localDay, weekStart } from "./stats";

export type PlanState = "done" | "in_progress" | "today" | "missed" | "upcoming";

export interface PlanInput {
  id: string;
  workoutId: string;
  day: string;
}

export interface PlanSession {
  id: string;
  workoutId: string | null;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
}

export interface PlanStatus {
  state: PlanState;
  sessionId: string | null;
}

/** Give each plan a state. Two plans of one workout on one day need two sessions. */
export function planStates(plans: PlanInput[], sessions: PlanSession[], today: string, timeZone: string): Map<string, PlanStatus> {
  const byKey = new Map<string, PlanSession[]>();
  const ordered = sessions
    .filter((session) => session.workoutId && session.status !== "abandoned")
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  for (const session of ordered) {
    const key = `${localDay(session.startedAt, timeZone)}|${session.workoutId}`;
    byKey.set(key, [...(byKey.get(key) ?? []), session]);
  }
  const used = new Map<string, number>();
  const result = new Map<string, PlanStatus>();
  for (const plan of plans) {
    const key = `${plan.day}|${plan.workoutId}`;
    const index = used.get(key) ?? 0;
    const match = byKey.get(key)?.[index];
    used.set(key, index + 1);
    if (match) {
      result.set(plan.id, { state: match.status === "completed" ? "done" : "in_progress", sessionId: match.id });
    } else {
      const state: PlanState = plan.day < today ? "missed" : plan.day === today ? "today" : "upcoming";
      result.set(plan.id, { state, sessionId: null });
    }
  }
  return result;
}

/** "2026-11" plus or minus whole months. */
export function shiftMonth(month: string, months: number): string {
  const [year, mon] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Monday-first weeks covering a month, padded with days from the months either side. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;
  const weeks: string[][] = [];
  for (let start = weekStart(first); start < next; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, offset) => addDays(start, offset)));
  }
  return weeks;
}
