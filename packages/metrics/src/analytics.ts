/**
 * Custom charts for the Progress "Analyze" panel. Web and phone both build their chart
 * from this so a lifter sees the same numbers on either.
 *
 * Input is the same log buildOverview takes: completed sessions and counted working sets.
 * Weights stay in kilograms; the clients convert for display.
 */
import { epley, round6 } from "./index";
import { addDays, localDay, weekStart, type StatSession, type StatSet } from "./stats";

export type AnalyticsMeasure = "e1rm" | "topSet" | "volume" | "sets" | "reps" | "sessions";
export type AnalyticsPeriod = "session" | "week" | "month";
export type AnalyticsRange = "3m" | "6m" | "1y" | "all";
export type AnalyticsChartType = "line" | "bar" | "area";

/** "all" means every lift together. */
export const ALL_LIFTS = "all";

export interface MeasureInfo {
  id: AnalyticsMeasure;
  label: string;
  /** What the number is: a weight in kg, or a plain count. */
  kind: "weight" | "count";
  /** How a week or month is rolled up from its sessions. */
  rollup: "max" | "sum";
  /** Needs one lift picked. Estimated max of "all lifts" means nothing. */
  needsLift: boolean;
  description: string;
}

export const MEASURES: MeasureInfo[] = [
  { id: "e1rm", label: "Estimated max", kind: "weight", rollup: "max", needsLift: true, description: "Best Epley estimate from working sets of 12 reps or fewer" },
  { id: "topSet", label: "Top weight", kind: "weight", rollup: "max", needsLift: true, description: "Heaviest working set" },
  { id: "volume", label: "Volume", kind: "weight", rollup: "sum", needsLift: false, description: "Weight times reps, working sets only" },
  { id: "sets", label: "Sets", kind: "count", rollup: "sum", needsLift: false, description: "Working sets completed" },
  { id: "reps", label: "Reps", kind: "count", rollup: "sum", needsLift: false, description: "Working reps completed" },
  { id: "sessions", label: "Frequency", kind: "count", rollup: "sum", needsLift: false, description: "Sessions trained" },
];

export const PERIODS: { id: AnalyticsPeriod; label: string }[] = [
  { id: "session", label: "Session" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export const RANGES: { id: AnalyticsRange; label: string; months: number | null }[] = [
  { id: "3m", label: "3M", months: 3 },
  { id: "6m", label: "6M", months: 6 },
  { id: "1y", label: "1Y", months: 12 },
  { id: "all", label: "All", months: null },
];

export const CHART_TYPES: { id: AnalyticsChartType; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "bar", label: "Bar" },
  { id: "area", label: "Area" },
];

/** Buckets averaged for the trend line. */
export const TREND_WINDOW = 4;

export interface AnalyticsOptions {
  exerciseId: string;
  measure: AnalyticsMeasure;
  period: AnalyticsPeriod;
  range: AnalyticsRange;
}

export interface AnalyticsPoint {
  /** Session start (ISO) for "session", else the first day of the week or month (YYYY-MM-DD). */
  key: string;
  /** Day the point is plotted at (YYYY-MM-DD). */
  day: string;
  /** null when nothing was logged and the measure is a max (a gap, not a zero). */
  value: number | null;
  /** Moving average over the last TREND_WINDOW points that have a value. */
  trend: number | null;
}

export interface AnalyticsSummary {
  /** Sum for sum measures; best for max measures. */
  total: number | null;
  /** Mean of the points that have a value. */
  average: number | null;
  best: number | null;
  first: number | null;
  latest: number | null;
  /** Percent change from the first point with a value to the latest one. */
  changePercent: number | null;
  /** Points that have a value. */
  points: number;
}

/** Whether average, latest and change describe completed weeks or months only. */
export function summaryIsSettled(period: AnalyticsPeriod) {
  return period !== "session";
}

export interface AnalyticsResult {
  measure: MeasureInfo;
  options: AnalyticsOptions;
  points: AnalyticsPoint[];
  summary: AnalyticsSummary;
}

export interface LiftChoice {
  exerciseId: string;
  exerciseName: string;
  sessions: number;
}

export function measureInfo(id: AnalyticsMeasure): MeasureInfo {
  return MEASURES.find((item) => item.id === id) ?? MEASURES[0];
}

/** Lifts the user has logged, most trained first, with "All lifts" on top. */
export function liftChoices(sets: StatSet[]): LiftChoice[] {
  const seen = new Map<string, { name: string; sessions: Set<string> }>();
  for (const item of sets) {
    const entry = seen.get(item.exerciseId) ?? { name: item.exerciseName, sessions: new Set<string>() };
    entry.sessions.add(item.sessionId);
    seen.set(item.exerciseId, entry);
  }
  const lifts = [...seen.entries()]
    .map(([exerciseId, entry]) => ({ exerciseId, exerciseName: entry.name, sessions: entry.sessions.size }))
    .sort((a, b) => b.sessions - a.sessions || (a.exerciseName < b.exerciseName ? -1 : 1));
  const allSessions = new Set(sets.map((item) => item.sessionId)).size;
  return [{ exerciseId: ALL_LIFTS, exerciseName: "All lifts", sessions: allSessions }, ...lifts];
}

/** The lift to open the chart on: the one with the most total volume, usually a main barbell lift. */
export function defaultLift(sets: StatSet[]): string {
  const volume = new Map<string, number>();
  for (const item of sets) volume.set(item.exerciseId, (volume.get(item.exerciseId) ?? 0) + item.weightKg * item.reps);
  let best: string = ALL_LIFTS;
  let top = -1;
  for (const [exerciseId, total] of volume) {
    if (total > top) {
      best = exerciseId;
      top = total;
    }
  }
  return best;
}

/**
 * Settle a picked combination into one that makes sense. Asking for the estimated max of
 * every lift together falls back to volume, so the chart is never empty for a silly reason.
 */
export function normalizeOptions(options: AnalyticsOptions): AnalyticsOptions {
  const info = measureInfo(options.measure);
  if (info.needsLift && options.exerciseId === ALL_LIFTS) return { ...options, measure: "volume" };
  return options;
}

function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

function nextMonth(day: string) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

function monthsBack(day: string, months: number) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7)) - 1 - months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const dayOfMonth = Math.min(Number(day.slice(8, 10)), lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}

interface SessionTotals {
  e1rm: number | null;
  topSet: number | null;
  volume: number;
  sets: number;
  reps: number;
}

function valueOf(measure: AnalyticsMeasure, totals: SessionTotals): number | null {
  switch (measure) {
    case "e1rm":
      return totals.e1rm;
    case "topSet":
      return totals.topSet;
    case "volume":
      return round6(totals.volume / 1e6);
    case "sets":
      return totals.sets;
    case "reps":
      return totals.reps;
    case "sessions":
      return 1;
  }
}

/**
 * Total and best use every point. Average, latest and change skip `partial` (the week or
 * month still under way) so three sessions into November do not read as an 80% drop.
 */
function summarize(points: AnalyticsPoint[], info: MeasureInfo, partial: boolean): AnalyticsSummary {
  const values = points.map((point) => point.value).filter((value): value is number => value != null);
  if (!values.length) return { total: null, average: null, best: null, first: null, latest: null, changePercent: null, points: 0 };
  const settled = (partial && points.length > 1 ? points.slice(0, -1) : points).map((point) => point.value).filter((value): value is number => value != null);
  const basis = settled.length ? settled : values;
  const sum = values.reduce((total, value) => total + value, 0);
  const basisSum = basis.reduce((total, value) => total + value, 0);
  const best = Math.max(...values);
  const first = basis[0];
  const latest = basis[basis.length - 1];
  return {
    total: info.rollup === "sum" ? round6(sum) : best,
    average: round6(basisSum / basis.length),
    best,
    first,
    latest,
    changePercent: first > 0 && basis.length > 1 ? round6(((latest - first) / first) * 100) : null,
    points: values.length,
  };
}

function withTrend(points: Omit<AnalyticsPoint, "trend">[]): AnalyticsPoint[] {
  const recent: number[] = [];
  return points.map((point) => {
    if (point.value != null) {
      recent.push(point.value);
      if (recent.length > TREND_WINDOW) recent.shift();
    }
    const trend = recent.length && point.value != null ? round6(recent.reduce((a, b) => a + b, 0) / recent.length) : null;
    return { ...point, trend };
  });
}

export function buildAnalytics(sessions: StatSession[], sets: StatSet[], picked: AnalyticsOptions, now: Date, timeZone: string): AnalyticsResult {
  const options = normalizeOptions(picked);
  const info = measureInfo(options.measure);
  const today = localDay(now, timeZone);
  const months = RANGES.find((item) => item.id === options.range)?.months ?? null;
  const rangeStart = months == null ? null : monthsBack(today, months);
  const allLifts = options.exerciseId === ALL_LIFTS;

  const perSession = new Map<string, SessionTotals>();
  for (const item of sets) {
    if (!allLifts && item.exerciseId !== options.exerciseId) continue;
    const totals = perSession.get(item.sessionId) ?? { e1rm: null, topSet: null, volume: 0, sets: 0, reps: 0 };
    const estimate = epley(item.weightKg, item.reps);
    if (estimate != null && (totals.e1rm == null || estimate > totals.e1rm)) totals.e1rm = estimate;
    if (totals.topSet == null || item.weightKg > totals.topSet) totals.topSet = item.weightKg;
    totals.volume += Math.round(item.weightKg * 1e6) * item.reps;
    totals.sets += 1;
    totals.reps += item.reps;
    perSession.set(item.sessionId, totals);
  }

  const logged = sessions
    .filter((session) => perSession.has(session.id))
    .map((session) => ({ session, day: localDay(session.startedAt, timeZone) }))
    .filter((row) => row.day <= today && (rangeStart == null || row.day >= rangeStart))
    .sort((a, b) => Date.parse(a.session.startedAt) - Date.parse(b.session.startedAt) || (a.session.id < b.session.id ? -1 : 1));

  if (options.period === "session") {
    const points = logged.map(({ session, day }) => ({ key: session.startedAt, day, value: valueOf(info.id, perSession.get(session.id)!) }));
    return { measure: info, options, points: withTrend(points), summary: summarize(points.map((p) => ({ ...p, trend: null })), info, false) };
  }

  const bucketOf = options.period === "week" ? weekStart : monthStart;
  const step = options.period === "week" ? (day: string) => addDays(day, 7) : nextMonth;
  const buckets = new Map<string, number | null>();
  const firstDay = rangeStart ?? logged[0]?.day;
  if (firstDay) {
    for (let key = bucketOf(firstDay); key <= today; key = step(key)) buckets.set(key, info.rollup === "sum" ? 0 : null);
  }
  for (const { session, day } of logged) {
    const key = bucketOf(day);
    const value = valueOf(info.id, perSession.get(session.id)!);
    if (value == null) continue;
    const current = buckets.get(key) ?? null;
    buckets.set(key, info.rollup === "sum" ? round6((current ?? 0) + value) : current == null ? value : Math.max(current, value));
  }
  const points = [...buckets.entries()].map(([key, value]) => ({ key, day: key, value }));
  // A week with no training is a real zero for sums but should not drag the trend down to
  // nothing when the range starts before the first session, so leading empty buckets go.
  const firstLogged = points.findIndex((point) => point.value != null && point.value !== 0);
  const trimmed = rangeStart == null && firstLogged > 0 ? points.slice(firstLogged) : points;
  return { measure: info, options, points: withTrend(trimmed), summary: summarize(trimmed.map((p) => ({ ...p, trend: null })), info, trimmed.length > 0 && trimmed[trimmed.length - 1].day === bucketOf(today)) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Axis label for a point: "Mar 4" for sessions and weeks, "Mar" for months. When the
 * chart spans more than one year, a short year is added ("Mar 4 '25", "Mar '25").
 */
export function analyticsLabel(day: string, period: AnalyticsPeriod, multiYear: boolean) {
  const month = MONTHS[Number(day.slice(5, 7)) - 1] ?? "";
  const year = multiYear ? ` '${day.slice(2, 4)}` : "";
  if (period === "month") return `${month}${year}`;
  return `${month} ${Number(day.slice(8, 10))}${year}`;
}

/** True when the points cover more than one calendar year. */
export function spansYears(points: AnalyticsPoint[]) {
  return points.length > 1 && points[0].day.slice(0, 4) !== points[points.length - 1].day.slice(0, 4);
}
