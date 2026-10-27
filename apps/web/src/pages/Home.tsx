import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus, Trophy } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../auth";
import { LoadError, Loading } from "../components/Feedback";
import { bigWeightFromKg, errorMessage, formatDay, formatWhen, plural, weightFromKg } from "../format";
import { keys, useOverview, useProfile, useUnit } from "../hooks";

function greeting(name: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  return name ? `${part}, ${name}` : part;
}

export function HomePage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const unit = useUnit();
  const overview = useOverview();
  const workouts = useQuery({ queryKey: keys.workouts, queryFn: () => api.workouts() });
  const sessions = useQuery({ queryKey: keys.sessions(), queryFn: () => api.sessions() });
  const start = useMutation({
    mutationFn: (workoutId: string | null) => api.startSession(workoutId),
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate(`/sessions/${session.id}`);
    },
  });

  if (workouts.isPending || sessions.isPending) return <Loading />;
  if (workouts.error) return <LoadError error={workouts.error} retry={() => workouts.refetch()} />;

  const active = (sessions.data ?? []).filter((item) => item.status === "in_progress");
  const lastByWorkout = new Map<string, string>();
  for (const item of sessions.data ?? []) {
    if (item.status === "completed" && item.workout_id && !lastByWorkout.has(item.workout_id)) lastByWorkout.set(item.workout_id, item.started_at);
  }
  const ready = (workouts.data ?? []).filter((item) => !item.archived_at);
  const totals = overview.data?.totals;
  const latestRecord = overview.data?.recent_records[0];
  const volumeChange = totals && totals.last_week_volume_kg > 0 ? Math.round(((totals.this_week_volume_kg - totals.last_week_volume_kg) / totals.last_week_volume_kg) * 100) : null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{greeting(profile.data?.display_name ?? "")}</h1>
          <p className="lede">{ready.length ? "Pick today's workout and log each set as you go." : "Write your first workout the way you would in your notebook."}</p>
        </div>
        <button className="btn" onClick={() => start.mutate(null)} disabled={start.isPending}>
          <Plus size={18} aria-hidden="true" />
          Empty workout
        </button>
      </header>
      {start.error && (
        <p className="error" role="alert">
          {errorMessage(start.error)}
        </p>
      )}

      {active.map((session) => (
        <Link key={session.id} to={`/sessions/${session.id}`} className="record-card" style={{ textDecoration: "none" }} data-testid="resume">
          <Play size={28} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <div className="num" style={{ fontSize: "1.5rem" }}>
              Resume {session.name}
            </div>
            <div>Started {formatWhen(session.started_at)}</div>
          </div>
          <span className="btn primary">
            Open
          </span>
        </Link>
      ))}

      {totals && totals.sessions > 0 && (
        <section className="figures" aria-label="This week">
          <div>
            <span className="value">{totals.this_week_sessions}</span>
            <span className="label">{totals.this_week_sessions === 1 ? "session this week" : "sessions this week"}</span>
          </div>
          <div>
            <span className="value">
              {bigWeightFromKg(totals.this_week_volume_kg, unit)}
              <small>{unit}</small>
            </span>
            <span className="label">{volumeChange == null ? "lifted this week" : `lifted, ${volumeChange >= 0 ? "+" : ""}${volumeChange}% on last week`}</span>
          </div>
          <div>
            <span className="value">{totals.current_streak_weeks}</span>
            <span className="label">{totals.current_streak_weeks === 1 ? "week in a row" : "weeks in a row"}</span>
          </div>
          <div>
            <span className="value">{totals.records}</span>
            <span className="label">personal records</span>
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Start a workout</h2>
          <Link to="/workouts/new" className="btn quiet">
            <Plus size={18} aria-hidden="true" />
            New workout
          </Link>
        </div>
        {ready.length === 0 ? (
          <div className="empty">
            <p>No workouts yet. Add the exercises and sets you plan to do, and SwollTech will walk you through them.</p>
            <Link to="/workouts/new" className="btn primary">
              Write a workout
            </Link>
          </div>
        ) : (
          <div className="list">
            {ready.map((workout) => {
              const last = lastByWorkout.get(workout.id);
              return (
                <div key={workout.id} className="list-row">
                  <Link to={`/workouts/${workout.id}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
                    <div className="title">{workout.name}</div>
                    <div className="small muted">{last ? `Last done ${formatDay(last)}` : workout.notes || "Not done yet"}</div>
                  </Link>
                  <button className="btn" data-testid={`start-${workout.name}`} onClick={() => start.mutate(workout.id)} disabled={start.isPending}>
                    <Play size={16} aria-hidden="true" />
                    Start
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {latestRecord && (
        <section className="section">
          <h2>Latest record</h2>
          <Link to={`/progress/${latestRecord.exercise_id}`} className="panel row" style={{ textDecoration: "none", gap: 16 }}>
            <Trophy size={28} color="var(--accent)" aria-hidden="true" />
            <div style={{ flex: 1 }}>
              <div className="title" style={{ fontWeight: 600 }}>
                {latestRecord.exercise_name}
              </div>
              <div className="small muted">
                {weightFromKg(latestRecord.weight_kg, unit)} for {plural(latestRecord.reps, "rep")} on {formatDay(latestRecord.achieved_at)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="num" style={{ fontSize: "1.6rem" }}>
                {weightFromKg(latestRecord.e1rm_kg, unit, 0)}
              </div>
              <div className="small muted">estimated max</div>
            </div>
          </Link>
        </section>
      )}
    </div>
  );
}
