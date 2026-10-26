import type { OutboxItem, SyncStore, Change } from "@swolltech/sync";
import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";
import { planRemote, planWrite, type PendingItem } from "./logic/outbox";
import { CHILDREN, toPayload } from "./logic/payloads";
import type { Entity, EntityRows } from "./logic/rows";
import type { LocalData } from "./logic/session";

const SCHEMA = `
create table if not exists meta (key text primary key, value text);
create table if not exists outbox (
  id text primary key,
  entity text not null,
  op text not null,
  entity_id text not null,
  base_updated_at text,
  payload text not null
);
create index if not exists outbox_entity_idx on outbox (entity, entity_id);
create table if not exists rows (
  entity text not null,
  id text not null,
  body text not null,
  primary key (entity, id)
);
create table if not exists uploads (
  id text primary key,
  set_id text not null,
  local_uri text not null,
  content_type text not null,
  status text not null
);
`;

export type Notebook = SQLite.SQLiteDatabase;

export function newId() {
  return Crypto.randomUUID();
}

let opened: Promise<Notebook> | null = null;
const listeners = new Set<() => void>();
/** Mutation ids currently being sent to the server. */
const inFlight = new Set<string>();

export function openNotebook() {
  if (!opened) {
    opened = SQLite.openDatabaseAsync("swolltech.db").then(async (db) => {
      await db.execAsync("pragma journal_mode = wal;");
      await db.execAsync(SCHEMA);
      return db;
    });
  }
  return opened;
}

/** Tell screens that local data changed. */
export function notifyChange() {
  for (const listener of listeners) listener();
}

export function onNotebookChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Wipe everything on sign out so the next person on this phone starts clean. */
export async function clearNotebook() {
  const db = await openNotebook();
  await db.execAsync("delete from rows; delete from outbox; delete from uploads; delete from meta;");
  inFlight.clear();
  notifyChange();
}

type RowOf<E extends Entity> = EntityRows[E];

export async function readRows<E extends Entity>(db: Notebook, entity: E): Promise<RowOf<E>[]> {
  const rows = await db.getAllAsync<{ body: string }>("select body from rows where entity = ?", entity);
  return rows.map((row) => JSON.parse(row.body) as RowOf<E>);
}

export async function getRow<E extends Entity>(db: Notebook, entity: E, id: string): Promise<RowOf<E> | null> {
  const row = await db.getFirstAsync<{ body: string }>("select body from rows where entity = ? and id = ?", entity, id);
  return row ? (JSON.parse(row.body) as RowOf<E>) : null;
}

export async function loadAll(db: Notebook): Promise<LocalData> {
  const all = await db.getAllAsync<{ entity: string; body: string }>("select entity, body from rows");
  const data: LocalData = {
    exercises: [],
    references: [],
    workouts: [],
    workoutExercises: [],
    workoutSets: [],
    sessions: [],
    sessionExercises: [],
    sessionSets: [],
  };
  const map: Record<string, keyof LocalData> = {
    exercises: "exercises",
    exercise_references: "references",
    workouts: "workouts",
    workout_exercises: "workoutExercises",
    workout_sets: "workoutSets",
    sessions: "sessions",
    session_exercises: "sessionExercises",
    session_sets: "sessionSets",
  };
  for (const row of all) {
    const key = map[row.entity];
    if (key) (data[key] as unknown[]).push(JSON.parse(row.body));
  }
  return data;
}

async function pendingFor(db: Notebook, entity: string, entityId: string): Promise<PendingItem | null> {
  const row = await db.getFirstAsync<{ id: string; entity: string; op: "upsert" | "delete"; entity_id: string; base_updated_at: string | null; payload: string }>(
    "select * from outbox where entity = ? and entity_id = ? order by rowid desc limit 1",
    entity,
    entityId,
  );
  if (!row) return null;
  return {
    clientMutationId: row.id,
    entity: row.entity,
    op: row.op,
    entityId: row.entity_id,
    baseUpdatedAt: row.base_updated_at,
    payload: JSON.parse(row.payload),
  };
}

async function writeOutbox(db: Notebook, entity: Entity, entityId: string, op: "upsert" | "delete", payload: Record<string, unknown>, serverUpdatedAt: string | null) {
  const pending = await pendingFor(db, entity, entityId);
  const action = planWrite({
    entity,
    entityId,
    op,
    payload,
    serverUpdatedAt,
    pending,
    inFlight: pending ? inFlight.has(pending.clientMutationId) : false,
    newMutationId: newId,
  });
  if (action.kind === "insert") {
    const item = action.item;
    await db.runAsync(
      "insert into outbox (id, entity, op, entity_id, base_updated_at, payload) values (?, ?, ?, ?, ?, ?)",
      item.clientMutationId,
      item.entity,
      item.op,
      item.entityId,
      item.baseUpdatedAt,
      JSON.stringify(item.payload),
    );
  } else if (action.kind === "update") {
    // Update in place so the change keeps its spot in line behind its parents.
    await db.runAsync("update outbox set op = ?, payload = ? where id = ?", action.item.op, JSON.stringify(action.item.payload), action.item.clientMutationId);
  } else if (action.kind === "remove") {
    await db.runAsync("delete from outbox where id = ?", action.clientMutationId);
  }
}

/** Save rows locally and queue them for sync, all in one transaction. */
export async function saveRows<E extends Entity>(db: Notebook, entity: E, rows: RowOf<E>[]) {
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const current = await getRow(db, entity, row.id);
      const body = { ...row, updated_at: current?.updated_at ?? row.updated_at ?? null };
      await db.runAsync("insert or replace into rows (entity, id, body) values (?, ?, ?)", entity, row.id, JSON.stringify(body));
      await writeOutbox(db, entity, row.id, "upsert", toPayload(entity, body), (body.updated_at as string | null) ?? null);
    }
  });
  notifyChange();
}

export async function saveRow<E extends Entity>(db: Notebook, entity: E, row: RowOf<E>) {
  await saveRows(db, entity, [row]);
}

async function removeTree(db: Notebook, entity: Entity, id: string, top: boolean) {
  const current = await getRow(db, entity, id);
  for (const child of CHILDREN[entity] ?? []) {
    const rows = (await readRows(db, child.entity)) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      if (row[child.key] === id) await removeTree(db, child.entity, String(row.id), false);
    }
  }
  await db.runAsync("delete from rows where entity = ? and id = ?", entity, id);
  if (top) {
    await writeOutbox(db, entity, id, "delete", {}, current?.updated_at ?? null);
  } else {
    // The server deletes children with their parent. Drop any of their changes that are not already on the way.
    const pending = await db.getAllAsync<{ id: string }>("select id from outbox where entity = ? and entity_id = ?", entity, id);
    for (const item of pending) if (!inFlight.has(item.id)) await db.runAsync("delete from outbox where id = ?", item.id);
  }
}

export async function deleteRow(db: Notebook, entity: Entity, id: string) {
  await db.withTransactionAsync(async () => {
    await removeTree(db, entity, id, true);
  });
  notifyChange();
}

export async function pendingCount(db: Notebook) {
  const row = await db.getFirstAsync<{ count: number }>("select count(*) as count from outbox");
  return row?.count ?? 0;
}

/** Store the shared exercise catalog, which is not part of the per-user change feed. */
export async function storeCatalog(db: Notebook, exercises: Record<string, unknown>[], version: number) {
  await db.withTransactionAsync(async () => {
    const existing = await readRows(db, "exercises");
    for (const row of existing) {
      if (row.owner_id == null && !exercises.some((item) => item.id === row.id)) {
        await db.runAsync("delete from rows where entity = 'exercises' and id = ?", row.id);
      }
    }
    for (const row of exercises) {
      await db.runAsync("insert or replace into rows (entity, id, body) values ('exercises', ?, ?)", String(row.id), JSON.stringify(row));
    }
    await db.runAsync("insert or replace into meta (key, value) values ('catalog_version', ?)", String(version));
  });
}

export async function getMeta(db: Notebook, key: string) {
  const row = await db.getFirstAsync<{ value: string }>("select value from meta where key = ?", key);
  return row?.value ?? null;
}

export async function setMeta(db: Notebook, key: string, value: string) {
  await db.runAsync("insert or replace into meta (key, value) values (?, ?)", key, value);
}

export function storeFor(db: Notebook): SyncStore {
  return {
    async cursor() {
      return Number((await getMeta(db, "cursor")) ?? "0");
    },
    async setCursor(cursor: number) {
      await setMeta(db, "cursor", String(cursor));
    },
    async outbox(): Promise<OutboxItem[]> {
      const rows = await db.getAllAsync<{ id: string; entity: string; op: "upsert" | "delete"; entity_id: string; base_updated_at: string | null; payload: string }>(
        "select * from outbox order by rowid limit 200",
      );
      inFlight.clear();
      for (const row of rows) inFlight.add(row.id);
      return rows.map((row) => ({
        clientMutationId: row.id,
        entity: row.entity,
        op: row.op,
        entityId: row.entity_id,
        baseUpdatedAt: row.base_updated_at,
        payload: JSON.parse(row.payload),
      }));
    },
    async removeOutbox(ids: string[]) {
      for (const id of ids) await db.runAsync("delete from outbox where id = ?", id);
    },
    async applyRemote(change: Change) {
      const pending = await pendingFor(db, change.entity, change.entityId);
      const plan = planRemote(change, pending, inFlight);
      if (plan.kind === "rebase") {
        await db.runAsync("update outbox set base_updated_at = ? where id = ?", plan.baseUpdatedAt, plan.clientMutationId);
        const local = await getRow(db, change.entity as Entity, change.entityId);
        if (local) {
          await db.runAsync(
            "update rows set body = ? where entity = ? and id = ?",
            JSON.stringify({ ...local, updated_at: plan.baseUpdatedAt }),
            change.entity,
            change.entityId,
          );
        }
        return;
      }
      if (plan.kind === "drop-local") {
        await db.runAsync("delete from outbox where id = ?", plan.clientMutationId);
      }
      if (change.op === "delete" || !change.row) {
        await db.runAsync("delete from rows where entity = ? and id = ?", change.entity, change.entityId);
        return;
      }
      await db.runAsync("insert or replace into rows (entity, id, body) values (?, ?, ?)", change.entity, change.entityId, JSON.stringify(change.row));
    },
  };
}

export function endFlight() {
  inFlight.clear();
}

export async function queueVideo(db: Notebook, setId: string, localUri: string, contentType: string) {
  await db.runAsync(
    "insert or replace into uploads (id, set_id, local_uri, content_type, status) values (?, ?, ?, ?, 'local')",
    newId(),
    setId,
    localUri,
    contentType,
  );
}

export async function pendingUploads(db: Notebook) {
  return db.getAllAsync<{ id: string; set_id: string; local_uri: string; content_type: string }>(
    "select id, set_id, local_uri, content_type from uploads where status = 'local'",
  );
}

export async function markUpload(db: Notebook, id: string, status: string) {
  await db.runAsync("update uploads set status = ? where id = ?", status, id);
}
