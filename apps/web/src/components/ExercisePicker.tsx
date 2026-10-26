import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { Exercise } from "@swolltech/api-client";
import { useApi } from "../auth";
import { errorMessage } from "../format";
import { keys, useExercises } from "../hooks";

/** Search the catalog and your own exercises. Creates a custom one when nothing matches. */
export function ExercisePicker({ onPick, exclude = [], label = "Add an exercise" }: { onPick: (exercise: Exercise) => void | Promise<void>; exclude?: string[]; label?: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const exercises = useExercises();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const term = query.trim().toLowerCase();
  const all = exercises.data ?? [];
  const shown = term
    ? all.filter((item) => item.name.toLowerCase().includes(term) || item.primary_muscle.toLowerCase().includes(term)).slice(0, 8)
    : [];
  const exact = all.some((item) => item.name.toLowerCase() === term);

  async function pick(exercise: Exercise) {
    setBusy(true);
    setError("");
    try {
      await onPick(exercise);
      setQuery("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createAndPick() {
    setBusy(true);
    setError("");
    try {
      const created = await api.createExercise({ name: query.trim() });
      await queryClient.invalidateQueries({ queryKey: keys.exercises });
      await onPick(created);
      setQuery("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <label className="field">
        <span>{label}</span>
        <input data-testid="exercise-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search, for example bench or quads" />
      </label>
      {term && (
        <div className="list" role="listbox" aria-label="Matching exercises">
          {shown.map((item) => (
            <button
              key={item.id}
              role="option"
              aria-selected="false"
              className="list-row"
              data-testid={`add-${item.name}`}
              onClick={() => pick(item)}
              disabled={busy || exclude.includes(item.id)}
            >
              <span>
                <span className="title">{item.name}</span>
                <span className="small muted"> {[item.primary_muscle, item.equipment, item.owner_id ? "yours" : ""].filter(Boolean).join(", ")}</span>
              </span>
              <Plus size={18} aria-hidden="true" />
            </button>
          ))}
          {!exact && (
            <button className="list-row" onClick={createAndPick} disabled={busy} data-testid="create-exercise">
              <span>
                Create <b>{query.trim()}</b> as a custom exercise
              </span>
              <Plus size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
