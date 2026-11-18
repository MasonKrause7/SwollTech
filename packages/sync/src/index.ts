import type { SyncMutation, SyncResult } from "@swolltech/api-client";

export interface OutboxItem {
  clientMutationId: string;
  entity: string;
  op: "upsert" | "delete";
  entityId: string;
  baseUpdatedAt: string | null;
  payload: Record<string, unknown>;
}

export interface Change {
  entity: string;
  entityId: string;
  op: string;
  row: Record<string, unknown> | null;
}

export interface FailedChange {
  item: OutboxItem;
  detail: string;
}

export interface SyncStore {
  cursor(): Promise<number>;
  setCursor(cursor: number): Promise<void>;
  /**
   * The next batch to send. The store must mark these as sent before returning them, so a
   * later edit never folds into a change the server may already have.
   */
  outbox(): Promise<OutboxItem[]>;
  removeOutbox(ids: string[]): Promise<void>;
  /** Changes the server refused: move them out of the outbox, keeping payload and reason, so the user can retry or discard them. */
  deadLetter(failed: FailedChange[]): Promise<void>;
  /** A new row was merged into an existing one on the server: repoint local references to it. */
  remap?(entity: string, fromId: string, toRow: Record<string, unknown>): Promise<void>;
  applyRemote(change: Change): Promise<void>;
}

export interface FlushResult {
  offline: boolean;
  conflicts: number;
  failed: number;
  /** The server has more changes after the new cursor. */
  hasMore: boolean;
}

export class OfflineError extends Error {
  constructor() {
    super("offline");
    this.name = "OfflineError";
  }
}

export function isOfflineError(error: unknown): boolean {
  if (error instanceof OfflineError) return true;
  if (error instanceof TypeError) return true;
  return false;
}

function toMutation(item: OutboxItem): SyncMutation {
  return {
    client_mutation_id: item.clientMutationId,
    entity: item.entity,
    op: item.op,
    entity_id: item.entityId,
    base_updated_at: item.baseUpdatedAt,
    payload: item.payload,
  };
}

/** Changes pulled per request. Vercel caps a response at 4.5 MB. */
export const PULL_LIMIT = 500;

/**
 * One batch to the server: send the outbox, apply the answer, pull changes.
 *
 * Applied, duplicate and conflict results leave the outbox (a conflict takes the server's
 * row). Errors move to the store's dead letters with their payload. Anything else stays
 * queued and is sent again.
 */
export async function flushSync(
  store: SyncStore,
  post: (body: { cursor: number; mutations: SyncMutation[]; limit?: number }) => Promise<SyncResult>,
): Promise<FlushResult> {
  const pending = await store.outbox();
  const cursor = await store.cursor();
  let result: SyncResult;
  try {
    result = await post({ cursor, mutations: pending.map(toMutation), limit: PULL_LIMIT });
  } catch (error) {
    if (isOfflineError(error)) return { offline: true, conflicts: 0, failed: 0, hasMore: false };
    throw error;
  }
  const acked: string[] = [];
  const failed: FailedChange[] = [];
  let conflicts = 0;
  for (const item of result.applied) {
    const original = pending.find((entry) => entry.clientMutationId === item.client_mutation_id);
    if (item.status === "conflict") {
      conflicts += 1;
      acked.push(item.client_mutation_id);
      if (original && item.server_row) {
        await store.applyRemote({
          entity: original.entity,
          entityId: original.entityId,
          op: "upsert",
          row: item.server_row,
        });
      }
      continue;
    }
    if (item.status === "merged") {
      acked.push(item.client_mutation_id);
      if (original && item.server_row && store.remap) await store.remap(original.entity, original.entityId, item.server_row);
      continue;
    }
    if (item.status === "error") {
      if (original) failed.push({ item: original, detail: item.detail ?? "Could not save that change" });
      else acked.push(item.client_mutation_id);
      continue;
    }
    if (item.status === "applied" || item.status === "duplicate") {
      acked.push(item.client_mutation_id);
    }
  }
  if (failed.length) await store.deadLetter(failed);
  await store.removeOutbox(acked);
  for (const change of result.changes) {
    await store.applyRemote({
      entity: change.entity,
      entityId: change.entity_id,
      op: change.op,
      row: change.row,
    });
  }
  await store.setCursor(result.cursor);
  return { offline: false, conflicts, failed: failed.length, hasMore: Boolean(result.has_more) };
}
