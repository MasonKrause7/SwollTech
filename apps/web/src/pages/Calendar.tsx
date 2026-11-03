import type { ScheduledWorkout, SessionSummary } from "@swolltech/api-client";
import { localDay, monthGrid, planStates, shiftMonth, type PlanState, type PlanStatus } from "@swolltech/metrics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Play, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../auth";
import { BrandEmpty, LoadError, Loading } from "../components/Feedback";
import { errorMessage, formatDay, timeZone } from "../format";
import { keys } from "../hooks";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const REPEATS = [
  { weeks: 0, label: "Just this day" },
  { weeks: 1, label: "2 weeks" },
  { weeks: 3, label: "4 weeks" },
  { weeks: 7, label: "8 weeks" },
  { weeks: 11, label: "12 weeks" },
];

const STATE_LABEL: Record<PlanState, string> = {
  done: "Done",
  in_progress: "In progress",
  today: "Today",
  missed: "Missed",
  upcoming: "Planned",
};

function monthTitle(month: string) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00`));
}

function dayTitle(day: string) {
  return formatDay(`${day}T12:00:00`);
}

/** Plans and their states for a range, joined with the session list. Shared with Today. */
export function usePlans(start: string, end: string, sessions: SessionSummary[] | undefined) {
  const api = useApi();
  const schedule = useQuery({ queryKey: keys.schedule(start, end), queryFn: () => api.schedule(start, end) });
  const zone = timeZone();
  const today = localDay(new Date(), zone);
  const states = useMemo(
    () =>
      planStates(
        (schedule.data ?? []).map((plan) => ({ id: plan.id, workoutId: plan.workout_id, day: plan.scheduled_on })),
        (sessions ?? []).map((session) => ({ id: session.id, workoutId: session.workout_id, status: session.status, startedAt: session.started_at })),
        today,
        zone,
      ),
    [schedule.data, sessions, today, zone],
  );
  return { schedule, states, today, zone };
}

export function CalendarPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = localDay(new Date(), timeZone());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const start = weeks[0][0];
  const end = weeks.at(-1)!.at(-1)!;

  const workouts = useQuery({ queryKey: keys.workouts, queryFn: () => api.workouts() });
  const sessions = useQuery({ queryKey: keys.sessions(), queryFn: () => api.sessions() });
  const { schedule, states, zone } = usePlans(start, end, sessions.data);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["schedule"] });
  const add = useMutation({
    mutationFn: (body: { workout_id: string; scheduled_on: string; repeat_weeks: number }) => api.scheduleWorkout(body),
    onSuccess: refresh,
  });
  const move = useMutation({ mutationFn: ({ id, day }: { id: string; day: string }) => api.updateScheduled(id, { scheduled_on: day }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteScheduled(id), onSuccess: refresh });
  const begin = useMutation({
    mutationFn: (workoutId: string) => api.startSession(workoutId),
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate(`/sessions/${session.id}`);
    },
  });

  const plansByDay = useMemo(() => {
    const map = new Map<string, ScheduledWorkout[]>();
    for (const plan of schedule.data ?? []) map.set(plan.scheduled_on, [...(map.get(plan.scheduled_on) ?? []), plan]);
    return map;
  }, [schedule.data]);

  // Sessions that no plan claims, so the calendar also shows what you did off-plan.
  const offPlanByDay = useMemo(() => {
    const claimed = new Set([...states.values()].map((status) => status.sessionId).filter(Boolean));
    const map = new Map<string, SessionSummary[]>();
    for (const session of sessions.data ?? []) {
      if (session.status === "abandoned" || claimed.has(session.id)) continue;
      const day = localDay(session.started_at, zone);
      if (day < start || day > end) continue;
      map.set(day, [...(map.get(day) ?? []), session]);
    }
    return map;
  }, [sessions.data, states, zone, start, end]);

  if (workouts.isPending || sessions.isPending || schedule.isPending) return <Loading />;
  const failed = workouts.error ?? sessions.error ?? schedule.error;
  if (failed) return <LoadError error={failed} retry={() => void Promise.all([workouts.refetch(), sessions.refetch(), schedule.refetch()])} />;

  const ready = (workouts.data ?? []).filter((item) => !item.archived_at);
  const dayPlans = plansByDay.get(selected) ?? [];
  const dayOffPlan = offPlanByDay.get(selected) ?? [];
  const busyError = add.error ?? move.error ?? remove.error ?? begin.error;

  function goTo(nextMonth: string, day?: string) {
    setMonth(nextMonth);
    setSelected(day ?? (nextMonth === today.slice(0, 7) ? today : `${nextMonth}-01`));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const workoutId = String(form.get("workout") ?? "");
    if (!workoutId) return;
    add.mutate({ workout_id: workoutId, scheduled_on: selected, repeat_weeks: Number(form.get("repeat") ?? 0) });
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Calendar</h1>
          <p className="lede">Plan your week or your month. On the day, Today has your workout ready to start.</p>
        </div>
      </header>

      <div className="calendar-layout">
        <section className="panel calendar" aria-label={monthTitle(month)}>
          <div className="calendar-head">
            <h2>{monthTitle(month)}</h2>
            <div className="row">
              <button className="btn quiet" onClick={() => goTo(today.slice(0, 7), today)} disabled={month === today.slice(0, 7) && selected === today}>
                Today
              </button>
              <button className="btn icon" aria-label="Previous month" onClick={() => goTo(shiftMonth(month, -1))}>
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button className="btn icon" aria-label="Next month" onClick={() => goTo(shiftMonth(month, 1))}>
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            <div className="calendar-row">
              {WEEKDAYS.map((name) => (
                <div key={name} className="calendar-weekday">
                  {name}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} className="calendar-row">
                {week.map((day) => {
                  const plans = plansByDay.get(day) ?? [];
                  const offPlan = offPlanByDay.get(day) ?? [];
                  const summary = [...plans.map((plan) => `${plan.workout_name}, ${STATE_LABEL[states.get(plan.id)?.state ?? "upcoming"].toLowerCase()}`), ...offPlan.map((item) => `${item.name}, logged`)];
                  return (
                    <button
                      key={day}
                      className="calendar-day"
                      data-outside={day.slice(0, 7) !== month || undefined}
                      data-today={day === today || undefined}
                      aria-pressed={day === selected}
                      aria-label={`${dayTitle(day)}${summary.length ? `: ${summary.join("; ")}` : ""}`}
                      onClick={() => {
                        setSelected(day);
                        if (day.slice(0, 7) !== month) setMonth(day.slice(0, 7));
                      }}
                    >
                      <span className="calendar-date num">{Number(day.slice(8))}</span>
                      <span className="calendar-items">
                        {plans.map((plan) => (
                          <PlanChip key={plan.id} name={plan.workout_name} status={states.get(plan.id)} />
                        ))}
                        {offPlan.map((item) => (
                          <PlanChip key={item.id} name={item.name} status={{ state: item.status === "completed" ? "done" : "in_progress", sessionId: item.id }} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="panel stack-lg calendar-detail" aria-label={dayTitle(selected)} data-testid="day-detail">
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">{selected === today ? "Today" : selected < today ? "Past" : "Coming up"}</span>
            <h2>{dayTitle(selected)}</h2>
          </div>

          {dayPlans.length === 0 && dayOffPlan.length === 0 && <p className="muted">Nothing planned.</p>}

          {(dayPlans.length > 0 || dayOffPlan.length > 0) && (
            <div className="list">
              {dayPlans.map((plan) => {
                const status = states.get(plan.id) ?? { state: "upcoming" as const, sessionId: null };
                return (
                  <div key={plan.id} className="list-row plan-row">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="title">{plan.workout_name}</div>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="tag" data-state={status.state}>
                          {STATE_LABEL[status.state]}
                        </span>
                        {plan.workout_archived && <span className="small muted">Archived workout</span>}
                      </div>
                    </div>
                    <div className="row plan-actions">
                      {status.sessionId && (
                        <Link className="btn quiet" to={status.state === "done" ? `/sessions/${status.sessionId}/summary` : `/sessions/${status.sessionId}`}>
                          {status.state === "done" ? "View" : "Resume"}
                        </Link>
                      )}
                      {status.state === "today" && !plan.workout_archived && (
                        <button className="btn primary" onClick={() => begin.mutate(plan.workout_id)} disabled={begin.isPending}>
                          <Play size={16} aria-hidden="true" />
                          Start
                        </button>
                      )}
                      {!status.sessionId && (
                        <label className="move">
                          <span className="visually-hidden">Move {plan.workout_name} to</span>
                          <input
                            type="date"
                            value={plan.scheduled_on}
                            onChange={(event) => {
                              const day = event.target.value;
                              if (day && day !== plan.scheduled_on) move.mutate({ id: plan.id, day });
                            }}
                          />
                        </label>
                      )}
                      <button className="btn icon quiet" aria-label={`Remove ${plan.workout_name}`} onClick={() => remove.mutate(plan.id)} disabled={remove.isPending}>
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {dayOffPlan.map((item) => (
                <Link key={item.id} className="list-row" to={item.status === "completed" ? `/sessions/${item.id}/summary` : `/sessions/${item.id}`}>
                  <div>
                    <div className="title">{item.name}</div>
                    <div className="small muted">Logged without a plan</div>
                  </div>
                  <span className="small muted">View</span>
                </Link>
              ))}
            </div>
          )}

          {ready.length === 0 ? (
            <BrandEmpty>
              <p>Write a workout first, then plan it here.</p>
              <Link to="/workouts/new" className="btn">
                New workout
              </Link>
            </BrandEmpty>
          ) : (
            <form className="stack" onSubmit={submit} key={selected}>
              <h3>Plan a workout</h3>
              <label className="field">
                <span>Workout</span>
                <select name="workout" defaultValue={ready[0].id}>
                  {ready.map((workout) => (
                    <option key={workout.id} value={workout.id}>
                      {workout.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Repeat every {WEEKDAYS[(new Date(`${selected}T12:00:00`).getDay() + 6) % 7]}</span>
                <select name="repeat" defaultValue="0">
                  {REPEATS.map((option) => (
                    <option key={option.weeks} value={option.weeks}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn" type="submit" disabled={add.isPending}>
                Add to {selected === today ? "today" : dayTitle(selected)}
              </button>
            </form>
          )}

          {busyError && (
            <p className="error" role="alert">
              {errorMessage(busyError)}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function PlanChip({ name, status }: { name: string; status: PlanStatus | undefined }) {
  const state = status?.state ?? "upcoming";
  return (
    <span className="plan-chip" data-state={state}>
      {state === "done" && <Check size={12} aria-hidden="true" />}
      <span className="plan-chip-name">{name}</span>
    </span>
  );
}
