import {
  exerciseDone,
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
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addExerciseToSession, addSetToExercise, completeSession } from "../../src/actions";
import { ProgressBar } from "../../src/components/charts";
import { ExercisePicker } from "../../src/components/ExercisePicker";
import { PlateDiagram } from "../../src/components/PlateDiagram";
import { Button, Chip, Row, Stepper, T } from "../../src/components/ui";
import { deleteRow, queueVideo, saveRow } from "../../src/db";
import { pair, trim } from "../../src/format";
import type { SessionSetRow, Unit } from "../../src/logic/rows";
import { assembleSession, logSet, skipSet, validateSet, type SessionExerciseView } from "../../src/logic/session";
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
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingAdvance = useRef<{ exerciseId: string } | null>(null);

  // Pick the first open set when the session loads.
  useEffect(() => {
    if (!view || position) return;
    setPosition(nextPosition(view.exercises) ?? (view.exercises.length ? { exerciseIndex: 0, setIndex: 0 } : null));
  }, [view, position]);

  // A set or exercise was added: jump to it once its row lands.
  useEffect(() => {
    if (!view || !pendingAdvance.current) return;
    const index = view.exercises.findIndex((row) => row.id === pendingAdvance.current!.exerciseId);
    if (index < 0) return;
    pendingAdvance.current = null;
    setPosition({ exerciseIndex: index, setIndex: Math.max(0, view.exercises[index].sets.length - 1) });
    setEditing(false);
  }, [view]);

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
    const values = prefill(exercise, position.setIndex, unit);
    setWeightText(values.weight != null ? trim(values.weight, 2) : "");
    setRepsText(values.reps != null ? String(values.reps) : "");
    setSetUnit(values.unit);
    setRpe(values.rpe);
    setError(null);
  }, [exercise?.id, position?.setIndex, current?.id]);

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
    setSaving(true);
    try {
      await saveRow(db, "session_sets", logSet(current, { weight: weightValue!, reps: reps!, unit: setUnit, rpe }, new Date()));
    } catch {
      setError("That set did not save. Try again.");
      return;
    } finally {
      setSaving(false);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (wasDone || done) {
      setEditing(false);
      return;
    }
    advance(from);
    const remaining = overall.total - overall.done - 1;
    if (current.rest_seconds > 0 && remaining > 0) {
      const scheduled = await startRest(current.rest_seconds);
      setNow(Date.now());
      setRest({ until: scheduled.until, total: current.rest_seconds, notificationId: scheduled.notificationId });
    }
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

  async function removeSet() {
    if (!db || !current || !exercise || !position) return;
    await deleteRow(db, "session_sets", current.id);
    moveTo({ exerciseIndex: position.exerciseIndex, setIndex: Math.max(0, position.setIndex - 1) });
  }

  async function film() {
    if (!db || !current) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera is off", "Allow camera access in Settings to film your sets.");
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 60 });
    if (picked.canceled || !picked.assets[0]) return;
    await queueVideo(db, current.id, picked.assets[0].uri, picked.assets[0].mimeType || "video/mp4");
    Alert.alert("Video saved", "It uploads the next time you sync.");
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
    const values = prefill(item, next.setIndex, unit);
    const amount = values.weight != null && values.reps != null ? `, ${trim(values.weight, 2)} ${values.unit} × ${values.reps}` : "";
    return `${item.exercise_name}, ${setLabel(item, next.setIndex).toLowerCase()}${amount}`;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Button label="Close" kind="ghost" compact onPress={() => router.back()} />
            <T variant="label" numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>
              {session.name}
            </T>
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
                onPress={() => moveTo({ exerciseIndex: index, setIndex: nextInExercise(item) ?? Math.max(0, item.sets.length - 1) })}
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
              onPress={() => setPicking(true)}
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

          {allLogged && !done ? (
            <View style={{ gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: theme.ok, backgroundColor: theme.raised }}>
              <T variant="heading">Every set is logged</T>
              <T variant="muted">Finish to save this workout to your history.</T>
              <Button label="Finish workout" onPress={finish} testID="finish-all" />
            </View>
          ) : null}

          {!exercise ? (
            <View style={{ gap: space.md }}>
              <T variant="heading">Add your first exercise</T>
              <T variant="muted">Pick what you are lifting and log sets as you go.</T>
              <Button label="Add exercise" onPress={() => setPicking(true)} />
            </View>
          ) : (
            <>
              <View style={{ gap: 2 }}>
                <Text style={{ color: theme.text, fontFamily: fonts.display, fontSize: 38, lineHeight: 42 }}>{exercise.exercise_name}</Text>
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
                  </View>

                  <Row gap={space.md}>
                    <Stepper
                      label="Weight"
                      value={weightText}
                      onChange={setWeightText}
                      suffix={setUnit}
                      testID="weight"
                      onStep={(direction) => setWeightText(trim(Math.max(0, (weightValue ?? 0) + direction * weightStep(setUnit)), 2))}
                    />
                  </Row>
                  <Row gap={space.md}>
                    <Stepper
                      label="Reps"
                      value={repsText}
                      onChange={setRepsText}
                      keyboardType="number-pad"
                      testID="reps"
                      onStep={(direction) => setRepsText(String(Math.max(0, (parseAmount(repsText) ?? 0) + direction)))}
                    />
                  </Row>

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
                    <Chip label="lb" selected={setUnit === "lb"} onPress={() => setSetUnit("lb")} />
                    <Chip label="kg" selected={setUnit === "kg"} onPress={() => setSetUnit("kg")} />
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

                  <PlateDiagram weight={weightValue} unit={setUnit} />

                  {!done ? (
                    <Row>
                      {!current.completed_at && !current.skipped ? <Button label="Skip set" kind="ghost" compact onPress={() => void skip()} style={{ flex: 1 }} /> : null}
                      <Button label="Film set" kind="ghost" compact onPress={() => void film()} style={{ flex: 1 }} />
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
                      <T variant={logged || selected ? "body" : "muted"} style={{ flex: 1 }}>
                        {setLabel(exercise, index)}
                      </T>
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
                {!done && !exerciseFinished ? (
                  <Row style={{ marginTop: space.xs }}>
                    <Button label="Add set" kind="ghost" compact onPress={() => void addSet()} style={{ flex: 1 }} />
                    {current && !current.completed_at ? <Button label="Remove set" kind="ghost" compact onPress={() => void removeSet()} style={{ flex: 1 }} /> : null}
                  </Row>
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
          {nextUp ? <T variant="muted">Up next: {nextUp}</T> : null}
          <Row>
            <Button label="Add 30 seconds" kind="secondary" onPress={() => void addTime()} style={{ flex: 1 }} />
            <Button label="Skip rest" onPress={() => void skipRest()} style={{ flex: 1 }} />
          </Row>
        </View>
      ) : null}

      <ExercisePicker
        visible={picking}
        exercises={data?.exercises ?? []}
        onClose={() => setPicking(false)}
        onPick={async (picked) => {
          setPicking(false);
          const itemId = await addExerciseToSession(db, session.id, picked.id, exercises.map((row) => ({ id: row.id, session_id: session.id, exercise_id: row.exercise_id, position: row.position, notes: "" })));
          pendingAdvance.current = { exerciseId: itemId };
        }}
      />
    </View>
  );
}
