/**
 * Personal records of every kind, rep maxes and per-lift history for the phone's summary
 * and exercise screens.
 *
 * Input is the same log buildOverview takes: completed sessions and counted working sets
 * (warmups are never passed in, so they never set records).
 *
 * Record types, each judged against every EARLIER session of that lift (the first session
 * of a lift is a baseline, never a record, and sets in the same session don't compete):
 * - "e1rm":   the session's best estimated 1RM beats every earlier one. Same rule and same
 *             numbers as personalRecords() and the server; sets above E1RM_MAX_REPS (12) reps
 *             never count.
 * - "weight": the session's heaviest set beats every earlier heaviest set, at any reps.
 * - "reps":   a set does more reps than ever before at that weight or heavier. Only counts
 *             when something at that weight or heavier was logged before (otherwise it is a
 *             weight record, not a rep record). One per lift per session: the heaviest such set.
 */
import { epley } from "./index";
import { compareSessions, personalRecords, type StatSession, type StatSet } from "./stats";

const EPSILON = 1e-9;

export type RecordType = "e1rm" | "weight" | "reps";

export const RECORD_LABELS: Record<RecordType, string> = {
  e1rm: "Estimated max",
  weight: "Heaviest weight",
  reps: "Rep record",
};

export interface SetRef {
  weightKg: number;
  reps: number;
  /** null for sets above E1RM_MAX_REPS reps. */
  e1rmKg: number | null;
}

export interface LiftRecord {
  type: RecordType;
  exerciseId: string;
  exerciseName: string;
  sessionId: string;
  achievedAt: string;
  /** The set that set the record. */
  weightKg: number;
  reps: number;
  /** e1rm: the new estimate. Otherwise the set's own estimate, if it has one. */
  e1rmKg: number | null;
  /**
   * What it beat. e1rm: previous best estimate. weight: previous heaviest weight.
   * reps: previous most reps at that weight or heavier.
   */
  previous: number;
}

const TYPE_ORDER: Record<RecordType, number> = { e1rm: 0, weight: 1, reps: 2 };

export function setRef(weightKg: number, reps: number): SetRef {
  return { weightKg, reps, e1rmKg: epley(weightKg, reps) };
}

/** Best set: highest estimate, else (only high-rep sets) heaviest, then most reps. */
export function betterSet(a: SetRef | null, b: SetRef): SetRef {
  if (!a) return b;
  if (a.e1rmKg != null || b.e1rmKg != null) {
    if (a.e1rmKg == null) return b;
    if (b.e1rmKg == null) return a;
    if (b.e1rmKg > a.e1rmKg + EPSILON) return b;
    if (a.e1rmKg > b.e1rmKg + EPSILON) return a;
  }
  if (b.weightKg > a.weightKg + EPSILON) return b;
  if (a.weightKg > b.weightKg + EPSILON) return a;
  return b.reps > a.reps ? b : a;
}

/** Percent change from `before` to `now`, comparing estimates when both have one, else weight. */
export function setChangePercent(now: SetRef, before: SetRef): number | null {
  const useEstimate = now.e1rmKg != null && before.e1rmKg != null;
  const base = useEstimate ? before.e1rmKg! : before.weightKg;
  const value = useEstimate ? now.e1rmKg! : now.weightKg;
  if (base <= 0) return null;
  return Math.round(((value - base) / base) * 1000) / 10;
}

function byExerciseAndSession(sets: StatSet[]) {
  const grouped = new Map<string, Map<string, StatSet[]>>();
  for (const item of sets) {
    let perExercise = grouped.get(item.exerciseId);
    if (!perExercise) {
      perExercise = new Map();
      grouped.set(item.exerciseId, perExercise);
    }
    const list = perExercise.get(item.sessionId) ?? [];
    list.push(item);
    perExercise.set(item.sessionId, list);
  }
  return grouped;
}

/** Every record of every type, oldest first. */
export function liftRecords(sessions: StatSession[], sets: StatSet[]): LiftRecord[] {
  const ordered = [...sessions].sort(compareSessions);
  const grouped = byExerciseAndSession(sets);
  const records: LiftRecord[] = [];

  for (const record of personalRecords(sessions, sets)) {
    records.push({
      type: "e1rm",
      exerciseId: record.exerciseId,
      exerciseName: record.exerciseName,
      sessionId: record.sessionId,
      achievedAt: record.achievedAt,
      weightKg: record.weightKg,
      reps: record.reps,
      e1rmKg: record.e1rmKg,
      previous: record.previousE1rmKg,
    });
  }

  for (const [exerciseId, perSession] of grouped) {
    // Every earlier set of this lift, for the rep and weight checks.
    const history: StatSet[] = [];
    let heaviest: number | null = null;
    for (const session of ordered) {
      const mine = perSession.get(session.id);
      if (!mine?.length) continue;
      const name = mine[0].exerciseName;
      if (history.length) {
        const top = mine.reduce((best, item) => (item.weightKg > best.weightKg || (item.weightKg === best.weightKg && item.reps > best.reps) ? item : best));
        if (heaviest != null && top.weightKg > heaviest + EPSILON) {
          records.push({
            type: "weight",
            exerciseId,
            exerciseName: name,
            sessionId: session.id,
            achievedAt: session.startedAt,
            weightKg: top.weightKg,
            reps: top.reps,
            e1rmKg: epley(top.weightKg, top.reps),
            previous: heaviest,
          });
        }
        let repRecord: { set: StatSet; previous: number } | null = null;
        for (const item of mine) {
          let previous: number | null = null;
          for (const earlier of history) {
            if (earlier.weightKg + EPSILON >= item.weightKg && (previous == null || earlier.reps > previous)) previous = earlier.reps;
          }
          if (previous == null || item.reps <= previous) continue;
          if (
            !repRecord ||
            item.weightKg > repRecord.set.weightKg + EPSILON ||
            (Math.abs(item.weightKg - repRecord.set.weightKg) <= EPSILON && item.reps > repRecord.set.reps)
          ) {
            repRecord = { set: item, previous };
          }
        }
        if (repRecord) {
          records.push({
            type: "reps",
            exerciseId,
            exerciseName: name,
            sessionId: session.id,
            achievedAt: session.startedAt,
            weightKg: repRecord.set.weightKg,
            reps: repRecord.set.reps,
            e1rmKg: epley(repRecord.set.weightKg, repRecord.set.reps),
            previous: repRecord.previous,
          });
        }
      }
      for (const item of mine) {
        history.push(item);
        if (heaviest == null || item.weightKg > heaviest) heaviest = item.weightKg;
      }
    }
  }

  const position = new Map(ordered.map((session, index) => [session.id, index]));
  return records.sort(
    (a, b) =>
      (position.get(a.sessionId) ?? 0) - (position.get(b.sessionId) ?? 0) ||
      (a.exerciseName < b.exerciseName ? -1 : a.exerciseName > b.exerciseName ? 1 : 0) ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type],
  );
}

export const REP_MAX_TARGETS = [1, 3, 5, 8, 10] as const;

export interface RepMax {
  /** "Best weight for N reps": the heaviest set done for at least this many reps. */
  reps: number;
  weightKg: number | null;
  /** Reps actually done in that set (can be more than `reps`). */
  actualReps: number | null;
  sessionId: string | null;
  achievedAt: string | null;
}

/** Rep-max table for one lift. */
export function repMaxes(sessions: StatSession[], sets: StatSet[], exerciseId: string, targets: readonly number[] = REP_MAX_TARGETS): RepMax[] {
  const started = new Map(sessions.map((item) => [item.id, item.startedAt]));
  const mine = sets.filter((item) => item.exerciseId === exerciseId && started.has(item.sessionId));
  return targets.map((target) => {
    let best: StatSet | null = null;
    for (const item of mine) {
      if (item.reps < target) continue;
      if (
        !best ||
        item.weightKg > best.weightKg + EPSILON ||
        // Same weight: the earlier session got there first.
        (Math.abs(item.weightKg - best.weightKg) <= EPSILON && Date.parse(started.get(item.sessionId)!) < Date.parse(started.get(best.sessionId)!))
      ) {
        best = item;
      }
    }
    return {
      reps: target,
      weightKg: best?.weightKg ?? null,
      actualReps: best?.reps ?? null,
      sessionId: best?.sessionId ?? null,
      achievedAt: best ? started.get(best.sessionId)! : null,
    };
  });
}

export interface ExerciseSessionHistory {
  sessionId: string;
  startedAt: string;
  name: string;
  /** In logged order. */
  sets: { weightKg: number; reps: number }[];
  best: SetRef;
  volumeKg: number;
  records: RecordType[];
}

/** One lift's sessions, newest first, with every counted set and the records each one set. */
export function exerciseHistory(sessions: StatSession[], sets: StatSet[], exerciseId: string): ExerciseSessionHistory[] {
  const records = liftRecords(sessions, sets).filter((item) => item.exerciseId === exerciseId);
  const grouped = byExerciseAndSession(sets).get(exerciseId) ?? new Map<string, StatSet[]>();
  return [...sessions]
    .sort(compareSessions)
    .reverse()
    .filter((session) => grouped.has(session.id))
    .map((session) => {
      const mine = grouped.get(session.id)!;
      let best: SetRef | null = null;
      let volume = 0;
      for (const item of mine) {
        best = betterSet(best, setRef(item.weightKg, item.reps));
        volume += Math.round(item.weightKg * 1e6) * item.reps;
      }
      return {
        sessionId: session.id,
        startedAt: session.startedAt,
        name: session.name ?? "",
        sets: mine.map((item) => ({ weightKg: item.weightKg, reps: item.reps })),
        best: best!,
        volumeKg: Math.round(volume) / 1e6,
        records: records.filter((record) => record.sessionId === session.id).map((record) => record.type),
      };
    });
}

