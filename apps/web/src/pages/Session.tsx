import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, SkipForward, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Session, SessionExercise, SessionSet, WeightUnit } from "@swolltech/api-client";
import {
  formatClock,
  matchingPrevious,
  nextInExercise,
  nextPosition,
  nextSetTemplate,
  parseAmount,
  prefill,
  progress,
  weightStep,
  type GuidePosition,
} from "@swolltech/metrics";
import { useApi } from "../auth";
import { ExercisePicker } from "../components/ExercisePicker";
import { LoadError, Loading } from "../components/Feedback";
import { PlateBar } from "../components/PlateBar";
import { Stepper } from "../components/Stepper";
import { errorMessage, formatPair, formatWhen, plural, trimNumber } from "../format";
import { keys, useUnit } from "../hooks";

const RPE_CHOICES = [6, 7, 8, 9, 10];

interface Draft {
  weight: string;
  reps: string;
  unit: WeightUnit;
  rpe: number | null;
}

function setState(set: SessionSet) {
  if (set.skipped) return "skipped";
  if (set.completed_at) return "done";
  return "open";
}

export function SessionPage() {
  const { sessionId = "" } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileUnit = useUnit();
  const session = useQuery({ queryKey: keys.session(sessionId), queryFn: () => api.session(sessionId) });
  const [position, setPosition] = useState<GuidePosition | null>(null);
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<"finish" | "discard" | null>(null);
  const [addingExercise, setAddingExercise] = useState(false);
  const placed = useRef(false);

  const data = session.data;
  useEffect(() => {
    if (!data || placed.current) return;
    placed.current = true;
    setPosition(nextPosition(data.exercises) ?? (data.exercises.length ? { exerciseIndex: 0, setIndex: 0 } : null));
  }, [data]);

  function store(next: Session) {
    queryClient.setQueryData(keys.session(sessionId), next);
  }

  function patchSet(updated: SessionSet) {
    const current = queryClient.getQueryData<Session>(keys.session(sessionId));
    if (!current) return current;
    const next: Session = {
      ...current,
      exercises: current.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((item) => (item.id === updated.id ? updated : item)),
      })),
    };
    store(next);
    return next;
  }

  function advanceFrom(next: Session, from: GuidePosition) {
    const exercise = next.exercises[from.exerciseIndex];
    const within = exercise ? nextInExercise(exercise) : null;
    if (within != null) setPosition({ exerciseIndex: from.exerciseIndex, setIndex: within });
    else setPosition(nextPosition(next.exercises) ?? from);
  }

  const finish = useMutation({
    mutationFn: () => api.updateSession(sessionId, { status: "completed" }),
    onSuccess: async (next) => {
      store(next);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sessions"] }),
        queryClient.invalidateQueries({ queryKey: keys.overview }),
        queryClient.invalidateQueries({ queryKey: ["progress"] }),
      ]);
      navigate(`/sessions/${sessionId}/summary`, { replace: true });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const discard = useMutation({
    mutationFn: () => api.deleteSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate("/", { replace: true });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (session.isPending) return <Loading label="Loading workout" />;
  if (session.error || !data) return <LoadError error={session.error} retry={() => session.refetch()} />;

  const readOnly = data.status !== "in_progress";
  const tally = progress(data.exercises);
  const current = position ? data.exercises[position.exerciseIndex] : undefined;
  const currentSet = current && position ? current.sets[position.setIndex] : undefined;

  async function log(values: Draft, skip: boolean) {
    if (!current || !currentSet || !position) return;
    setError("");
    const weight = parseAmount(values.weight);
    const reps = parseAmount(values.reps);
    if (!skip && (weight == null || reps == null || reps < 1 || !Number.isInteger(reps))) {
      setError("Enter the weight and a whole number of reps. Use 0 for bodyweight.");
      return;
    }
    try {
      const updated = await api.updateSessionSet(
        currentSet.id,
        skip
          ? { skipped: true }
          : { actual_weight: weight, actual_unit: values.unit, actual_reps: reps, rpe: values.rpe, skipped: false, completed: true },
      );
      const next = patchSet(updated);
      if (!skip && !currentSet.completed_at && currentSet.rest_seconds > 0) setRestUntil(Date.now() + currentSet.rest_seconds * 1000);
      if (next) advanceFrom(next, position);
      void queryClient.invalidateQueries({ queryKey: keys.session(sessionId) });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function undo(set: SessionSet) {
    try {
      const updated = await api.updateSessionSet(set.id, set.skipped ? { skipped: false } : { completed: false });
      patchSet(updated);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function addSet(exercise: SessionExercise, exerciseIndex: number) {
    try {
      await api.addSessionSet(exercise.id, nextSetTemplate(exercise, profileUnit));
      const next = await api.session(sessionId);
      store(next);
      setPosition({ exerciseIndex, setIndex: next.exercises[exerciseIndex].sets.length - 1 });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeSet(set: SessionSet) {
    try {
      await api.deleteSessionSet(set.id);
      const next = await api.session(sessionId);
      store(next);
      setPosition(nextPosition(next.exercises) ?? { exerciseIndex: 0, setIndex: 0 });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function addExercise(exerciseId: string) {
    const next = await api.addSessionExercise(sessionId, exerciseId);
    const index = next.exercises.length - 1;
    const added = next.exercises[index];
    if (added.sets.length === 0) await api.addSessionSet(added.id, nextSetTemplate(added, profileUnit));
    const refreshed = await api.session(sessionId);
    store(refreshed);
    setPosition({ exerciseIndex: index, setIndex: 0 });
    setAddingExercise(false);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{data.name}</h1>
          <p className="muted">
            {readOnly ? `Finished, started ${formatWhen(data.started_at)}` : `${tally.done} of ${plural(tally.total, "set")} done`}
          </p>
        </div>
        <div className="row">
          {readOnly ? (
            <Link className="btn" to={`/sessions/${sessionId}/summary`}>
              View summary
            </Link>
          ) : (
            <>
              <button className="btn quiet" onClick={() => setConfirming("discard")}>
                Discard
              </button>
              <button
                className={tally.done >= tally.total ? "btn primary" : "btn"}
                data-testid="finish-session"
                onClick={() => (tally.done < tally.total ? setConfirming("finish") : finish.mutate())}
                disabled={finish.isPending}
              >
                <Check size={18} aria-hidden="true" />
                Finish workout
              </button>
            </>
          )}
        </div>
      </header>
      {!readOnly && (
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={tally.total} aria-valuenow={tally.done} aria-label="Sets done">
          <div style={{ width: `${tally.fraction * 100}%` }} />
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="session">
        <div className="stack-lg">
          {data.exercises.length === 0 && (
            <div className="empty">
              <p>This workout has no exercises yet. Add the first one to start logging.</p>
            </div>
          )}
          {current && currentSet && position && !readOnly && (
            <SetFocus
              key={`${currentSet.id}:${currentSet.updated_at}`}
              exercise={current}
              set={currentSet}
              setIndex={position.setIndex}
              fallbackUnit={profileUnit}
              onLog={(values) => log(values, false)}
              onSkip={(values) => log(values, true)}
            />
          )}
          {!readOnly && tally.total > 0 && tally.done === tally.total && (
            <div className="panel stack" role="status">
              <h2>Every set is logged</h2>
              <p className="muted">Add another set or exercise, or finish to see how it went.</p>
              <div>
                <button className="btn primary" onClick={() => finish.mutate()} disabled={finish.isPending}>
                  Finish workout
                </button>
              </div>
            </div>
          )}
          {current && position && (
            <section className="panel stack" aria-label={`${current.exercise_name} sets`}>
              <div className="section-head">
                <h3>{current.exercise_name}</h3>
                {!readOnly && (
                  <button className="btn quiet" onClick={() => addSet(current, position.exerciseIndex)} data-testid="add-session-set">
                    <Plus size={16} aria-hidden="true" />
                    Add set
                  </button>
                )}
              </div>
              <SetTable
                exercise={current}
                currentIndex={readOnly ? -1 : position.setIndex}
                readOnly={readOnly}
                onSelect={(setIndex) => setPosition({ exerciseIndex: position.exerciseIndex, setIndex })}
                onUndo={undo}
                onRemove={removeSet}
              />
            </section>
          )}
        </div>

        <aside className="session-aside" aria-label="Exercises in this workout">
          <div className="exercise-nav">
            {data.exercises.map((exercise, index) => (
              <button
                key={exercise.id}
                aria-current={position?.exerciseIndex === index}
                onClick={() => setPosition({ exerciseIndex: index, setIndex: nextInExercise(exercise) ?? 0 })}
              >
                <span style={{ fontWeight: 600 }}>{exercise.exercise_name}</span>
                <span className="pips" aria-label={`${exercise.sets.filter((item) => setState(item) !== "open").length} of ${exercise.sets.length} sets done`}>
                  {exercise.sets.map((item) => (
                    <i key={item.id} data-state={setState(item)} />
                  ))}
                </span>
              </button>
            ))}
          </div>
          {!readOnly &&
            (addingExercise ? (
              <div className="panel tight stack">
                <ExercisePicker onPick={(exercise) => addExercise(exercise.id)} exclude={data.exercises.map((item) => item.exercise_id)} />
                <button className="btn quiet" onClick={() => setAddingExercise(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn" onClick={() => setAddingExercise(true)} data-testid="add-session-exercise">
                <Plus size={18} aria-hidden="true" />
                Add exercise
              </button>
            ))}
        </aside>
      </div>

      {restUntil && <RestTimer until={restUntil} onChange={setRestUntil} />}

      {confirming && (
        <ConfirmDialog
          title={confirming === "finish" ? "Finish with sets left?" : "Discard this workout?"}
          body={
            confirming === "finish"
              ? `${plural(tally.total - tally.done, "set")} still open. They will not count toward your stats.`
              : "Everything you logged in this session will be deleted."
          }
          confirmLabel={confirming === "finish" ? "Finish workout" : "Discard workout"}
          danger={confirming === "discard"}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            if (confirming === "finish") finish.mutate();
            else discard.mutate();
          }}
        />
      )}
    </div>
  );
}

function SetFocus({
  exercise,
  set,
  setIndex,
  fallbackUnit,
  onLog,
  onSkip,
}: {
  exercise: SessionExercise;
  set: SessionSet;
  setIndex: number;
  fallbackUnit: WeightUnit;
  onLog: (values: Draft) => Promise<void>;
  onSkip: (values: Draft) => Promise<void>;
}) {
  const initial = useMemo(() => prefill(exercise, setIndex, fallbackUnit), [exercise, setIndex, fallbackUnit]);
  const [draft, setDraft] = useState<Draft>({
    weight: initial.weight == null ? "" : String(initial.weight),
    reps: initial.reps == null ? "" : String(initial.reps),
    unit: initial.unit,
    rpe: initial.rpe,
  });
  const [busy, setBusy] = useState(false);
  const last = matchingPrevious(exercise, setIndex);
  const ofKind = exercise.sets.filter((item) => item.kind === set.kind);
  const ordinal = exercise.sets.slice(0, setIndex + 1).filter((item) => item.kind === set.kind).length;
  const target =
    set.target_weight != null || set.target_reps != null
      ? `${set.target_weight != null ? `${trimNumber(set.target_weight, 2)} ${set.target_unit ?? ""}` : "Any weight"}${set.target_reps != null ? ` × ${set.target_reps}` : ""}${set.target_percent != null ? ` (${trimNumber(set.target_percent)}% of max)` : ""}${set.target_rpe != null ? ` @ ${set.target_rpe}` : ""}`
      : null;
  const weightValue = parseAmount(draft.weight);

  async function run(action: (values: Draft) => Promise<void>) {
    setBusy(true);
    try {
      await action(draft);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="focus"
      aria-label="Current set"
      onSubmit={(event) => {
        event.preventDefault();
        void run(onLog);
      }}
    >
      <div className="stack">
        <h2 className="focus-title" data-testid="focus-exercise">
          {exercise.exercise_name}
        </h2>
        <div className="focus-meta">
          <span className="num" data-testid="focus-set">
            {set.kind === "warmup" ? "Warmup" : "Set"} {ordinal} of {ofKind.length}
          </span>
          {set.kind === "warmup" && <span className="tag warmup">Warmup, not counted in stats</span>}
          {set.completed_at && <span className="tag">Logged, editing</span>}
          {set.rest_seconds > 0 && <span>{formatClock(set.rest_seconds)} rest after</span>}
        </div>
        <div className="hint">
          {target && (
            <span>
              Plan <b>{target}</b>
            </span>
          )}
          <span data-testid="previous-sets">
            Last time <b>{last ? `${formatPair(last.actual_weight, last.actual_unit, last.actual_reps)}${last.rpe ? ` @ ${last.rpe}` : ""}` : "first time"}</b>
          </span>
        </div>
      </div>

      <div className="steppers">
        <Stepper
          label="Weight"
          testId={`weight-${setIndex}`}
          value={draft.weight}
          step={weightStep(draft.unit)}
          onChange={(weight) => setDraft({ ...draft, weight })}
          extra={
            <div className="segmented" role="group" aria-label="Unit">
              {(["lb", "kg"] as const).map((unit) => (
                <button key={unit} type="button" aria-pressed={draft.unit === unit} onClick={() => setDraft({ ...draft, unit })}>
                  {unit}
                </button>
              ))}
            </div>
          }
        />
        <Stepper label="Reps" testId={`reps-${setIndex}`} value={draft.reps} step={1} decimals={0} onChange={(reps) => setDraft({ ...draft, reps })} />
      </div>

      <div className="stack">
        <span className="small muted" id="rpe-label">
          How hard was it? RPE, optional
        </span>
        <div className="rpe" role="group" aria-labelledby="rpe-label">
          {RPE_CHOICES.map((value) => (
            <button key={value} type="button" aria-pressed={draft.rpe === value} onClick={() => setDraft({ ...draft, rpe: draft.rpe === value ? null : value })}>
              {value}
            </button>
          ))}
        </div>
      </div>

      <PlateBar weight={weightValue} unit={draft.unit} />

      <div className="row">
        <button className="btn primary big" style={{ flex: 1 }} type="submit" data-testid={`done-${setIndex}`} disabled={busy}>
          <Check size={22} aria-hidden="true" />
          {set.completed_at ? "Save changes" : "Log set"}
        </button>
        {!set.completed_at && (
          <button className="btn big" type="button" onClick={() => run(onSkip)} disabled={busy}>
            <SkipForward size={20} aria-hidden="true" />
            Skip
          </button>
        )}
      </div>
    </form>
  );
}

function SetTable({
  exercise,
  currentIndex,
  readOnly,
  onSelect,
  onUndo,
  onRemove,
}: {
  exercise: SessionExercise;
  currentIndex: number;
  readOnly: boolean;
  onSelect: (index: number) => void;
  onUndo: (set: SessionSet) => void;
  onRemove: (set: SessionSet) => void;
}) {
  if (exercise.sets.length === 0) return <p className="muted">No sets yet.</p>;
  return (
    <table className="set-table">
      <thead>
        <tr>
          <th scope="col">Set</th>
          <th scope="col">Plan</th>
          <th scope="col">Logged</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {exercise.sets.map((set, index) => (
          <tr key={set.id} data-current={index === currentIndex}>
            <td>
              {readOnly ? (
                index + 1
              ) : (
                <button className="linklike" type="button" onClick={() => onSelect(index)} aria-label={`Go to set ${index + 1}`}>
                  {index + 1}
                </button>
              )}
              {set.kind === "warmup" && (
                <span className="tag warmup" style={{ marginLeft: 8 }}>
                  W
                </span>
              )}
            </td>
            <td className="muted">
              {set.target_weight != null || set.target_reps != null ? formatPair(set.target_weight, set.target_unit, set.target_reps) : "Open"}
            </td>
            <td className="num">
              {set.skipped ? <span className="muted">Skipped</span> : set.completed_at ? `${formatPair(set.actual_weight, set.actual_unit, set.actual_reps)}${set.rpe ? ` @ ${set.rpe}` : ""}` : <span className="muted">Not yet</span>}
            </td>
            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              {!readOnly && setState(set) !== "open" && (
                <button className="btn quiet" type="button" onClick={() => onUndo(set)} aria-label={`Reopen set ${index + 1}`}>
                  Reopen
                </button>
              )}
              {!readOnly && setState(set) === "open" && (
                <button className="btn quiet icon" type="button" onClick={() => onRemove(set)} aria-label={`Remove set ${index + 1}`}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RestTimer({ until, onChange }: { until: number; onChange: (value: number | null) => void }) {
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const original = document.title;
    document.title = remaining > 0 ? `Rest ${formatClock(remaining)}` : "Rest done";
    return () => {
      document.title = original;
    };
  }, [remaining]);
  useEffect(() => {
    if (remaining > 0) return;
    navigator.vibrate?.([200, 100, 200]);
    const timer = window.setTimeout(() => onChange(null), 4000);
    return () => window.clearTimeout(timer);
  }, [remaining, onChange]);

  return (
    <div className="rest" role="timer" aria-live="polite" data-testid="rest-timer">
      <div className="rest-card">
        <div style={{ flex: 1 }}>
          <div className="small" style={{ color: "var(--muted)" }}>
            {remaining > 0 ? "Rest" : "Rest done. Next set."}
          </div>
          <div className="clock">{formatClock(remaining)}</div>
        </div>
        <button className="btn" onClick={() => onChange(Math.max(until, Date.now()) + 30_000)}>
          +30s
        </button>
        <button className="btn primary" onClick={() => onChange(null)} aria-label="Skip rest">
          <X size={18} aria-hidden="true" />
          Skip
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
  }, []);
  return (
    <dialog ref={ref} onCancel={onCancel} aria-labelledby="confirm-title">
      <div className="stack-lg">
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onCancel}>
            Keep going
          </button>
          <button className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm} data-testid="confirm">
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
