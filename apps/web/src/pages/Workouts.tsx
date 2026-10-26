import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, Play, Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { SetKind, Workout, WorkoutExercise, WorkoutSet, WeightUnit } from "@swolltech/api-client";
import { parseAmount } from "@swolltech/metrics";
import { useApi } from "../auth";
import { ExercisePicker } from "../components/ExercisePicker";
import { LoadError, Loading, Toast } from "../components/Feedback";
import { errorMessage, plural, trimNumber } from "../format";
import { keys, useUnit } from "../hooks";
import { ConfirmDialog } from "./Session";

export function WorkoutsPage() {
  const api = useApi();
  const workouts = useQuery({ queryKey: keys.workouts, queryFn: () => api.workouts() });
  const [showArchived, setShowArchived] = useState(false);
  if (workouts.isPending) return <Loading />;
  if (workouts.error) return <LoadError error={workouts.error} retry={() => workouts.refetch()} />;
  const active = workouts.data.filter((item) => !item.archived_at);
  const archived = workouts.data.filter((item) => item.archived_at);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Workouts</h1>
          <p className="lede">Your plans. Each one lists the exercises and sets you intend to do, and you can change anything mid-session.</p>
        </div>
        <Link className="btn primary" to="/workouts/new">
          <Plus size={18} aria-hidden="true" />
          New workout
        </Link>
      </header>
      {active.length === 0 ? (
        <div className="empty">
          <p>No workouts yet. A simple one is fine: three exercises, a few sets each.</p>
          <Link className="btn primary" to="/workouts/new">
            Write a workout
          </Link>
        </div>
      ) : (
        <div className="list">
          {active.map((workout) => (
            <Link key={workout.id} className="list-row" to={`/workouts/${workout.id}`}>
              <div>
                <div className="title">{workout.name}</div>
                {workout.notes && <div className="small muted">{workout.notes}</div>}
              </div>
              <span className="small muted">Edit</span>
            </Link>
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <section className="section">
          <button className="btn quiet" style={{ alignSelf: "flex-start" }} onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
            {showArchived ? "Hide" : "Show"} {plural(archived.length, "archived workout")}
          </button>
          {showArchived && (
            <div className="list">
              {archived.map((workout) => (
                <Link key={workout.id} className="list-row" to={`/workouts/${workout.id}`}>
                  <span className="title muted">{workout.name}</span>
                  <span className="small muted">Archived</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function EditorPage() {
  const { workoutId } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const unit = useUnit();
  const workout = useQuery({ queryKey: keys.workout(workoutId ?? "new"), queryFn: () => api.workout(workoutId!), enabled: Boolean(workoutId) });
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const data = workout.data;
  const title = name ?? data?.name ?? "";
  const body = notes ?? data?.notes ?? "";

  function store(next: Workout) {
    queryClient.setQueryData(keys.workout(next.id), next);
  }

  async function refresh() {
    if (!workoutId) return;
    store(await api.workout(workoutId));
  }

  async function act(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      if (!workoutId) {
        const created = await api.createWorkout({ name: title.trim(), notes: body });
        await queryClient.invalidateQueries({ queryKey: keys.workouts });
        navigate(`/workouts/${created.id}`, { replace: true });
        return;
      }
      store(await api.updateWorkout(workoutId, { name: title.trim(), notes: body }));
      await queryClient.invalidateQueries({ queryKey: keys.workouts });
      setName(null);
      setNotes(null);
      setToast("Workout saved");
    });
  }

  const start = useMutation({
    mutationFn: () => api.startSession(workoutId!),
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate(`/sessions/${session.id}`);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (workoutId && workout.isPending) return <Loading />;
  if (workoutId && (workout.error || !data)) return <LoadError error={workout.error} retry={() => workout.refetch()} />;
  const dirty = name !== null || notes !== null;

  return (
    <div className="page">
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
      <header className="page-head">
        <div>
          <Link to="/workouts" className="small muted">
            Workouts
          </Link>
          <h1>{workoutId ? data?.name : "New workout"}</h1>
        </div>
        {data && !data.archived_at && (
          <button className="btn primary" onClick={() => start.mutate()} disabled={start.isPending || data.exercises.length === 0} data-testid="start-workout">
            <Play size={18} aria-hidden="true" />
            Start workout
          </button>
        )}
      </header>

      <form className="panel stack" onSubmit={save}>
        <div className="grid-2">
          <label className="field">
            <span>Name</span>
            <input data-testid="workout-name" value={title} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="Push day, Legs A, Upper 1" />
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={body} onChange={(event) => setNotes(event.target.value)} placeholder="Optional, for example a cue or the program week" />
          </label>
        </div>
        <div className="row">
          <button className="btn primary" data-testid="save-workout" type="submit" disabled={Boolean(workoutId) && !dirty}>
            {workoutId ? "Save changes" : "Create workout"}
          </button>
          {!workoutId && <span className="small muted">Next you will add exercises and sets.</span>}
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          <section className="section">
            <h2>Exercises</h2>
            {data.exercises.length === 0 && <p className="muted">Add the first exercise below. Three working sets of five is a fine place to start.</p>}
            {data.exercises.map((item, index) => (
              <ExerciseCard
                key={item.id}
                item={item}
                index={index}
                count={data.exercises.length}
                defaultUnit={unit}
                onMove={(direction) =>
                  act(async () => {
                    const ids = data.exercises.map((entry) => entry.id);
                    const target = index + direction;
                    [ids[index], ids[target]] = [ids[target], ids[index]];
                    store(await api.reorderWorkout(data.id, ids));
                  })
                }
                onRemove={() =>
                  act(async () => {
                    await api.deleteWorkoutExercise(item.id);
                    await refresh();
                  })
                }
                onChanged={refresh}
                onError={setError}
              />
            ))}
            <div className="panel">
              <ExercisePicker
                onPick={async (exercise) => {
                  const next = await api.addWorkoutExercise(data.id, exercise.id);
                  const added = next.exercises[next.exercises.length - 1];
                  for (let count = 0; count < 3; count += 1) {
                    await api.addWorkoutSet(added.id, { kind: "working", target_reps: 5, rest_seconds: 120 });
                  }
                  await refresh();
                }}
              />
              <p className="small muted" style={{ marginTop: 8 }}>
                New exercises start with three open sets of 5. Change them below.
              </p>
            </div>
          </section>

          <section className="section">
            <h2>Manage</h2>
            <div className="row">
              <button className="btn" onClick={() => act(async () => { store(await api.updateWorkout(data.id, { archived: !data.archived_at })); await queryClient.invalidateQueries({ queryKey: keys.workouts }); })}>
                {data.archived_at ? "Restore workout" : "Archive workout"}
              </button>
              <button className="btn danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Delete workout
              </button>
            </div>
            <p className="small muted">Archiving hides it from Today. Your logged sessions stay either way.</p>
          </section>
        </>
      )}

      {confirmDelete && data && (
        <ConfirmDialog
          title={`Delete ${data.name}?`}
          body="The plan is removed. Sessions you already logged from it stay in your history."
          confirmLabel="Delete workout"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            act(async () => {
              await api.deleteWorkout(data.id);
              await queryClient.invalidateQueries({ queryKey: keys.workouts });
              navigate("/workouts", { replace: true });
            })
          }
        />
      )}
    </div>
  );
}

function ExerciseCard({
  item,
  index,
  count,
  defaultUnit,
  onMove,
  onRemove,
  onChanged,
  onError,
}: {
  item: WorkoutExercise;
  index: number;
  count: number;
  defaultUnit: WeightUnit;
  onMove: (direction: 1 | -1) => void;
  onRemove: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const api = useApi();

  async function duplicateLast() {
    try {
      const last = item.sets[item.sets.length - 1];
      await api.addWorkoutSet(
        item.id,
        last
          ? {
              kind: last.kind,
              target_reps: last.target_reps,
              target_weight: last.target_weight,
              target_unit: last.target_unit,
              target_percent: last.target_percent,
              target_rpe: last.target_rpe,
              rest_seconds: last.rest_seconds,
            }
          : { kind: "working", target_reps: 5, rest_seconds: 120 },
      );
      await onChanged();
    } catch (err) {
      onError(errorMessage(err));
    }
  }

  return (
    <article className="panel stack" aria-label={item.exercise_name}>
      <div className="section-head">
        <h3>
          {index + 1}. {item.exercise_name}
        </h3>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn quiet icon" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${item.exercise_name} up`}>
            <ArrowUp size={18} aria-hidden="true" />
          </button>
          <button className="btn quiet icon" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${item.exercise_name} down`}>
            <ArrowDown size={18} aria-hidden="true" />
          </button>
          <button className="btn quiet icon" onClick={onRemove} aria-label={`Remove ${item.exercise_name}`}>
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {item.sets.length === 0 && <p className="muted small">No sets planned. Add one below.</p>}
      {item.sets.map((set, setIndex) => (
        <PlannedSetRow key={set.id} set={set} index={setIndex} defaultUnit={defaultUnit} onChanged={onChanged} onError={onError} />
      ))}
      <div>
        <button className="btn" onClick={duplicateLast} data-testid={`add-set-${item.exercise_name}`}>
          <Copy size={16} aria-hidden="true" />
          {item.sets.length ? "Add another set like the last" : "Add a set"}
        </button>
      </div>
    </article>
  );
}

type LoadMode = "weight" | "percent" | "open";

function PlannedSetRow({
  set,
  index,
  defaultUnit,
  onChanged,
  onError,
}: {
  set: WorkoutSet;
  index: number;
  defaultUnit: WeightUnit;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const api = useApi();
  const initialMode: LoadMode = set.target_percent != null ? "percent" : set.target_weight != null ? "weight" : "open";
  const [kind, setKind] = useState<SetKind>(set.kind);
  const [mode, setMode] = useState<LoadMode>(initialMode);
  const [reps, setReps] = useState(set.target_reps?.toString() ?? "");
  const [weight, setWeight] = useState(set.target_weight != null ? trimNumber(set.target_weight, 2) : "");
  const [unit, setUnit] = useState<WeightUnit>(set.target_unit ?? defaultUnit);
  const [percent, setPercent] = useState(set.target_percent?.toString() ?? "");
  const [rest, setRest] = useState(String(set.rest_seconds));

  async function commit(overrides: Partial<{ kind: SetKind; mode: LoadMode; unit: WeightUnit }> = {}) {
    const nextKind = overrides.kind ?? kind;
    const nextMode = overrides.mode ?? mode;
    const nextUnit = overrides.unit ?? unit;
    const patch: Record<string, unknown> = { kind: nextKind };
    const repsValue = parseAmount(reps);
    if (repsValue != null && repsValue >= 1) patch.target_reps = Math.round(repsValue);
    const restValue = parseAmount(rest);
    if (restValue != null) patch.rest_seconds = Math.round(restValue);
    const weightValue = parseAmount(weight);
    const percentValue = parseAmount(percent);
    if (nextMode === "weight" && weightValue != null) Object.assign(patch, { target_weight: weightValue, target_unit: nextUnit, clear_percent: true });
    else if (nextMode === "percent" && percentValue != null) Object.assign(patch, { target_percent: percentValue, clear_weight: true });
    else if (nextMode === "open") Object.assign(patch, { clear_weight: true, clear_percent: true });
    try {
      await api.updateWorkoutSet(set.id, patch);
      await onChanged();
    } catch (err) {
      onError(errorMessage(err));
    }
  }

  async function remove() {
    try {
      await api.deleteWorkoutSet(set.id);
      await onChanged();
    } catch (err) {
      onError(errorMessage(err));
    }
  }

  const blur = () => void commit();

  return (
    <div className="inline-inputs" role="group" aria-label={`Set ${index + 1}`}>
      <label className="field">
        <span>Set {index + 1}</span>
        <select
          value={kind}
          onChange={(event) => {
            const next = event.target.value as SetKind;
            setKind(next);
            void commit({ kind: next });
          }}
        >
          <option value="working">Working</option>
          <option value="warmup">Warmup</option>
        </select>
      </label>
      <label className="field">
        <span>Reps</span>
        <input data-testid="plan-reps" inputMode="numeric" value={reps} onChange={(event) => setReps(event.target.value)} onBlur={blur} />
      </label>
      <label className="field">
        <span>Load</span>
        <select
          value={mode}
          onChange={(event) => {
            const next = event.target.value as LoadMode;
            setMode(next);
            if (next === "open") void commit({ mode: next });
          }}
        >
          <option value="weight">Weight</option>
          <option value="percent">% of max</option>
          <option value="open">Decide on the day</option>
        </select>
      </label>
      {mode === "weight" && (
        <>
          <label className="field">
            <span>Weight</span>
            <input data-testid="plan-weight" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} onBlur={blur} />
          </label>
          <label className="field">
            <span>Unit</span>
            <select
              value={unit}
              onChange={(event) => {
                const next = event.target.value as WeightUnit;
                setUnit(next);
                void commit({ unit: next });
              }}
            >
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </label>
        </>
      )}
      {mode === "percent" && (
        <label className="field">
          <span>Percent</span>
          <input data-testid="plan-percent" inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value)} onBlur={blur} />
        </label>
      )}
      <label className="field">
        <span>Rest (sec)</span>
        <input inputMode="numeric" value={rest} onChange={(event) => setRest(event.target.value)} onBlur={blur} />
      </label>
      <button className="btn quiet icon" onClick={remove} aria-label={`Remove set ${index + 1}`} style={{ alignSelf: "end" }}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
