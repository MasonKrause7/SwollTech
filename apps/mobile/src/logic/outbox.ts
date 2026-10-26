/**
 * Decisions for writing to the offline outbox.
 *
 * The server checks base_updated_at on every update of an existing row, so the
 * phone must send at most one pending change per row and keep the base it was
 * built on. Edits made while a flush is in flight become a new mutation, so the
 * acknowledgement of the old one does not drop them.
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
