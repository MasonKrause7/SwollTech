export type SyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "synced"; at: number; conflicts: number }
  | { kind: "offline"; pending: number }
  | { kind: "error"; message: string; pending: number };

export function describeSync(state: SyncState, pending: number): { label: string; tone: "ok" | "wait" | "bad" } {
  switch (state.kind) {
    case "syncing":
      return { label: "Syncing", tone: "wait" };
    case "synced":
      if (pending > 0) return { label: `Saving on this phone (${pending})`, tone: "wait" };
      return state.conflicts > 0
        ? { label: `Synced. ${state.conflicts} change${state.conflicts === 1 ? "" : "s"} replaced by a newer edit`, tone: "ok" }
        : { label: "Synced", tone: "ok" };
    case "offline":
      return { label: pending > 0 ? `Saving on this phone (${pending})` : "Offline", tone: "wait" };
    case "error":
      return { label: `Sync failed: ${state.message}`, tone: "bad" };
    default:
      return pending > 0 ? { label: `Saving on this phone (${pending})`, tone: "wait" } : { label: "Not synced yet", tone: "wait" };
  }
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) return "sign in again";
    if (status === 429) return "too many requests, try again shortly";
    if (status >= 500) return "server unavailable";
  }
  if (error instanceof Error && error.message) return error.message;
  return "unknown error";
}
