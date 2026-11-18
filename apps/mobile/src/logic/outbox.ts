/**
 * Decisions for writing to the offline outbox.
 *
 * The server checks base_updated_at on every update of an existing row, so the
 * phone must send at most one pending change per row and keep the base it was
 * built on. Edits made after a change was sent (even if the answer never came back)
 * become a new mutation: the server may already have the old one under its id and would
 * answer "duplicate", dropping the new payload.
 */
export interface PendingItem {
  clientMutationId: string;
  entity: string;
  op: "upsert" | "delete";
  entityId: string;
  baseUpdatedAt: string | null;
  payload: Record<string, unknown>;
}

export type OutboxAction =
  | { kind: "insert"; item: PendingItem }
  | { kind: "update"; item: PendingItem }
  | { kind: "remove"; clientMutationId: string }
  | { kind: "none" };

export interface WriteInput {
  entity: string;
  entityId: string;
  op: "upsert" | "delete";
  payload: Record<string, unknown>;
  /** updated_at of the row as the server last sent it, if it was ever synced. */
  serverUpdatedAt: string | null;
  pending: PendingItem | null;
  /** The pending change has been sent at least once (or is being sent now). */
  inFlight: boolean;
  newMutationId: () => string;
}

export function planWrite(input: WriteInput): OutboxAction {
  const { entity, entityId, op, payload, serverUpdatedAt, pending, inFlight, newMutationId } = input;
  const neverSynced = serverUpdatedAt == null;

  if (pending && !inFlight) {
    if (op === "delete" && neverSynced && pending.op === "upsert") {
      // The server never saw this row. Forget it entirely.
      return { kind: "remove", clientMutationId: pending.clientMutationId };
    }
    return {
      kind: "update",
      item: { ...pending, op, payload: op === "delete" ? {} : payload },
    };
  }

  if (op === "delete" && neverSynced && !pending) {
    return { kind: "none" };
  }

  return {
    kind: "insert",
    item: {
      clientMutationId: newMutationId(),
      entity,
      op,
      entityId,
      baseUpdatedAt: serverUpdatedAt,
      payload: op === "delete" ? {} : payload,
    },
  };
}

export type RemoteAction =
  | { kind: "apply" }
  | { kind: "rebase"; clientMutationId: string; baseUpdatedAt: string | null }
  | { kind: "drop-local"; clientMutationId: string };

/**
 * A change came back from the server. If the phone has a newer local edit that
 * was not part of this flush, keep the local copy and rebase the edit on the
 * server's timestamp instead of overwriting it.
 */
export function planRemote(
  change: { op: string; row: Record<string, unknown> | null },
  pending: PendingItem | null,
  inFlightIds: Set<string>,
): RemoteAction {
  if (!pending || inFlightIds.has(pending.clientMutationId)) return { kind: "apply" };
  if (change.op === "delete" || !change.row) return { kind: "drop-local", clientMutationId: pending.clientMutationId };
  const stamp = change.row.updated_at;
  return { kind: "rebase", clientMutationId: pending.clientMutationId, baseUpdatedAt: typeof stamp === "string" ? stamp : null };
}

/**
 * The changes to send in one request: outbox order, at most one per row. A second change
 * to the same row is built on the first one's result (its base_updated_at changes when
 * the first applies), so it waits for the next round.
 */
export function pickBatch<T extends { entity: string; entityId: string }>(items: T[], max = 200): T[] {
  const seen = new Set<string>();
  const batch: T[] = [];
  for (const item of items) {
    const key = `${item.entity}:${item.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    batch.push(item);
    if (batch.length >= max) break;
  }
  return batch;
}

/** Entities whose rows point at an exercise by exercise_id. */
export const EXERCISE_REFERENCING = ["exercise_references", "workout_exercises", "session_exercises"] as const;

/** Point a payload at another exercise, if it pointed at `fromId`. Returns null when unchanged. */
export function repointExercise(payload: Record<string, unknown>, fromId: string, toId: string): Record<string, unknown> | null {
  return payload.exercise_id === fromId ? { ...payload, exercise_id: toId } : null;
}
