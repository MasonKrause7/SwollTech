import { useQuery } from "@tanstack/react-query";
import {
  ALL_LIFTS,
  CHART_TYPES,
  MEASURES,
  PERIODS,
  RANGES,
  analyticsLabel,
  buildAnalytics,
  defaultLift,
  liftChoices,
  spansYears,
  summaryIsSettled,
  type AnalyticsChartType,
  type AnalyticsMeasure,
  type AnalyticsPeriod,
  type AnalyticsRange,
  type StatSession,
  type StatSet,
} from "@swolltech/metrics";
import { useMemo, useState } from "react";
import { useApi } from "../auth";
import { convert, timeZone, trimNumber, type WeightUnit } from "../format";
import { keys } from "../hooks";
import { AnalyticsChart } from "./Charts";
import { LoadError } from "./Feedback";

function Segmented<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (next: T) => void; disabled?: (id: T) => string | null }) {
  return (
    <div className="analyze-field">
      <span>{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => {
          const reason = disabled?.(option.id) ?? null;
          return (
            <button key={option.id} type="button" aria-pressed={value === option.id} disabled={reason != null} title={reason ?? undefined} onClick={() => onChange(option.id)}>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Custom charts on the Progress page: pick a lift, what to measure, how to group it and how to draw it. */
export function AnalyzePanel({ unit }: { unit: WeightUnit }) {
  const api = useApi();
  const log = useQuery({ queryKey: keys.statsLog, queryFn: () => api.statsLog() });
  const data = useMemo(() => {
    if (!log.data) return null;
    const sessions: StatSession[] = log.data.sessions.map((row) => ({ id: row.id, startedAt: row.started_at }));
    const sets: StatSet[] = log.data.sets.map((row) => ({
      sessionId: row.session_id,
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      muscle: row.muscle,
      weightKg: row.weight_kg,
      reps: row.reps,
    }));
    return { sessions, sets, lifts: liftChoices(sets), defaultLift: defaultLift(sets) };
  }, [log.data]);

  const [picked, setPicked] = useState<string | null>(null);
  const [measure, setMeasure] = useState<AnalyticsMeasure>("e1rm");
  const [period, setPeriod] = useState<AnalyticsPeriod>("week");
  const [range, setRange] = useState<AnalyticsRange>("1y");
  const [chart, setChart] = useState<AnalyticsChartType>("line");
  const [trend, setTrend] = useState(true);

  const exerciseId = picked ?? data?.defaultLift ?? ALL_LIFTS;
  const result = useMemo(
    () => (data ? buildAnalytics(data.sessions, data.sets, { exerciseId, measure, period, range }, new Date(), timeZone()) : null),
    [data, exerciseId, measure, period, range],
  );

  if (log.error) return <LoadError error={log.error} retry={() => log.refetch()} />;
  if (!data || !result) return <section className="panel stack" aria-busy="true"><h2>Analyze</h2><p className="muted">Loading your full history…</p></section>;

  const info = result.measure;
  const isWeight = info.kind === "weight";
  const show = (value: number | null) => (value == null ? null : isWeight ? convert(value, unit) : value);
  const format = (value: number) => (isWeight ? `${trimNumber(value, 0)} ${unit}` : trimNumber(value, 1));
  const multiYear = spansYears(result.points);
  const points = result.points.map((point) => ({ label: analyticsLabel(point.day, period, multiYear), value: show(point.value), trend: show(point.trend) }));
  const liftName = data.lifts.find((lift) => lift.exerciseId === exerciseId)?.exerciseName ?? "Lift";
  const summary = result.summary;
  const per = period;
  const settled = summaryIsSettled(period);
  const unitSuffix = isWeight ? ` (${unit})` : "";

  return (
    <section className="panel stack" data-testid="analyze">
      <div className="section-head">
        <h2>Analyze</h2>
        <span className="small muted">{info.description}</span>
      </div>

      <div className="analyze-controls">
        <label>
          Lift
          <select aria-label="Lift" value={exerciseId} onChange={(event) => setPicked(event.target.value)}>
            {data.lifts.map((lift) => (
              <option key={lift.exerciseId} value={lift.exerciseId}>
                {lift.exerciseName} ({lift.sessions})
              </option>
            ))}
          </select>
        </label>
        <Segmented label="Measure" value={info.id} options={MEASURES} onChange={setMeasure} disabled={(id) => (exerciseId === ALL_LIFTS && MEASURES.find((m) => m.id === id)?.needsLift ? "Pick one lift to see this" : null)} />
      </div>
      <div className="analyze-controls">
        <Segmented label="Group by" value={period} options={PERIODS} onChange={setPeriod} />
        <Segmented label="Range" value={range} options={RANGES} onChange={setRange} />
        <Segmented label="Chart" value={chart} options={CHART_TYPES} onChange={setChart} />
        <div className="analyze-field">
          <span>Trend</span>
          <div className="segmented" role="group" aria-label="Trend">
            <button type="button" aria-pressed={trend} onClick={() => setTrend((value) => !value)}>
              4-point average
            </button>
          </div>
        </div>
      </div>

      {summary.points === 0 ? (
        <div className="empty">
          <p>No {liftName === "All lifts" ? "" : `${liftName} `}sets in this range. Try a longer range.</p>
        </div>
      ) : (
        <>
          <AnalyticsChart
            data={points}
            type={chart}
            showTrend={trend}
            color="var(--data-1)"
            name={`${info.label}${unitSuffix}`}
            format={format}
            zeroBased={info.rollup === "sum"}
            label={`${info.label} of ${liftName} by ${per}, ${RANGES.find((item) => item.id === range)?.label} range`}
          />
          <div className="analyze-figures" aria-label="Summary for this chart">
            <div>
              <span className="num">{format(show(summary.total)!)}</span>
              <span className="small muted">{info.rollup === "sum" ? "total" : "best"}</span>
            </div>
            <div>
              <span className="num">{format(show(summary.average)!)}</span>
              <span className="small muted">average per {settled ? `full ${per}` : per}</span>
            </div>
            <div>
              <span className="num">{format(show(summary.latest)!)}</span>
              <span className="small muted">{settled ? `last full ${per}` : `latest ${per}`}</span>
            </div>
            <div>
              <span className={`num ${summary.changePercent != null && summary.changePercent > 0 ? "ok" : ""}`}>
                {summary.changePercent == null ? "None" : `${summary.changePercent >= 0 ? "+" : ""}${trimNumber(summary.changePercent, 0)}%`}
              </span>
              <span className="small muted">first to latest</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
