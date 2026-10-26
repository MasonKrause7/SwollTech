import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "@swolltech/api-client";
import { localDay, parseAmount } from "@swolltech/metrics";
import { useApi } from "../auth";
import { BarSeries, LineSeries } from "../components/Charts";
import { LoadError, Loading } from "../components/Feedback";
import { Heatmap } from "../components/Heatmap";
import { bigWeightFromKg, convert, errorMessage, formatDay, formatShortDate, plural, timeZone, trimNumber, weightFromKg } from "../format";
import { keys, useExercises, useOverview, useUnit } from "../hooks";

const SPLIT_COLORS = ["var(--plate-blue)", "var(--plate-yellow)", "var(--plate-green)", "var(--plate-red)", "var(--muted)", "#b58bd6"];

export function ProgressPage() {
  const overview = useOverview();
  const unit = useUnit();
  if (overview.isPending) return <Loading label="Crunching your numbers" />;
  if (overview.error) return <LoadError error={overview.error} retry={() => overview.refetch()} />;
  const data = overview.data;
  const totals = data.totals;
  const weekly = data.weekly.map((week) => ({
    label: formatShortDate(week.week_start),
    volume: convert(week.volume_kg, unit),
    sessions: week.sessions,
  }));
  const maxSplit = Math.max(1, ...data.muscle_split.map((item) => item.sets));

  if (totals.sessions === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1>Progress</h1>
          </div>
        </header>
        <div className="empty">
          <p>Finish your first workout and your charts start here: weekly volume, streaks, records, and a trend line for every lift.</p>
          <Link className="btn primary" to="/">
            Start a workout
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Progress</h1>
          <p className="lede">Estimated maxes use the Epley formula on working sets. Warmups never count.</p>
        </div>
      </header>

      <section className="figures" aria-label="All time">
        <div>
          <span className="value">{totals.current_streak_weeks}</span>
          <span className="label">week streak, best {totals.longest_streak_weeks}</span>
        </div>
        <div>
          <span className="value">{totals.sessions}</span>
          <span className="label">sessions logged</span>
        </div>
        <div>
          <span className="value">
            {bigWeightFromKg(totals.volume_kg, unit)}
            <small>{unit}</small>
          </span>
          <span className="label">lifted in total</span>
        </div>
        <div>
          <span className="value">{totals.records}</span>
          <span className="label">personal records</span>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel stack">
          <div className="section-head">
            <h2>Weekly volume</h2>
            <span className="small muted">{unit}, last 12 weeks</span>
          </div>
          <BarSeries data={weekly} x="label" y="volume" name={`Volume (${unit})`} color="var(--plate-blue)" format={(value) => trimNumber(value, 0)} label="Weekly volume for the last 12 weeks" />
        </section>
        <section className="panel stack">
          <div className="section-head">
            <h2>Sessions per week</h2>
            <span className="small muted">last 12 weeks</span>
          </div>
          <BarSeries data={weekly} x="label" y="sessions" name="Sessions" color="var(--plate-green)" label="Sessions per week for the last 12 weeks" />
        </section>
      </div>

      <div className="grid-2">
        <section className="panel stack">
          <div className="section-head">
            <h2>Consistency</h2>
            <span className="small muted">{plural(data.calendar.length, "training day")} in 16 weeks</span>
          </div>
          <Heatmap days={data.calendar} today={localDay(new Date(), timeZone())} />
          <p className="small muted">Each column is a week, Monday at the top.</p>
        </section>
        <section className="panel stack">
          <div className="section-head">
            <h2>Muscle split</h2>
            <span className="small muted">working sets, last 4 weeks</span>
          </div>
          {data.muscle_split.length === 0 && <p className="muted">No working sets in the last 4 weeks.</p>}
          {data.muscle_split.map((item, index) => (
            <div key={item.muscle} className="split-row">
              <span style={{ textTransform: "capitalize" }}>{item.muscle}</span>
              <div className="split-track" aria-hidden="true">
                <div style={{ width: `${(item.sets / maxSplit) * 100}%`, background: SPLIT_COLORS[index % SPLIT_COLORS.length] }} />
              </div>
              <span className="num" style={{ textAlign: "right" }}>
                {plural(item.sets, "set")}
              </span>
            </div>
          ))}
        </section>
      </div>

      {data.recent_records.length > 0 && (
        <section className="section">
          <h2>Recent records</h2>
          <div className="list">
            {data.recent_records.map((record) => (
              <Link key={`${record.session_id}-${record.exercise_id}`} to={`/progress/${record.exercise_id}`} className="list-row">
                <div className="row" style={{ gap: 14 }}>
                  <Trophy size={20} color="var(--plate-yellow)" aria-hidden="true" />
                  <div>
                    <div className="title">{record.exercise_name}</div>
                    <div className="small muted">
                      {weightFromKg(record.weight_kg, unit)} × {record.reps} on {formatDay(record.achieved_at)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ fontSize: "1.2rem" }}>
                    {weightFromKg(record.e1rm_kg, unit, 0)}
                  </div>
                  <div className="small ok">+{weightFromKg(record.e1rm_kg - record.previous_e1rm_kg, unit)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Your lifts</h2>
          <Link to="/exercises" className="btn quiet">
            All exercises
          </Link>
        </div>
        <div className="list">
          {data.exercises.map((item) => (
            <Link key={item.exercise_id} to={`/progress/${item.exercise_id}`} className="list-row" data-testid={`lift-${item.exercise_name}`}>
              <div>
                <div className="title">{item.exercise_name}</div>
                <div className="small muted">
                  {plural(item.sessions, "session")}, last {formatDay(item.last_performed_at)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="num" style={{ fontSize: "1.2rem" }}>
                  {weightFromKg(item.best_e1rm_kg, unit, 0)}
                </div>
                <div className="small muted">best estimated max</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ExerciseProgressPage() {
  const { exerciseId = "" } = useParams();
  const api = useApi();
  const unit = useUnit();
  const exercises = useExercises();
  const progress = useQuery({ queryKey: keys.progress(exerciseId), queryFn: () => api.progress(exerciseId) });
  const exercise = exercises.data?.find((item) => item.id === exerciseId);

  if (progress.isPending) return <Loading />;
  if (progress.error) return <LoadError error={progress.error} retry={() => progress.refetch()} />;
  const data = progress.data;
  const points = data.points.map((point) => ({
    label: formatShortDate(point.started_at),
    e1rm: point.best_e1rm_kg == null ? null : convert(point.best_e1rm_kg, unit),
    volume: convert(point.volume_kg, unit),
    top: point.top_set_weight_kg == null ? null : convert(point.top_set_weight_kg, unit),
    percent: point.top_set_percent == null ? null : Number(point.top_set_percent.toFixed(1)),
  }));
  const estimates = data.points.map((point) => point.best_e1rm_kg).filter((value): value is number => value != null);
  const best = estimates.length ? Math.max(...estimates) : null;
  const first = estimates[0];
  const latest = estimates[estimates.length - 1];
  const gain = first && latest ? Math.round(((latest - first) / first) * 100) : null;
  const heaviest = Math.max(0, ...data.points.map((point) => point.top_set_weight_kg ?? 0));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link to="/progress" className="small muted">
            Progress
          </Link>
          <h1>{exercise?.name ?? "Exercise"}</h1>
          {exercise && (
            <p className="muted" style={{ textTransform: "capitalize" }}>
              {[exercise.primary_muscle, exercise.equipment].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </header>

      {points.length === 0 ? (
        <div className="empty">
          <p>No completed working sets for this lift yet. Log one and its trend line starts here.</p>
        </div>
      ) : (
        <>
          <section className="figures" aria-label="Summary">
            <div>
              <span className="value">{best == null ? "None" : trimNumber(convert(best, unit), 0)}</span>
              <span className="label">best estimated max ({unit})</span>
            </div>
            <div>
              <span className="value">{trimNumber(convert(heaviest, unit), 1)}</span>
              <span className="label">heaviest top set ({unit})</span>
            </div>
            <div>
              <span className="value">{gain == null ? "None" : `${gain >= 0 ? "+" : ""}${gain}%`}</span>
              <span className="label">since your first session</span>
            </div>
            <div>
              <span className="value">{points.length}</span>
              <span className="label">{points.length === 1 ? "session" : "sessions"}</span>
            </div>
          </section>

          <section className="panel stack" data-testid="progress-chart">
            <div className="section-head">
              <h2>Estimated max</h2>
              <span className="small muted">{unit}, best set each session</span>
            </div>
            <LineSeries data={points} x="label" y="e1rm" name={`Estimated max (${unit})`} color="var(--plate-red)" format={(value) => trimNumber(value, 0)} label="Estimated one rep max by session" />
          </section>
          <div className="grid-2">
            <section className="panel stack">
              <h2>Volume per session</h2>
              <BarSeries data={points} x="label" y="volume" name={`Volume (${unit})`} color="var(--plate-blue)" format={(value) => trimNumber(value, 0)} label="Volume by session" />
            </section>
            <section className="panel stack">
              <h2>Top set</h2>
              <LineSeries data={points} x="label" y="top" name={`Top set (${unit})`} color="var(--plate-green)" format={(value) => trimNumber(value, 0)} label="Heaviest working set by session" />
            </section>
          </div>
          {points.some((point) => point.percent != null) && (
            <section className="panel stack">
              <div className="section-head">
                <h2>Top set as % of max</h2>
                <span className="small muted">against your {data.reference_source === "training_max" ? "training max" : "best estimate"}</span>
              </div>
              <LineSeries data={points} x="label" y="percent" name="% of max" color="var(--plate-yellow)" format={(value) => `${trimNumber(value, 0)}%`} label="Top set as a percent of your max" />
            </section>
          )}
        </>
      )}

      <TrainingMax exerciseId={exerciseId} referenceKg={data.reference_kg} source={data.reference_source} />
    </div>
  );
}

function TrainingMax({ exerciseId, referenceKg, source }: { exerciseId: string; referenceKg: number | null; source: string }) {
  const api = useApi();
  const unit = useUnit();
  const queryClient = useQueryClient();
  const reference = useQuery({
    queryKey: keys.reference(exerciseId),
    queryFn: async () => {
      try {
        return await api.reference(exerciseId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.reference(exerciseId) }),
      queryClient.invalidateQueries({ queryKey: keys.progress(exerciseId) }),
    ]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const weight = parseAmount(value);
    if (!weight) {
      setMessage("Enter a weight above zero.");
      return;
    }
    try {
      await api.putReference(exerciseId, { weight, unit, noted_on: new Date().toISOString().slice(0, 10) });
      setValue("");
      setMessage("Training max saved.");
      await refresh();
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  async function clear() {
    try {
      await api.deleteReference(exerciseId);
      setMessage("Training max cleared. Percent targets now use your best estimate.");
      await refresh();
    } catch (err) {
      setMessage(errorMessage(err));
    }
  }

  return (
    <section className="panel stack">
      <h2>Training max</h2>
      <p className="muted">
        Sets planned as a percent of max use this number.{" "}
        {reference.data
          ? `Yours is ${trimNumber(reference.data.weight, 2)} ${reference.data.unit}, set ${formatShortDate(reference.data.noted_on)}.`
          : source === "estimated" && referenceKg
            ? `You have not set one, so SwollTech uses your best estimate, ${weightFromKg(referenceKg, unit, 0)}.`
            : "You have not set one yet."}
      </p>
      <form className="row" onSubmit={save}>
        <input aria-label={`Training max in ${unit}`} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Weight in ${unit}`} style={{ maxWidth: 200 }} />
        <button className="btn primary" type="submit">
          Save training max
        </button>
        {reference.data && (
          <button className="btn quiet" type="button" onClick={clear}>
            Clear
          </button>
        )}
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
