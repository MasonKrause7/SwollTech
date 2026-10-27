import { FormEvent, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { devLoginEnabled, useAuth } from "../auth";
import { errorMessage } from "../format";

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-art" aria-hidden="true">
        <div className="brand">SwollTech</div>
        <div className="auth-hero">
          <div className="stack-lg">
            <span className="eyebrow">Training notebook</span>
            <h1>
              Write it down. Lift it. <em>Beat it next week.</em>
            </h1>
            <p>The notebook you already keep at the gym, with the math done for you. Plan a workout, follow it set by set, and see every lift trend up.</p>
          </div>
          <div className="hero-art" data-label="Mascot art" />
        </div>
      </section>
      <main className="auth-form">{children}</main>
    </div>
  );
}

export function SignInPage() {
  const { signedIn, signInWithPassword, devSignIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (signedIn) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const failure = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (failure) setError(failure);
    else navigate(from, { replace: true });
  }

  async function local() {
    setBusy(true);
    setError("");
    try {
      await devSignIn(email.trim() || "lifter@example.com");
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Local sign-in failed. Is the API running with DEV_TOKEN_ENABLED=true?"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="stack-lg" onSubmit={onSubmit}>
        <div className="stack">
          <h2 style={{ fontSize: "2rem" }}>Sign in</h2>
          <p className="muted">Pick up where your last session left off.</p>
        </div>
        <label className="field">
          <span>Email</span>
          <input data-testid="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required={!devLoginEnabled} />
        </label>
        <label className="field">
          <span>Password</span>
          <input data-testid="password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required={!devLoginEnabled} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary big block" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {devLoginEnabled && (
          <button className="btn block" type="button" data-testid="dev-login" onClick={local} disabled={busy}>
            Use local test account
          </button>
        )}
        <div className="row between">
          <Link to="/signup">Create an account</Link>
          <Link to="/reset">Forgot password?</Link>
        </div>
      </form>
    </AuthLayout>
  );
}

export function SignUpPage() {
  const { signUp, signedIn } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (signedIn) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await signUp(email.trim(), password, name.trim());
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.needsConfirmation) setSent(true);
    else navigate("/", { replace: true });
  }

  return (
    <AuthLayout>
      {sent ? (
        <div className="stack-lg" role="status">
          <h2 style={{ fontSize: "2rem" }}>Check your email</h2>
          <p>We sent a confirmation link to {email}. Open it on this device, then sign in.</p>
          <Link className="btn" to="/signin">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form className="stack-lg" onSubmit={onSubmit}>
          <div className="stack">
            <h2 style={{ fontSize: "2rem" }}>Create your account</h2>
            <p className="muted">Your workouts and history stay in your account on every device.</p>
          </div>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={80} />
          </label>
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required />
            <small className="muted">At least 8 characters.</small>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary big block" type="submit" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
          <Link to="/signin">I already have an account</Link>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPage() {
  const { requestReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const failure = await requestReset(email.trim());
    if (failure) setError(failure);
    else setSent(true);
  }

  return (
    <AuthLayout>
      <form className="stack-lg" onSubmit={onSubmit}>
        <div className="stack">
          <h2 style={{ fontSize: "2rem" }}>Reset your password</h2>
          <p className="muted">We will email you a link to choose a new one.</p>
        </div>
        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {sent && <p role="status">If an account uses {email}, a reset link is on its way.</p>}
        <button className="btn primary big block" type="submit">
          Send reset link
        </button>
        <Link to="/signin">Back to sign in</Link>
      </form>
    </AuthLayout>
  );
}

export function UpdatePasswordPage() {
  const { updatePassword, signedIn } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    const failure = await updatePassword(password);
    if (failure) setError(failure);
    else navigate("/", { replace: true });
  }

  return (
    <AuthLayout>
      <form className="stack-lg" onSubmit={onSubmit}>
        <div className="stack">
          <h2 style={{ fontSize: "2rem" }}>Choose a new password</h2>
          {!signedIn && <p className="muted">Open the link from your reset email to get here.</p>}
        </div>
        <label className="field">
          <span>New password</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary big block" type="submit" disabled={!signedIn}>
          Save password
        </button>
      </form>
    </AuthLayout>
  );
}
