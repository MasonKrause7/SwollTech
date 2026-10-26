import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../auth";
import { LoadError, Loading } from "../components/Feedback";
import { errorMessage } from "../format";
import { keys, useExercises } from "../hooks";

const MUSCLES = ["chest", "back", "shoulders", "quads", "hamstrings", "glutes", "biceps", "triceps", "calves", "core", "other"];
const EQUIPMENT = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "other"];

export function ExercisesPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const exercises = useExercises();
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("chest");
  const [equipment, setEquipment] = useState("barbell");
  const [error, setError] = useState("");

  if (exercises.isPending) return <Loading />;
  if (exercises.error) return <LoadError error={exercises.error} retry={() => exercises.refetch()} />;

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.createExercise({ name: name.trim(), primary_muscle: muscle, equipment });
      setName("");
      await queryClient.invalidateQueries({ queryKey: keys.exercises });
    } catch (err) {
      setError(errorMessage(err, "Could not add that exercise."));
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await api.deleteExercise(id);
      await queryClient.invalidateQueries({ queryKey: keys.exercises });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const term = filter.trim().toLowerCase();
  const shown = exercises.data.filter((item) => !term || item.name.toLowerCase().includes(term) || item.primary_muscle.includes(term));
  const groups = new Map<string, typeof shown>();
  for (const item of shown) {
    const key = item.primary_muscle || "other";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Exercises</h1>
          <p className="lede">The shared catalog plus anything you add. Progress follows the exercise across every workout.</p>
        </div>
      </header>

      <form className="panel stack" onSubmit={create}>
        <h2>Add your own</h2>
        <div className="inline-inputs">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="Zercher squat" />
          </label>
          <label className="field">
            <span>Main muscle</span>
            <select value={muscle} onChange={(event) => setMuscle(event.target.value)}>
              {MUSCLES.map((item) => (
                <option key={item} value={item}>
                  {item[0].toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Equipment</span>
            <select value={equipment} onChange={(event) => setEquipment(event.target.value)}>
              {EQUIPMENT.map((item) => (
                <option key={item} value={item}>
                  {item[0].toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary" type="submit">
            Add exercise
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>

      <label className="field" style={{ maxWidth: 360 }}>
        <span>Find an exercise</span>
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Name or muscle" />
      </label>

      {[...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([group, items]) => (
          <section key={group} className="section">
            <h2 style={{ textTransform: "capitalize" }}>{group}</h2>
            <div className="list">
              {items.map((item) => (
                <div key={item.id} className="list-row">
                  <Link to={`/progress/${item.id}`} style={{ textDecoration: "none", flex: 1 }}>
                    <div className="title">{item.name}</div>
                    <div className="small muted" style={{ textTransform: "capitalize" }}>
                      {item.equipment || "Any equipment"}
                      {item.owner_id ? ", added by you" : ""}
                    </div>
                  </Link>
                  {item.owner_id && (
                    <button className="btn quiet icon" onClick={() => remove(item.id)} aria-label={`Delete ${item.name}`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      {shown.length === 0 && <p className="muted">Nothing matches. Add it above.</p>}
    </div>
  );
}
