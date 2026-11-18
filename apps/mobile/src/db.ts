import type { OutboxItem, SyncStore, Change } from "@swolltech/sync";
import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";
import type { FailedChange } from "@swolltech/sync";
import { EXERCISE_REFERENCING, pickBatch, planRemote, planWrite, repointExercise, type PendingItem } from "./logic/outbox";
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
create table if not exists dead_letters (
  id text primary key,
  entity text not null,
  op text not null,
  entity_id text not null,
  base_updated_at text,
  payload text not null,
  detail text not null,
  failed_at text not null
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
let writing: Promise<unknown> = Promise.resolve();

/** expo-sqlite throws if a second transaction starts while one is open, so transactions queue. */
function transaction(db: Notebook, task: () => Promise<void>): Promise<void> {
  const run = writing.then(() => db.withTransactionAsync(task));
  writing = run.catch(() => undefined);
  return run;
}
/** Mutation ids currently being sent to the server. */
const inFlight = new Set<string>();

export function openNotebook() {
  if (!opened) {
    opened = SQLite.openDatabaseAsync("swolltech.db").then(async (db) => {
      await db.execAsync("pragma journal_mode = wal;");
      await db.execAsync(SCHEMA);
      // 1 once a change has been sent: the server may have it even if the answer was lost.
      const columns = await db.getAllAsync<{ name: string }>("pragma table_info(outbox)");
      if (!columns.some((column) => column.name === "sent")) await db.execAsync("alter table outbox add column sent integer not null default 0;");
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

/**
 * Wipe everything so the next person on this phone starts clean. Only for an explicit sign
 * out (after the user was warned about unsaved changes) or a confirmed switch of account,
 * never because a request was refused.
 */
export async function clearNotebook() {
  const db = await openNotebook();
  await db.execAsync("delete from rows; delete from outbox; delete from dead_letters; delete from uploads; delete from meta;");
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
    schedule: [],
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
    scheduled_workouts: "schedule",
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

type OutboxRow = { id: string; entity: string; op: "upsert" | "delete"; entity_id: string; base_updated_at: string | null; payload: string; sent: number };

function toItem(row: OutboxRow): OutboxItem {
  return {
    clientMutationId: row.id,
    entity: row.entity,
    op: row.op,
    entityId: row.entity_id,
    baseUpdatedAt: row.base_updated_at,
    payload: JSON.parse(row.payload),
  };
}

async function pendingFor(db: Notebook, entity: string, entityId: string): Promise<(PendingItem & { sent: boolean }) | null> {
  const row = await db.getFirstAsync<OutboxRow>(
    "select * from outbox where entity = ? and entity_id = ? order by rowid desc limit 1",
    entity,
    entityId,
  );
  if (!row) return null;
  return { ...toItem(row), sent: row.sent === 1 };
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
    inFlight: pending ? pending.sent || inFlight.has(pending.clientMutationId) : false,
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
    // Update in place so the change keeps its spot in line behind its parents. Never touch
    // one that was sent (planWrite only folds into unsent changes; this is the backstop).
    await db.runAsync("update outbox set op = ?, payload = ? where id = ? and sent = 0", action.item.op, JSON.stringify(action.item.payload), action.item.clientMutationId);
  } else if (action.kind === "remove") {
    await db.runAsync("delete from outbox where id = ? and sent = 0", action.clientMutationId);
  }
}

/** Save rows locally and queue them for sync, all in one transaction. */
export async function saveRows<E extends Entity>(db: Notebook, entity: E, rows: RowOf<E>[]) {
  await transaction(db, async () => {
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
    const pending = await db.getAllAsync<{ id: string }>("select id from outbox where entity = ? and entity_id = ? and sent = 0", entity, id);
    for (const item of pending) if (!inFlight.has(item.id)) await db.runAsync("delete from outbox where id = ?", item.id);
  }
}

export async function deleteRow(db: Notebook, entity: Entity, id: string) {
  await transaction(db, async () => {
    await removeTree(db, entity, id, true);
  });
  notifyChange();
}

export async function pendingCount(db: Notebook) {
  const row = await db.getFirstAsync<{ count: number }>("select count(*) as count from outbox");
  return row?.count ?? 0;
}

/** Changes the server refused, kept so they can be retried or discarded. */
export async function failedCount(db: Notebook) {
  const row = await db.getFirstAsync<{ count: number }>("select count(*) as count from dead_letters");
  return row?.count ?? 0;
}

/** Everything on this phone that is not in the account yet. */
export async function unsavedCount(db: Notebook) {
  return (await pendingCount(db)) + (await failedCount(db));
}

export async function failedChanges(db: Notebook) {
  return db.getAllAsync<{ id: string; entity: string; entity_id: string; detail: string; failed_at: string }>(
    "select id, entity, entity_id, detail, failed_at from dead_letters order by failed_at",
  );
}

/**
 * Put refused changes back in line. One that a newer pending change to the same row has
 * superseded is dropped instead, so an old payload never lands on top of a new one.
 */
export async function retryFailed(db: Notebook) {
  await transaction(db, async () => {
    const dead = await db.getAllAsync<OutboxRow>("select id, entity, op, entity_id, base_updated_at, payload, 0 as sent from dead_letters order by failed_at");
    for (const row of dead) {
      const newer = await db.getFirstAsync<{ id: string }>("select id from outbox where entity = ? and entity_id = ? limit 1", row.entity, row.entity_id);
      if (!newer) {
        await db.runAsync(
          "insert or replace into outbox (id, entity, op, entity_id, base_updated_at, payload, sent) values (?, ?, ?, ?, ?, ?, 0)",
          row.id,
          row.entity,
          row.op,
          row.entity_id,
          row.base_updated_at,
          row.payload,
        );
      }
      await db.runAsync("delete from dead_letters where id = ?", row.id);
    }
  });
  notifyChange();
}

/** Give up on refused changes. The phone keeps its copy of the rows; only the queued changes go. */
export async function discardFailed(db: Notebook) {
  await db.runAsync("delete from dead_letters");
  notifyChange();
}

/** Store the shared exercise catalog, which is not part of the per-user change feed. */
export async function storeCatalog(db: Notebook, exercises: Record<string, unknown>[], version: number) {
  await transaction(db, async () => {
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

/** Thrown by a store whose sync was cancelled (sign out), so it writes nothing more. */
export class SyncCancelled extends Error {
  constructor() {
    super("sync cancelled");
    this.name = "SyncCancelled";
  }
}

/** Repoint everything local from one exercise to another the server merged it into. */
async function remapExercise(db: Notebook, fromId: string, toRow: Record<string, unknown>) {
  const toId = String(toRow.id);
  await transaction(db, async () => {
    await db.runAsync("insert or replace into rows (entity, id, body) values ('exercises', ?, ?)", toId, JSON.stringify(toRow));
    await db.runAsync("delete from rows where entity = 'exercises' and id = ?", fromId);
    // Later edits of the merged-away exercise have nothing to apply to any more.
    await db.runAsync("delete from outbox where entity = 'exercises' and entity_id = ? and sent = 0", fromId);
    for (const entity of EXERCISE_REFERENCING) {
      for (const row of await db.getAllAsync<{ id: string; body: string }>("select id, body from rows where entity = ?", entity)) {
        const body = repointExercise(JSON.parse(row.body), fromId, toId);
        if (body) await db.runAsync("update rows set body = ? where entity = ? and id = ?", JSON.stringify(body), entity, row.id);
      }
      for (const table of ["outbox", "dead_letters"]) {
        for (const row of await db.getAllAsync<{ id: string; payload: string }>(`select id, payload from ${table} where entity = ?`, entity)) {
          const payload = repointExercise(JSON.parse(row.payload), fromId, toId);
          if (payload) await db.runAsync(`update ${table} set payload = ? where id = ?`, JSON.stringify(payload), row.id);
        }
      }
    }
  });
}

/**
 * The sync store over this notebook. `alive` is checked before every write: after a sign
 * out starts, a sync that is still running writes nothing more into the (cleared) notebook.
 */
export function storeFor(db: Notebook, alive: () => boolean = () => true): SyncStore {
  const guard = () => {
    if (!alive()) throw new SyncCancelled();
  };
  return {
    async cursor() {
      return Number((await getMeta(db, "cursor")) ?? "0");
    },
    async setCursor(cursor: number) {
      guard();
      await setMeta(db, "cursor", String(cursor));
    },
    async outbox(): Promise<OutboxItem[]> {
      guard();
      const rows = pickBatch(
        (await db.getAllAsync<OutboxRow>("select * from outbox order by rowid limit 1000")).map((row) => ({ ...row, entityId: row.entity_id })),
        200,
      );
      inFlight.clear();
      for (const row of rows) inFlight.add(row.id);
      // Mark them sent before they leave: if the answer is lost (or the app is killed), the
      // next edit must not fold into a change the server may already have.
      for (const row of rows) if (row.sent !== 1) await db.runAsync("update outbox set sent = 1 where id = ?", row.id);
      return rows.map(toItem);
    },
    async removeOutbox(ids: string[]) {
      guard();
      for (const id of ids) await db.runAsync("delete from outbox where id = ?", id);
    },
    async deadLetter(failed: FailedChange[]) {
      guard();
      const at = new Date().toISOString();
      for (const { item, detail } of failed) {
        await db.runAsync(
          "insert or replace into dead_letters (id, entity, op, entity_id, base_updated_at, payload, detail, failed_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
          item.clientMutationId,
          item.entity,
          item.op,
          item.entityId,
          item.baseUpdatedAt,
          JSON.stringify(item.payload),
          detail,
          at,
        );
        await db.runAsync("delete from outbox where id = ?", item.clientMutationId);
      }
    },
    async remap(entity: string, fromId: string, toRow: Record<string, unknown>) {
      guard();
      if (entity === "exercises") await remapExercise(db, fromId, toRow);
    },
    async applyRemote(change: Change) {
      guard();
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
