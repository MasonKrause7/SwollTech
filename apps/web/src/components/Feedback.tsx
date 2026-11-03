import { useEffect, type ReactNode } from "react";

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2400);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p className="muted" role="status">
      {label}…
    </p>
  );
}

/** Blank notebook: the mascot's face keeps the empty state from looking unfinished. */
export function BrandEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="brand-empty">
      <img src="/art/mascot-mark.webp" alt="" width={72} height={72} />
      <div className="brand-empty-copy">{children}</div>
    </div>
  );
}

export function LoadError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <p>Could not load this page. {error instanceof Error ? error.message : ""}</p>
      {retry && (
        <button className="btn" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
