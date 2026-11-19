import {
  DEFAULT_BAR,
  exerciseDone,
  fromKilograms,
  formatClock,
  isDone,
  matchingPrevious,
  nextAfter,
  nextInExercise,
  nextPosition,
  nextSetTemplate,
  parseAmount,
  prefill,
  progress,
  weightStep,
  type GuidePosition,
} from "@swolltech/metrics";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addExerciseToSession,
  addSetToExercise,
  addWarmupSet,
  completeSession,
  moveSessionExercise,
  removeSessionExercise,
  replaceSessionExercise,
  saveSessionDetails,
  setExerciseRest,
} from "../../src/actions";
import { ProgressBar } from "../../src/components/charts";
import { ExercisePicker } from "../../src/components/ExercisePicker";
import { PlateDiagram } from "../../src/components/PlateDiagram";
import { Button, Chip, Field, Row, Sheet, Stepper, T } from "../../src/components/ui";
import { deleteRow, saveRow } from "../../src/db";
import { pair, trim } from "../../src/format";
import type { SessionSetRow, Unit } from "../../src/logic/rows";
import {
  DEFAULT_REST_SECONDS,
  MAX_REPS,
  MAX_WEIGHT,
  NOTE_LIMIT,
  REST_CHOICES,
  SESSION_NAME_LIMIT,
  assembleSession,
  clampReps,
  clampWeight,
  convertWeight,
  exerciseRow,
  isBarbell,
  logSet,
  previousNote,
  recordFor,
  restLabel,
  skipSet,
  startingWeight,
  validateSessionName,
  validateSet,
  type SessionExerciseView,
} from "../../src/logic/session";
import { useNotebook } from "../../src/notebook";
import { cancelRest, startRest } from "../../src/timer";
import { fonts, radius, space, useTheme } from "../../src/theme";

const RPE = [6, 7, 8, 9, 10];

function setLabel(exercise: SessionExerciseView, index: number) {
  const set = exercise.sets[index];
  if (!set) return "";
  if (set.kind === "warmup") {
    const warmups = exercise.sets.filter((row) => row.kind === "warmup");
    return `Warmup ${warmups.indexOf(set) + 1} of ${warmups.length}`;
  }
  const working = exercise.sets.filter((row) => row.kind === "working");
  return `Set ${working.indexOf(set) + 1} of ${working.length}`;
}

function targetText(set: SessionSetRow) {
  const reps = set.target_reps != null ? `${set.target_reps} reps` : null;
  if (set.target_weight != null) return `${trim(Number(set.target_weight), 2)} ${set.target_unit ?? ""} × ${set.target_reps ?? "?"}`;
  if (set.target_percent != null) return `${reps ?? "Reps open"} at ${Number(set.target_percent)}%. Set a training max to get a weight`;
  return reps;
}

/** Where to land once the notebook reloads after a change. */
interface Pending {
  exerciseId: string;
  /** Land on this set once it exists. */
  setId?: string;
  setIndex?: number;
  /** Wait until this exercise is gone (after removing it). */
  gone?: string;
}

interface Rest {
  until: number;
  total: number;
  notificationId: string | null;
}

export default function SessionScreen() {
  const theme = useTheme();
  // Insets from the root provider: inside a full-screen modal the native SafeAreaView can
  // measure zero and slide the header under the status bar.
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, data, unit } = useNotebook();
  const view = useMemo(() => (data && id ? assembleSession(data, id) : null), [data, id]);
  const exercises = view?.exercises ?? [];

  const [position, setPosition] = useState<GuidePosition | null>(null);
  const [weightText, setWeightText] = useState("");
  const [repsText, setRepsText] = useState("");
  const [setUnit, setSetUnit] = useState<Unit>(unit);
  const [rpe, setRpe] = useState<number | null>(null);
  const [rpeHelp, setRpeHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(Date.now());
  const [picking, setPicking] = useState<"add" | "replace" | null>(null);
  const [saving, setSaving] = useState(false);
  const [limit, setLimit] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [record, setRecord] = useState<string | null>(null);
  const [options, setOptions] = useState(false);
  const [details, setDetails] = useState(false);
  const [nameText, setNameText] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const pendingAdvance = useRef<Pending | null>(null);
  // The set just logged, until its saved row reloads. The screen moves to the next set
  // before that, and the next set's weight should carry over from it.
  const justLogged = useRef<{ id: string; actual_weight: number; actual_reps: number; actual_unit: Unit; completed_at: string } | null>(null);
  const withJustLogged = <T extends { sets: { id: string; completed_at: string | null }[] }>(item: T): T => {
    const logged = justLogged.current;
    if (!logged || !item.sets.some((row) => row.id === logged.id && row.completed_at == null)) return item;
    return { ...item, sets: item.sets.map((row) => (row.id === logged.id ? { ...row, ...logged } : row)) };
  };

  // Pick the first open set when the session loads.
  useEffect(() => {
    if (!view || position) return;
    setPosition(nextPosition(view.exercises) ?? (view.exercises.length ? { exerciseIndex: 0, setIndex: 0 } : null));
  }, [view, position]);

  // A set or exercise was added, moved or removed: land on it once the change shows up.
  useEffect(() => {
    const pending = pendingAdvance.current;
    if (!view || !pending) return;
    if (pending.gone && view.exercises.some((row) => row.id === pending.gone)) return;
    const index = view.exercises.findIndex((row) => row.id === pending.exerciseId);
    if (index < 0) {
      if (pending.gone) {
        pendingAdvance.current = null;
        setPosition(nextPosition(view.exercises) ?? (view.exercises.length ? { exerciseIndex: 0, setIndex: 0 } : null));
      }
      return;
    }
    const sets = view.exercises[index].sets;
    let setIndex = pending.setIndex ?? Math.max(0, sets.length - 1);
    if (pending.setId) {
      setIndex = sets.findIndex((row) => row.id === pending.setId);
      if (setIndex < 0) return;
    }
    pendingAdvance.current = null;
    setPosition({ exerciseIndex: index, setIndex: Math.min(setIndex, Math.max(0, sets.length - 1)) });
    setEditing(false);
  }, [view]);

  useEffect(() => {
    if (!record) return;
    const timer = setTimeout(() => setRecord(null), 8000);
    return () => clearTimeout(timer);
  }, [record]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const exercise = position ? exercises[position.exerciseIndex] : undefined;
  const current = exercise && position ? exercise.sets[position.setIndex] : undefined;

  // Fill the inputs whenever the lifter lands on a different set.
  useEffect(() => {
    if (!exercise || !position) return;
    const values = prefill(withJustLogged(exercise), position.setIndex, unit);
    // A barbell lift you have never done starts at the empty bar.
    const start = current && current.completed_at == null ? startingWeight(values.weight, exercise.equipment, values.unit) : values.weight;
    setWeightText(start != null ? trim(start, 2) : "");
    setRepsText(values.reps != null ? String(values.reps) : "");
    setSetUnit(values.unit);
    setRpe(values.rpe);
    setNoteText(current?.notes ?? "");
    setNoteOpen(Boolean(current?.notes));
    setError(null);
    setLimit(null);
  }, [exercise?.id, exercise?.exercise_id, position?.setIndex, current?.id]);

  useEffect(() => {
    if (!rest) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= rest.until) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        setRest(null);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [rest]);

  if (!view || !db) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: space.lg, paddingTop: insets.top + space.lg, gap: space.md }}>
        <T variant="heading">{data ? "This session is not on this phone" : "Opening your notebook"}</T>
        {data ? <Button label="Back" kind="secondary" onPress={() => router.back()} /> : null}
      </View>
    );
  }

  const { session } = view;
  const done = session.status !== "in_progress";
  const overall = progress(exercises);
  const allLogged = overall.total > 0 && overall.done === overall.total;
  const last = exercise && position ? matchingPrevious(exercise, position.setIndex) : null;
  const target = current ? targetText(current) : null;
  const weightValue = parseAmount(weightText);
  const exerciseFinished = exercise ? exerciseDone(exercise) : false;
  const showForm = Boolean(current) && (!exerciseFinished || editing || done);
  const upcoming = position ? nextAfter(exercises, position) : null;
  const nextExercise = upcoming && upcoming.exerciseIndex !== position?.exerciseIndex ? exercises[upcoming.exerciseIndex] : null;
  const barbell = exercise ? isBarbell(exercise.equipment) : false;
  const lastNote = exercise && position ? previousNote(exercise, position.setIndex) : null;
  const siblings = exercises.map((row) => exerciseRow(session.id, row));

  function changeWeight(text: string) {
    const clamped = clampWeight(parseAmount(text));
    if (clamped.message) {
      setWeightText(String(MAX_WEIGHT));
      setLimit(`${clamped.message}.`);
    } else {
      setWeightText(text);
      setLimit(null);
    }
  }

  function changeReps(text: string) {
    const clamped = clampReps(parseAmount(text));
    if (clamped.message) {
      setRepsText(String(MAX_REPS));
      setLimit(`${clamped.message}.`);
    } else {
      setRepsText(text);
      setLimit(null);
    }
  }

  function stepWeight(direction: -1 | 1) {
    if (weightValue == null && barbell) return setWeightText(trim(DEFAULT_BAR[setUnit], 2));
    const next = Math.min(MAX_WEIGHT, Math.max(0, (weightValue ?? 0) + direction * weightStep(setUnit)));
    setWeightText(trim(next, 2));
    setLimit(null);
  }

  function changeUnit(to: Unit) {
    if (to === setUnit) return;
    if (weightValue != null) {
      const converted = Math.min(MAX_WEIGHT, convertWeight(weightValue, setUnit, to, barbell));
      setWeightText(trim(converted, 2));
    }
    setSetUnit(to);
  }

  async function beginRest(seconds: number) {
    if (rest) await cancelRest(rest.notificationId);
    const scheduled = await startRest(seconds);
    setNow(Date.now());
    setRest({ until: scheduled.until, total: seconds, notificationId: scheduled.notificationId });
  }

  function moveTo(next: GuidePosition) {
    setPosition(next);
    setEditing(false);
  }

  /** After a set is logged or skipped, go to the next open set and say so when the exercise is finished. */
  function advance(from: GuidePosition) {
    const next = nextAfter(exercises, from);
    const finished = exercises[from.exerciseIndex];
    if (!next) {
      setEditing(false);
      setNotice(null);
      return;
    }
    if (next.exerciseIndex !== from.exerciseIndex && finished) {
      setNotice(`${finished.exercise_name} done. On to ${exercises[next.exerciseIndex].exercise_name}.`);
    }
    moveTo(next);
  }

  async function log() {
    if (!db || !current || !position || saving) return;
    const reps = parseAmount(repsText);
    const problem = validateSet(weightValue, reps);
    if (problem) {
      setError(problem);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      return;
    }
    const from = position;
    const wasDone = current.completed_at != null;
    const best = exercise && !done ? recordFor(exercise, current.id, { weight: weightValue!, reps: reps!, unit: setUnit, kind: current.kind }) : null;
    setSaving(true);
    try {
      await saveRow(db, "session_sets", logSet(current, { weight: weightValue!, reps: reps!, unit: setUnit, rpe, notes: noteText }, new Date()));
    } catch {
      setError("That set did not save. Try again.");
      return;
    } finally {
      setSaving(false);
    }
    justLogged.current = { id: current.id, actual_weight: weightValue!, actual_reps: reps!, actual_unit: setUnit, completed_at: new Date().toISOString() };
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (best != null && exercise) {
      setRecord(`New record on ${exercise.exercise_name}: estimated 1RM ${trim(fromKilograms(best, setUnit), 1)} ${setUnit}`);
    }
    if (wasDone || done) {
      setEditing(false);
      return;
    }
    advance(from);
    const remaining = overall.total - overall.done - 1;
    if (current.rest_seconds > 0 && remaining > 0) await beginRest(current.rest_seconds);
  }

  async function skip() {
    if (!db || !current || !position) return;
    const from = position;
    try {
      await saveRow(db, "session_sets", skipSet(current));
    } catch {
      setError("That did not save. Try again.");
      return;
    }
    void Haptics.selectionAsync().catch(() => undefined);
    advance(from);
  }

  async function addSet() {
    if (!db || !exercise) return;
    pendingAdvance.current = { exerciseId: exercise.id };
    await addSetToExercise(db, exercise.id, exercise.sets, nextSetTemplate(exercise, unit));
  }

  async function addWarmup() {
    if (!db || !exercise) return;
    const template = exercise.sets.find((row) => row.kind === "warmup");
    const setId = await addWarmupSet(db, exercise.id, exercise.sets, {
      target_reps: template?.target_reps ?? null,
      target_weight: template?.target_weight ?? null,
      target_unit: template?.target_unit ?? null,
    });
    pendingAdvance.current = { exerciseId: exercise.id, setId };
  }

  function removeSet() {
    if (!db || !current || !exercise || !position) return;
    const from = position;
    const go = async () => {
      await deleteRow(db, "session_sets", current.id);
      moveTo({ exerciseIndex: from.exerciseIndex, setIndex: Math.max(0, from.setIndex - 1) });
    };
    if (current.completed_at == null) return void go();
    Alert.alert("Delete this logged set?", `${pair(current.actual_weight, current.actual_unit, current.actual_reps)} will be removed from this workout.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Delete set", style: "destructive", onPress: () => void go() },
    ]);
  }

  async function moveExercise(direction: -1 | 1) {
    if (!db || !exercise || !position) return;
    setOptions(false);
    const target = { exerciseId: exercise.id, setIndex: position.setIndex };
    await moveSessionExercise(db, siblings, exercise.id, direction);
    // Set after the write: the notebook reloads a moment later, and we follow the exercise to its new place.
    pendingAdvance.current = target;
  }

  function removeExercise() {
    if (!db || !exercise) return;
    const target = exercise;
    const logged = target.sets.filter((row) => row.completed_at != null).length;
    Alert.alert(
      `Remove ${target.exercise_name}?`,
      logged ? `Its ${logged} logged ${logged === 1 ? "set" : "sets"} will be deleted from this workout.` : "Its sets will be removed from this workout.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setOptions(false);
            const neighbour = exercises[position!.exerciseIndex + 1] ?? exercises[position!.exerciseIndex - 1];
            pendingAdvance.current = neighbour
              ? { exerciseId: neighbour.id, setIndex: nextInExercise(neighbour) ?? Math.max(0, neighbour.sets.length - 1), gone: target.id }
              : { exerciseId: target.id, gone: target.id };
            await removeSessionExercise(db, target.id);
          },
        },
      ],
    );
  }

  function openDetails() {
    setNameText(session.name);
    setSessionNote(session.notes ?? "");
    setDetailsError(null);
    setDetails(true);
  }

  async function saveDetails() {
    if (!db) return;
    const problem = validateSessionName(nameText);
    if (problem) return setDetailsError(problem);
    await saveSessionDetails(db, session, { name: nameText, notes: sessionNote });
    setDetails(false);
  }

  function finish() {
    if (!db) return;
    const open = overall.total - overall.done;
    const go = async () => {
      if (rest) await cancelRest(rest.notificationId);
      await completeSession(db, session);
      router.replace({ pathname: "/summary/[id]", params: { id: session.id } });
    };
    if (overall.done === 0) {
      Alert.alert("Nothing logged yet", "Log at least one set, or discard this session.");
      return;
    }
    if (open > 0) {
      Alert.alert("Finish workout?", `${open} set${open === 1 ? " is" : "s are"} still open. They will not count.`, [
        { text: "Keep going", style: "cancel" },
        { text: "Finish", onPress: () => void go() },
      ]);
    } else void go();
  }

  function discard() {
    if (!db) return;
    Alert.alert("Discard this session?", "Every set in it will be deleted.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          if (rest) await cancelRest(rest.notificationId);
          await deleteRow(db, "sessions", session.id);
          router.back();
        },
      },
    ]);
  }

  async function skipRest() {
    if (!rest) return;
    await cancelRest(rest.notificationId);
    setRest(null);
  }

  async function addTime() {
    if (!rest) return;
    await cancelRest(rest.notificationId);
    const left = Math.max(0, (rest.until - Date.now()) / 1000) + 30;
    const scheduled = await startRest(left);
    setRest({ until: scheduled.until, total: rest.total + 30, notificationId: scheduled.notificationId });
  }

  const nextUp = (() => {
    const next = position && current && !isDone(current) ? position : nextPosition(exercises);
    if (!next) return null;
    const item = exercises[next.exerciseIndex];
    if (!item?.sets[next.setIndex]) return null;
    const values = prefill(withJustLogged(item), next.setIndex, unit);
    const amount = values.weight != null && values.reps != null ? `, ${trim(values.weight, 2)} ${values.unit} × ${values.reps}` : "";
    return `${item.exercise_name}, ${setLabel(item, next.setIndex).toLowerCase()}${amount}`;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Button label="Close" kind="ghost" compact onPress={() => router.back()} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${session.name}. Rename or add a session note`}
              onPress={openDetails}
              hitSlop={8}
              style={{ flex: 1, alignItems: "center" }}
              testID="session-details"
            >
              <T variant="label" numberOfLines={1} style={{ textAlign: "center", color: theme.text }}>
                {session.name} ✎
              </T>
            </Pressable>
            {done ? (
              <Button label="Summary" kind="ghost" compact onPress={() => router.replace({ pathname: "/summary/[id]", params: { id: session.id } })} />
            ) : (
              <Button label="Finish" kind={allLogged ? "primary" : "secondary"} compact onPress={finish} testID="finish" />
            )}
          </Row>
          <ProgressBar fraction={overall.fraction} />
          <T variant="small">
            {overall.done} of {overall.total} sets done
          </T>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, paddingVertical: space.sm, alignItems: "stretch" }}
          style={{ flexGrow: 0, flexShrink: 0 }}
        >
          {exercises.map((item, index) => {
            const p = progress([item]);
            const selected = position?.exerciseIndex === index;
            const finished = exerciseDone(item);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${item.exercise_name}, ${p.done} of ${p.total} sets done`}
                accessibilityHint={done ? undefined : "Long press for exercise options"}
                onPress={() => moveTo({ exerciseIndex: index, setIndex: nextInExercise(item) ?? Math.max(0, item.sets.length - 1) })}
                onLongPress={
                  done
                    ? undefined
                    : () => {
                        moveTo({ exerciseIndex: index, setIndex: nextInExercise(item) ?? Math.max(0, item.sets.length - 1) });
                        setOptions(true);
                      }
                }
                style={{
                  minHeight: 56,
                  paddingHorizontal: space.md,
                  paddingVertical: 6,
                  borderRadius: radius.md,
                  borderWidth: selected ? 2 : 1.5,
                  borderColor: selected ? theme.highlight : finished ? theme.ok : theme.line,
                  backgroundColor: selected ? theme.raised : "transparent",
                  justifyContent: "center",
                  gap: 2,
                }}
              >
                <Text style={{ color: finished && !selected ? theme.muted : theme.text, fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 18 }}>{item.exercise_name}</Text>
                <Text style={{ color: finished ? theme.ok : selected ? theme.highlight : theme.muted, fontFamily: fonts.displaySemi, fontSize: 14, lineHeight: 18 }}>
                  {finished ? `✓ ${p.done}/${p.total}` : `${p.done}/${p.total}`}
                </Text>
              </Pressable>
            );
          })}
          {!done ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPicking("add")}
              style={{ minHeight: 56, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.line, justifyContent: "center" }}
            >
              <Text style={{ color: theme.muted, fontFamily: fonts.bodySemi, lineHeight: 18 }}>Add exercise</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {notice ? (
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: theme.ok }}>
              <Text style={{ color: theme.ok, fontFamily: fonts.display, fontSize: 20 }}>✓</Text>
              <T style={{ flex: 1 }}>{notice}</T>
            </View>
          ) : null}

          {record ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: space.sm, alignItems: "center", padding: space.md, borderRadius: radius.md, borderWidth: 2, borderColor: theme.highlight, backgroundColor: theme.raised }}>
              <Text style={{ color: theme.highlight, fontFamily: fonts.display, fontSize: 20 }}>PR</Text>
              <T style={{ flex: 1 }}>{record}</T>
            </View>
          ) : null}

          {allLogged && !done ? (
            <View style={{ gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: theme.ok, backgroundColor: theme.raised }}>
              <T variant="heading">Every set is logged</T>
              <T variant="muted">Finish to save this workout to your history.</T>
              <Button label="Finish workout" onPress={finish} testID="finish-all" />
              <Button label={session.notes ? "Edit name and note" : "Name it or add a note"} kind="secondary" onPress={openDetails} />
            </View>
          ) : null}

          {!exercise ? (
            <View style={{ gap: space.md }}>
              <T variant="heading">Add your first exercise</T>
              <T variant="muted">Pick what you are lifting and log sets as you go.</T>
              <Button label="Add exercise" onPress={() => setPicking("add")} />
            </View>
          ) : (
            <>
              <View style={{ gap: 2 }}>
                <Row style={{ alignItems: "flex-start" }}>
                  <Text style={{ flex: 1, color: theme.text, fontFamily: fonts.display, fontSize: 38, lineHeight: 42 }}>{exercise.exercise_name}</Text>
                  {!done ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${exercise.exercise_name} options`}
                      onPress={() => setOptions(true)}
                      hitSlop={8}
                      testID="exercise-options"
                      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1.5, borderColor: theme.line }}
                    >
                      <Text style={{ color: theme.text, fontFamily: fonts.display, fontSize: 22, lineHeight: 24 }}>⋯</Text>
                    </Pressable>
                  ) : null}
                </Row>
                {exercise.notes ? <T variant="muted">{exercise.notes}</T> : null}
                {showForm && current ? (
                  <Row>
                    <T variant="heading" style={{ color: current.completed_at ? theme.ok : current.kind === "warmup" ? theme.muted : theme.highlight }}>
                      {setLabel(exercise, position!.setIndex)}
                    </T>
                    {current.completed_at ? <T variant="small" style={{ color: theme.ok }}>✓ Logged</T> : null}
                    {current.skipped ? <T variant="small">Skipped</T> : null}
                  </Row>
                ) : !current ? (
                  <T variant="muted">No sets yet. Add one below.</T>
                ) : null}
              </View>

              {exerciseFinished && !editing && !done ? (
                <View style={{ gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: theme.ok }}>
                  <T variant="heading" style={{ color: theme.ok }}>
                    ✓ All {exercise.sets.length} {exercise.sets.length === 1 ? "set" : "sets"} done
                  </T>
                  {nextExercise ? (
                    <Button
                      label={`Next: ${nextExercise.exercise_name}`}
                      onPress={() => upcoming && moveTo(upcoming)}
                      testID="next-exercise"
                    />
                  ) : null}
                  <Button label="Add an extra set" kind="secondary" onPress={() => void addSet()} />
                </View>
              ) : null}

              {showForm && current ? (
                <>
                  <View style={{ gap: 2 }}>
                    {target ? <T>Plan: {target}</T> : null}
                    <T variant="muted">Last time: {last ? `${pair(last.actual_weight, last.actual_unit, last.actual_reps)}${last.rpe ? ` at RPE ${last.rpe}` : ""}` : "nothing logged yet"}</T>
                    {lastNote ? <T variant="small">Last note: {lastNote}</T> : null}
                  </View>

                  <Row gap={space.md}>
                    <Stepper
                      label="Weight"
                      value={weightText}
                      onChange={changeWeight}
                      suffix={setUnit}
                      testID="weight"
                      onStep={stepWeight}
                    />
                  </Row>
                  <Row gap={space.md}>
                    <Stepper
                      label="Reps"
                      value={repsText}
                      onChange={changeReps}
                      keyboardType="number-pad"
                      testID="reps"
                      onStep={(direction) => {
                        setRepsText(String(Math.min(MAX_REPS, Math.max(0, Math.round(parseAmount(repsText) ?? 0) + direction))));
                        setLimit(null);
                      }}
                    />
                  </Row>

                  {limit ? <T variant="small">{limit}</T> : null}
                  {noteOpen ? (
                    <Field
                      label="Note for this set"
                      value={noteText}
                      onChangeText={(text) => setNoteText(text.slice(0, NOTE_LIMIT))}
                      placeholder="Felt fast, grip slipped, paused reps"
                      maxLength={NOTE_LIMIT}
                      multiline
                      testID="set-note"
                      style={{ minHeight: 64, paddingTop: 10 }}
                    />
                  ) : (
                    <Button label="Add note" kind="ghost" compact onPress={() => setNoteOpen(true)} style={{ alignSelf: "flex-start" }} testID="add-note" />
                  )}
                  {error ? <T style={{ color: theme.danger }}>{error}</T> : null}
                  {!done || current.completed_at ? (
                    <Button
                      label={current.completed_at ? "Save changes" : `Log ${setLabel(exercise, position!.setIndex).toLowerCase()}`}
                      onPress={() => void log()}
                      busy={saving}
                      testID="log-set"
                      style={{ minHeight: 64 }}
                    />
                  ) : null}

                  <Row>
                    <Chip label="lb" selected={setUnit === "lb"} onPress={() => changeUnit("lb")} />
                    <Chip label="kg" selected={setUnit === "kg"} onPress={() => changeUnit("kg")} />
                  </Row>
                  <View style={{ gap: space.xs }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <T variant="label">Effort (RPE), optional</T>
                      <Pressable accessibilityRole="button" onPress={() => setRpeHelp(!rpeHelp)} hitSlop={8}>
                        <T variant="small" style={{ textDecorationLine: "underline" }}>
                          {rpeHelp ? "Hide" : "What is this?"}
                        </T>
                      </Pressable>
                    </Row>
                    {rpeHelp ? (
                      <T variant="small">
                        RPE stands for rate of perceived exertion: how hard the set felt. 10 means you could not do another rep, 9 means one rep left in the tank, 8 means two.
                      </T>
                    ) : null}
                    <Row gap={6}>
                      {RPE.map((value) => (
                        <Chip key={value} label={String(value)} selected={rpe === value} onPress={() => setRpe(rpe === value ? null : value)} />
                      ))}
                    </Row>
                  </View>

                  {barbell ? <PlateDiagram weight={weightValue} unit={setUnit} /> : null}

                  {!done ? (
                    <View style={{ gap: space.xs }}>
                      <T variant="label">Rest after each set</T>
                      <Row gap={6} style={{ flexWrap: "wrap" }}>
                        {REST_CHOICES.map((seconds) => (
                          <Chip
                            key={seconds}
                            small
                            label={restLabel(seconds)}
                            selected={current.rest_seconds === seconds}
                            onPress={() => db && void setExerciseRest(db, exercise.sets, seconds)}
                            testID={`rest-${seconds}`}
                          />
                        ))}
                      </Row>
                      <T variant="small">Applies to the sets you have not logged yet.</T>
                    </View>
                  ) : null}

                  {!done ? (
                    <Row>
                      {!current.completed_at && !current.skipped ? <Button label="Skip set" kind="ghost" compact onPress={() => void skip()} style={{ flex: 1 }} /> : null}
                      <Button
                        label={`Start rest (${restLabel(current.rest_seconds > 0 ? current.rest_seconds : DEFAULT_REST_SECONDS)})`}
                        kind="ghost"
                        compact
                        onPress={() => void beginRest(current.rest_seconds > 0 ? current.rest_seconds : DEFAULT_REST_SECONDS)}
                        style={{ flex: 1 }}
                        testID="start-rest"
                      />
                    </Row>
                  ) : null}
                </>
              ) : null}

              <View style={{ gap: space.xs, marginTop: space.sm }}>
                <T variant="label">{exercise.exercise_name} sets</T>
                {exercise.sets.map((set, index) => {
                  const selected = showForm && position?.setIndex === index;
                  const logged = set.completed_at != null;
                  const status = logged ? pair(set.actual_weight, set.actual_unit, set.actual_reps) : set.skipped ? "Skipped" : targetText(set) ?? "Open";
                  return (
                    <Pressable
                      key={set.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${setLabel(exercise, index)}, ${logged ? `logged ${status}` : status}`}
                      onPress={() => {
                        setPosition({ exerciseIndex: position!.exerciseIndex, setIndex: index });
                        setEditing(true);
                      }}
                      style={{
                        minHeight: 48,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.sm,
                        paddingHorizontal: space.md,
                        borderRadius: radius.md,
                        backgroundColor: selected ? theme.raised : "transparent",
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? theme.highlight : logged ? theme.line : "transparent",
                      }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor: logged ? theme.ok : selected ? theme.highlight : theme.line,
                          backgroundColor: logged ? theme.ok : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {logged ? <Text style={{ color: theme.bg, fontFamily: fonts.display, fontSize: 13, lineHeight: 15 }}>✓</Text> : null}
                      </View>
                        <View style={{ flex: 1, paddingVertical: 4 }}>
                        <T variant={logged || selected ? "body" : "muted"}>{setLabel(exercise, index)}</T>
                        {set.notes ? (
                          <T variant="small" numberOfLines={1}>
                            {set.notes}
                          </T>
                        ) : null}
                      </View>
                      <Text
                        style={{
                          color: logged ? theme.text : theme.muted,
                          fontFamily: fonts.displaySemi,
                          fontSize: 18,
                          textDecorationLine: set.skipped ? "line-through" : "none",
                        }}
                      >
                        {status}
                      </Text>
                    </Pressable>
                  );
                })}
                {!done ? (
                  <Row style={{ marginTop: space.xs, flexWrap: "wrap" }}>
                    {!exerciseFinished ? <Button label="Add set" kind="ghost" compact onPress={() => void addSet()} style={{ flexGrow: 1 }} /> : null}
                    <Button label="Add warm-up" kind="ghost" compact onPress={() => void addWarmup()} style={{ flexGrow: 1 }} testID="add-warmup" />
                    {current && showForm ? (
                      <Button label={current.completed_at ? "Delete set" : "Remove set"} kind="ghost" compact onPress={removeSet} style={{ flexGrow: 1 }} testID="remove-set" />
                    ) : null}
                  </Row>
                ) : current && showForm && current.completed_at ? (
                  <Button label="Delete set" kind="ghost" compact onPress={removeSet} style={{ marginTop: space.xs }} />
                ) : null}
              </View>
            </>
          )}
          {!done ? <Button label="Discard session" kind="danger" compact onPress={discard} style={{ marginTop: space.xl }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {rest ? (
        <View
          accessibilityViewIsModal
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, backgroundColor: theme.bg, opacity: 0.98, padding: space.xl, justifyContent: "center", gap: space.lg }}
        >
          <T variant="label">Rest</T>
          <Text accessibilityRole="timer" style={{ color: theme.text, fontFamily: fonts.display, fontSize: 112, lineHeight: 116, fontVariant: ["tabular-nums"] }}>
            {formatClock((rest.until - now) / 1000)}
          </Text>
          <ProgressBar fraction={1 - Math.max(0, rest.until - now) / (rest.total * 1000)} />
          {record ? <T style={{ color: theme.highlight }}>{record}</T> : null}
          {nextUp ? <T variant="muted">Up next: {nextUp}</T> : null}
          <Row>
            <Button label="Add 30 seconds" kind="secondary" onPress={() => void addTime()} style={{ flex: 1 }} />
            <Button label="Skip rest" onPress={() => void skipRest()} style={{ flex: 1 }} />
          </Row>
        </View>
      ) : null}

      <ExercisePicker
        visible={picking != null}
        exercises={data?.exercises ?? []}
        onClose={() => setPicking(null)}
        onPick={async (picked) => {
          const mode = picking;
          setPicking(null);
          if (mode === "replace" && exercise && data) {
            if (picked.id === exercise.exercise_id) return;
            await replaceSessionExercise(db, data, exerciseRow(session.id, exercise), exercise.sets, picked.id, unit);
            pendingAdvance.current = { exerciseId: exercise.id, setIndex: 0 };
            setRecord(null);
            return;
          }
          const itemId = await addExerciseToSession(db, session.id, picked.id, siblings);
          pendingAdvance.current = { exerciseId: itemId };
        }}
      />

      <Sheet visible={options} onClose={() => setOptions(false)} title={exercise ? exercise.exercise_name : "Exercise options"}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: 48 }}>
          <Button label="Move up" kind="secondary" disabled={!position || position.exerciseIndex === 0} onPress={() => void moveExercise(-1)} testID="move-up" />
          <Button
            label="Move down"
            kind="secondary"
            disabled={!position || position.exerciseIndex >= exercises.length - 1}
            onPress={() => void moveExercise(1)}
            testID="move-down"
          />
          <Button
            label="Add a warm-up set"
            kind="secondary"
            onPress={() => {
              setOptions(false);
              void addWarmup();
            }}
          />
          <Button
            label="Replace exercise"
            kind="secondary"
            onPress={() => {
              setOptions(false);
              setPicking("replace");
            }}
            testID="replace-exercise"
          />
          <T variant="small">Replacing keeps the planned sets and clears anything logged on them.</T>
          <Button label="Remove exercise" kind="danger" onPress={removeExercise} style={{ marginTop: space.md }} testID="remove-exercise" />
        </ScrollView>
      </Sheet>

      <Sheet visible={details} onClose={() => setDetails(false)} title="Session">
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Field label="Name" value={nameText} onChangeText={setNameText} maxLength={SESSION_NAME_LIMIT} error={detailsError} testID="session-name" />
          <Field
            label="Session note"
            value={sessionNote}
            onChangeText={(text) => setSessionNote(text.slice(0, NOTE_LIMIT))}
            placeholder="Sleep, energy, anything worth remembering"
            maxLength={NOTE_LIMIT}
            multiline
            testID="session-note"
            style={{ minHeight: 96, paddingTop: 12 }}
          />
          <Button label="Save" onPress={() => void saveDetails()} testID="save-session-details" />
        </ScrollView>
      </Sheet>
    </View>
  );
}
