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

export interface SyncStore {
  cursor(): Promise<number>;
  setCursor(cursor: number): Promise<void>;
  outbox(): Promise<OutboxItem[]>;
  removeOutbox(ids: string[]): Promise<void>;
  applyRemote(change: Change): Promise<void>;
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

export async function flushSync(
  store: SyncStore,
  post: (body: { cursor: number; mutations: SyncMutation[] }) => Promise<SyncResult>,
): Promise<{ offline: boolean; conflicts: number }> {
  const pending = await store.outbox();
  const cursor = await store.cursor();
  let result: SyncResult;
  try {
    result = await post({ cursor, mutations: pending.map(toMutation) });
  } catch (error) {
    if (isOfflineError(error)) return { offline: true, conflicts: 0 };
    throw error;
  }
  const acked: string[] = [];
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
    if (item.status === "applied" || item.status === "duplicate" || item.status === "error") {
      acked.push(item.client_mutation_id);
    }
  }
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
  return { offline: false, conflicts };
}
