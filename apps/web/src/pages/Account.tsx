import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WeightUnit } from "@swolltech/api-client";
import { useApi, useAuth } from "../auth";
import { Toast } from "../components/Feedback";
import { errorMessage } from "../format";
import { keys, useProfile } from "../hooks";

export function AccountPage() {
  const api = useApi();
  const { signOut, email } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const [name, setName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const update = useMutation({
    mutationFn: (body: { display_name?: string; unit_preference?: WeightUnit }) => api.updateMe(body),
    onSuccess: async (next, body) => {
      queryClient.setQueryData(keys.me, next);
      setName(null);
      setToast(body.unit_preference ? `Showing weights in ${body.unit_preference === "kg" ? "kilograms" : "pounds"}` : "Name saved");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteMe(),
    onSuccess: async () => {
      await signOut();
      navigate("/signin", { replace: true });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function saveName(event: FormEvent) {
    event.preventDefault();
    if (name == null) return;
    update.mutate({ display_name: name.trim() });
  }

  const unit = profile.data?.unit_preference ?? "lb";

  return (
    <div className="page">
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
      <header className="page-head">
        <div>
          <h1>Account</h1>
          {email && <p className="muted">Signed in as {email}</p>}
        </div>
        <button className="btn" onClick={() => signOut()}>
          Sign out
        </button>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <form className="panel stack" onSubmit={saveName}>
        <h2>Name</h2>
        <div className="row">
          <input aria-label="Display name" value={name ?? profile.data?.display_name ?? ""} onChange={(event) => setName(event.target.value)} maxLength={80} style={{ maxWidth: 320 }} />
          <button className="btn primary" type="submit" disabled={name == null}>
            Save name
          </button>
        </div>
      </form>

      <section className="panel stack">
        <h2>Units</h2>
        <p className="muted">Charts and totals use this unit. You can still log any set in either unit.</p>
        <div className="segmented" role="group" aria-label="Weight unit">
          {(["lb", "kg"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={unit === option} data-testid={`unit-${option}`} onClick={() => update.mutate({ unit_preference: option })}>
              {option === "lb" ? "Pounds" : "Kilograms"}
            </button>
          ))}
        </div>
      </section>

      <form
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (confirm === "DELETE") remove.mutate();
        }}
      >
        <h2>Delete account</h2>
        <p className="muted">This permanently deletes your workouts, sessions, records and videos. It cannot be undone.</p>
        <label className="field" style={{ maxWidth: 320 }}>
          <span>Type DELETE to confirm</span>
          <input data-testid="delete-confirm" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" />
        </label>
        <div>
          <button className="btn danger" type="submit" disabled={confirm !== "DELETE" || remove.isPending}>
            Delete my account
          </button>
        </div>
      </form>
    </div>
  );
}
