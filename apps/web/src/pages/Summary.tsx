import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../auth";
import { LoadError, Loading } from "../components/Feedback";
import { bigWeightFromKg, formatDuration, formatWhen, plural, weightFromKg } from "../format";
import { keys, useUnit } from "../hooks";

export function SummaryPage() {
  const { sessionId = "" } = useParams();
  const api = useApi();
  const unit = useUnit();
  const summary = useQuery({ queryKey: keys.summary(sessionId), queryFn: () => api.sessionSummary(sessionId) });

  if (summary.isPending) return <Loading label="Adding it up" />;
  if (summary.error || !summary.data) return <LoadError error={summary.error} retry={() => summary.refetch()} />;
  const data = summary.data;
  const headline = data.records.length
    ? `${plural(data.records.length, "new record")}.`
    : data.sets
      ? "Workout logged."
      : "Workout saved.";

  return (
    <div className="page">
      <section className="summary-hero" aria-labelledby="summary-title">
        <div className="stack">
          <p style={{ color: "#a9b2bb" }}>
            {data.name}, {formatWhen(data.started_at)}
          </p>
          <h1 id="summary-title" data-testid="summary-headline">
            {headline}
          </h1>
        </div>
        <div className="figures">
          <div>
            <span className="value">
              {bigWeightFromKg(data.volume_kg, unit)}
              <small>{unit}</small>
            </span>
            <span className="label">total volume</span>
          </div>
          <div>
            <span className="value">{data.sets}</span>
            <span className="label">working sets</span>
          </div>
          <div>
            <span className="value">{data.exercises.length}</span>
            <span className="label">{data.exercises.length === 1 ? "exercise" : "exercises"}</span>
          </div>
          <div>
            <span className="value" style={{ fontSize: "1.6rem", paddingTop: 6 }}>
              {formatDuration(data.duration_seconds)}
            </span>
            <span className="label">time</span>
          </div>
        </div>
      </section>

      {data.records.length > 0 && (
        <section className="section" aria-label="Records">
          {data.records.map((record) => (
            <div key={record.exercise_id} className="record-card" data-testid="record">
              <Trophy size={30} aria-hidden="true" />
              <div style={{ flex: 1 }}>
                <div className="num" style={{ fontSize: "1.4rem" }}>
                  {record.exercise_name}
                </div>
                <div>
                  {weightFromKg(record.weight_kg, unit)} for {plural(record.reps, "rep")}. Estimated max up from {weightFromKg(record.previous_e1rm_kg, unit, 0)}.
                </div>
              </div>
              <div className="num">{weightFromKg(record.e1rm_kg, unit, 0)}</div>
            </div>
          ))}
        </section>
      )}

      <section className="section">
        <h2>Best set per exercise</h2>
        {data.exercises.length === 0 ? (
          <p className="muted">No working sets were logged, so nothing counts toward your stats this time.</p>
        ) : (
          <div className="list">
            {data.exercises.map((item) => (
              <Link key={item.exercise_id} to={`/progress/${item.exercise_id}`} className="list-row">
                <div>
                  <div className="title">{item.exercise_name}</div>
                  <div className="small muted">{plural(item.sets, "working set")}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ fontSize: "1.2rem" }}>
                    {weightFromKg(item.top_weight_kg, unit)} × {item.top_reps}
                  </div>
                  <div className="small muted">estimated max {weightFromKg(item.best_e1rm_kg, unit, 0)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="row">
        <Link to="/" className="btn primary">
          Done
        </Link>
        <Link to={`/sessions/${sessionId}`} className="btn">
          See every set
        </Link>
        <Link to="/progress" className="btn quiet">
          Progress
        </Link>
      </div>
    </div>
  );
}
