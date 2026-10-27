import {
  formatClock,
  matchingPrevious,
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
import { SafeAreaView } from "react-native-safe-area-context";
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
  const [error, setError] = useState<string | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(Date.now());
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingAdvance = useRef<"next" | { exerciseId: string } | null>(null);

  // Pick the first open set when the session loads.
  useEffect(() => {
    if (!view || position) return;
    setPosition(nextPosition(view.exercises) ?? (view.exercises.length ? { exerciseIndex: 0, setIndex: 0 } : null));
  }, [view, position]);

  // After a write lands, move to where the lifter should go next.
  useEffect(() => {
    if (!view || !pendingAdvance.current) return;
    const target = pendingAdvance.current;
    pendingAdvance.current = null;
    if (target === "next") {
      const next = nextPosition(view.exercises);
      if (next) setPosition(next);
      return;
    }
    const index = view.exercises.findIndex((row) => row.id === target.exerciseId);
    if (index >= 0) setPosition({ exerciseIndex: index, setIndex: Math.max(0, view.exercises[index].sets.length - 1) });
  }, [view]);

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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, padding: space.lg, gap: space.md }}>
        <T variant="heading">{data ? "This session is not on this phone" : "Opening your notebook"}</T>
        {data ? <Button label="Back" kind="secondary" onPress={() => router.back()} /> : null}
      </SafeAreaView>
    );
  }

  const { session } = view;
  const done = session.status !== "in_progress";
  const overall = progress(exercises);
  const last = exercise && position ? matchingPrevious(exercise, position.setIndex) : null;
  const target = current ? targetText(current) : null;
  const weightValue = parseAmount(weightText);

  async function log() {
    if (!db || !current) return;
    const reps = parseAmount(repsText);
    const problem = validateSet(weightValue, reps);
    if (problem) {
      setError(problem);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      return;
    }
    setSaving(true);
    const wasDone = current.completed_at != null;
    await saveRow(db, "session_sets", logSet(current, { weight: weightValue!, reps: reps!, unit: setUnit, rpe }, new Date()));
    setSaving(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (wasDone || done) return;
    pendingAdvance.current = "next";
    const remaining = overall.total - overall.done - 1;
    if (current.rest_seconds > 0 && remaining > 0) {
      const scheduled = await startRest(current.rest_seconds);
      setNow(Date.now());
      setRest({ until: scheduled.until, total: current.rest_seconds, notificationId: scheduled.notificationId });
    }
  }

  async function skip() {
    if (!db || !current) return;
    await saveRow(db, "session_sets", skipSet(current));
    void Haptics.selectionAsync().catch(() => undefined);
    pendingAdvance.current = "next";
  }

  async function addSet() {
    if (!db || !exercise) return;
    pendingAdvance.current = { exerciseId: exercise.id };
    await addSetToExercise(db, exercise.id, exercise.sets, nextSetTemplate(exercise, unit));
  }

  async function removeSet() {
    if (!db || !current || !exercise || !position) return;
    await deleteRow(db, "session_sets", current.id);
    setPosition({ exerciseIndex: position.exerciseIndex, setIndex: Math.max(0, position.setIndex - 1) });
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
    const next = nextPosition(exercises);
    if (!next) return null;
    const item = exercises[next.exerciseIndex];
    const values = prefill(item, next.setIndex, unit);
    const amount = values.weight != null && values.reps != null ? `, ${trim(values.weight, 2)} ${values.unit} × ${values.reps}` : "";
    return `${item.exercise_name}, ${setLabel(item, next.setIndex).toLowerCase()}${amount}`;
  })();

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: theme.bg }}>
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
              <Button label="Finish" compact onPress={finish} testID="finish" />
            )}
          </Row>
          <ProgressBar fraction={overall.fraction} />
          <T variant="small">
            {overall.done} of {overall.total} sets done
          </T>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, paddingVertical: space.sm }} style={{ flexGrow: 0 }}>
          {exercises.map((item, index) => {
            const p = progress([item]);
            const selected = position?.exerciseIndex === index;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setPosition({ exerciseIndex: index, setIndex: nextInExercise(item) ?? Math.max(0, item.sets.length - 1) })}
                style={{
                  minHeight: 48,
                  paddingHorizontal: space.md,
                  paddingVertical: space.xs,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: selected ? theme.accent : theme.line,
                  backgroundColor: p.total > 0 && p.done === p.total ? theme.raised : "transparent",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: theme.text, fontFamily: fonts.bodySemi, fontSize: 14 }}>{item.exercise_name}</Text>
                <Text style={{ color: p.total > 0 && p.done === p.total ? theme.highlight : theme.muted, fontFamily: fonts.displaySemi, fontSize: 13 }}>
                  {p.done}/{p.total}
                </Text>
              </Pressable>
            );
          })}
          {!done ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPicking(true)}
              style={{ minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.line, justifyContent: "center" }}
            >
              <Text style={{ color: theme.muted, fontFamily: fonts.bodySemi }}>Add exercise</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {!exercise ? (
            <View style={{ gap: space.md }}>
              <T variant="heading">Add your first exercise</T>
              <T variant="muted">Pick what you are lifting and log sets as you go.</T>
              <Button label="Add exercise" onPress={() => setPicking(true)} />
            </View>
          ) : (
            <>
              <View style={{ gap: 2 }}>
                <Text style={{ color: theme.text, fontFamily: fonts.display, fontSize: 38, lineHeight: 40 }}>{exercise.exercise_name}</Text>
                {current ? (
                  <Row>
                    <T variant="heading" style={{ color: current.kind === "warmup" ? theme.muted : theme.accent }}>
                      {setLabel(exercise, position!.setIndex)}
                    </T>
                    {current.completed_at ? <T variant="small" style={{ color: theme.ok }}>Logged</T> : null}
                    {current.skipped ? <T variant="small">Skipped</T> : null}
                  </Row>
                ) : (
                  <T variant="muted">No sets yet. Add one below.</T>
                )}
              </View>

              {current ? (
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
                  <Row style={{ justifyContent: "space-between" }}>
                    <Row>
                      <Chip label="lb" selected={setUnit === "lb"} onPress={() => setSetUnit("lb")} />
                      <Chip label="kg" selected={setUnit === "kg"} onPress={() => setSetUnit("kg")} />
                    </Row>
                    <Row gap={6}>
                      <T variant="label">RPE</T>
                      {RPE.map((value) => (
                        <Chip key={value} label={String(value)} selected={rpe === value} onPress={() => setRpe(rpe === value ? null : value)} />
                      ))}
                    </Row>
                  </Row>

                  <PlateDiagram weight={weightValue} unit={setUnit} />

                  {error ? <T style={{ color: theme.danger }}>{error}</T> : null}
                  {!done || current.completed_at ? (
                    <>
                      <Button label={current.completed_at ? "Save changes" : "Log set"} onPress={() => void log()} busy={saving} testID="log-set" style={{ minHeight: 64 }} />
                      <Row>
                        {!done && !current.completed_at && !current.skipped ? <Button label="Skip set" kind="secondary" onPress={() => void skip()} style={{ flex: 1 }} /> : null}
                        <Button label="Film set" kind="secondary" onPress={() => void film()} style={{ flex: 1 }} />
                      </Row>
                    </>
                  ) : null}
                </>
              ) : null}

              <View style={{ gap: space.xs, marginTop: space.sm }}>
                <T variant="label">All sets</T>
                {exercise.sets.map((set, index) => {
                  const selected = position?.setIndex === index;
                  const status = set.completed_at ? pair(set.actual_weight, set.actual_unit, set.actual_reps) : set.skipped ? "Skipped" : targetText(set) ?? "Open";
                  return (
                    <Pressable
                      key={set.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setPosition({ exerciseIndex: position!.exerciseIndex, setIndex: index })}
                      style={{
                        minHeight: 48,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: space.md,
                        borderRadius: radius.md,
                        backgroundColor: selected ? theme.raised : "transparent",
                        borderWidth: 1,
                        borderColor: selected ? theme.line : "transparent",
                      }}
                    >
                      <T variant={set.completed_at ? "body" : "muted"}>{setLabel(exercise, index)}</T>
                      <Text style={{ color: set.completed_at ? theme.text : theme.muted, fontFamily: fonts.displaySemi, fontSize: 18 }}>{status}</Text>
                    </Pressable>
                  );
                })}
                {!done ? (
                  <Row style={{ marginTop: space.xs }}>
                    <Button label="Add set" kind="secondary" compact onPress={() => void addSet()} style={{ flex: 1 }} />
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
    </SafeAreaView>
  );
}
