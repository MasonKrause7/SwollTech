import { parseAmount } from "@swolltech/metrics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { ExercisePicker } from "../../src/components/ExercisePicker";
import { Button, Card, Chip, Field, Row, Screen, Sheet, T } from "../../src/components/ui";
import { deleteRow, newId, saveRow, saveRows } from "../../src/db";
import { byPosition, live, type SetKind, type Unit, type WorkoutRow } from "../../src/logic/rows";
import { exerciseName } from "../../src/logic/session";
import { describePlannedSet, moveRow, newPlannedSet, newWorkout, newWorkoutExercise, validatePlannedSet, validateWorkoutName } from "../../src/logic/workouts";
import { useNotebook } from "../../src/notebook";
import { space, useTheme } from "../../src/theme";

export default function WorkoutEditor() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, data, unit } = useNotebook();
  const creating = id === "new";
  const workout = useMemo(() => live(data?.workouts ?? []).find((row) => row.id === id) ?? null, [data, id]);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [planningFor, setPlanningFor] = useState<string | null>(null);

  useEffect(() => {
    if (workout) {
      setName(workout.name);
      setNotes(workout.notes);
    }
  }, [workout?.id]);

  const items = useMemo(
    () => (data && workout ? byPosition(live(data.workoutExercises).filter((row) => row.workout_id === workout.id)) : []),
    [data, workout],
  );

  async function create() {
    if (!db || !data) return;
    const problem = validateWorkoutName(name, data.workouts);
    if (problem) return setError(problem);
    const row = newWorkout(newId(), name);
    await saveRow(db, "workouts", row);
    router.replace({ pathname: "/workout/[id]", params: { id: row.id } });
  }

  async function saveDetails() {
    if (!db || !data || !workout) return;
    if (name.trim() === workout.name && notes === workout.notes) return;
    const problem = validateWorkoutName(name, data.workouts, workout.id);
    if (problem) return setError(problem);
    setError(null);
    await saveRow(db, "workouts", { ...workout, name: name.trim(), notes });
  }

  async function setArchived(row: WorkoutRow, archived: boolean) {
    if (!db) return;
    await saveRow(db, "workouts", { ...row, archived_at: archived ? new Date().toISOString() : null });
  }

  function confirmDelete() {
    if (!db || !workout) return;
    Alert.alert("Delete this workout?", "Past sessions stay in your history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteRow(db, "workouts", workout.id);
          router.back();
        },
      },
    ]);
  }

  if (creating) {
    return (
      <Screen edges={["bottom"]}>
        <Stack.Screen options={{ title: "New workout" }} />
        <Field label="Name" value={name} onChangeText={setName} placeholder="Push day" autoFocus error={error} onSubmitEditing={create} />
        <Button label="Create workout" onPress={() => void create()} />
      </Screen>
    );
  }

  if (!workout || !data || !db) {
    return (
      <Screen edges={["bottom"]}>
        <T variant="muted">This workout is not on this phone.</T>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: workout.name }} />
      <Field label="Name" value={name} onChangeText={setName} onEndEditing={() => void saveDetails()} error={error} />
      <Field label="Notes" value={notes} onChangeText={setNotes} onEndEditing={() => void saveDetails()} placeholder="Cues, tempo, anything you would scribble in the margin" multiline style={{ minHeight: 80, paddingTop: 12 }} />

      {items.map((item, index) => {
        const sets = byPosition(live(data.workoutSets).filter((row) => row.workout_exercise_id === item.id));
        return (
          <Card key={item.id}>
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="heading" style={{ flex: 1 }}>
                {exerciseName(data, item.exercise_id)}
              </T>
              <Row gap={4}>
                <Button label="Up" kind="ghost" compact disabled={index === 0} onPress={() => void saveRows(db, "workout_exercises", moveRow(items, item.id, -1))} />
                <Button label="Down" kind="ghost" compact disabled={index === items.length - 1} onPress={() => void saveRows(db, "workout_exercises", moveRow(items, item.id, 1))} />
              </Row>
            </Row>
            {sets.length === 0 ? <T variant="muted">No sets planned. You can still log sets as you go.</T> : null}
            {sets.map((set, setIndex) => (
              <Row key={set.id} style={{ justifyContent: "space-between", minHeight: 44 }}>
                <T>
                  <T variant="label">{set.kind === "warmup" ? "Warmup" : `Set ${sets.filter((row, i) => row.kind === "working" && i <= setIndex).length}`}  </T>
                  {describePlannedSet(set)}
                </T>
                <Row gap={4}>
                  <T variant="small">{set.rest_seconds}s rest</T>
                  <Button label="Remove" kind="ghost" compact onPress={() => void deleteRow(db, "workout_sets", set.id)} />
                </Row>
              </Row>
            ))}
            <Row>
              <Button label="Add set" kind="secondary" compact onPress={() => setPlanningFor(item.id)} style={{ flex: 1 }} />
              <Button
                label="Remove exercise"
                kind="danger"
                compact
                onPress={() => void deleteRow(db, "workout_exercises", item.id)}
                style={{ flex: 1 }}
              />
            </Row>
          </Card>
        );
      })}

      <Button label="Add exercise" onPress={() => setPicking(true)} />
      <Row style={{ marginTop: space.lg }}>
        <Button label={workout.archived_at ? "Restore" : "Archive"} kind="secondary" onPress={() => void setArchived(workout, !workout.archived_at)} style={{ flex: 1 }} />
        <Button label="Delete" kind="danger" onPress={confirmDelete} style={{ flex: 1 }} />
      </Row>
      {workout.archived_at ? <T variant="small" style={{ color: theme.muted }}>Archived workouts are hidden from Today.</T> : null}

      <ExercisePicker
        visible={picking}
        exercises={data.exercises}
        onClose={() => setPicking(false)}
        onPick={async (exercise) => {
          setPicking(false);
          const row = newWorkoutExercise(newId(), workout.id, exercise.id, items);
          await saveRow(db, "workout_exercises", row);
          setPlanningFor(row.id);
        }}
      />
      <PlanSetSheet
        visible={planningFor != null}
        unit={unit}
        onClose={() => setPlanningFor(null)}
        onSave={async (input, count) => {
          if (!planningFor) return;
          const siblings = [...live(data.workoutSets).filter((row) => row.workout_exercise_id === planningFor)];
          const rows = [];
          for (let i = 0; i < count; i += 1) {
            const row = newPlannedSet(newId(), planningFor, input, [...siblings, ...rows]);
            rows.push(row);
          }
          await saveRows(db, "workout_sets", rows);
          setPlanningFor(null);
        }}
      />
    </Screen>
  );
}

function PlanSetSheet({
  visible,
  unit,
  onClose,
  onSave,
}: {
  visible: boolean;
  unit: Unit;
  onClose: () => void;
  onSave: (input: { kind: SetKind; reps: number | null; weight: number | null; percent: number | null; unit: Unit; restSeconds: number }, count: number) => Promise<void>;
}) {
  const theme = useTheme();
  const [kind, setKind] = useState<SetKind>("working");
  const [count, setCount] = useState(3);
  const [reps, setReps] = useState("5");
  const [weight, setWeight] = useState("");
  const [percent, setPercent] = useState("");
  const [setUnit, setSetUnit] = useState<Unit>(unit);
  const [rest, setRest] = useState("120");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const input = {
      kind,
      reps: parseAmount(reps),
      weight: parseAmount(weight),
      percent: parseAmount(percent),
      unit: setUnit,
      restSeconds: parseAmount(rest) ?? 120,
    };
    const problem = validatePlannedSet(input);
    if (problem) return setError(problem);
    setError(null);
    await onSave(input, count);
    setWeight("");
    setPercent("");
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Plan sets">
      <View style={{ padding: space.lg, gap: space.md }}>
        <Row>
          <Chip label="Working" selected={kind === "working"} onPress={() => setKind("working")} />
          <Chip label="Warmup" selected={kind === "warmup"} onPress={() => setKind("warmup")} />
        </Row>
        <T variant="label">How many sets</T>
        <Row>
          {[1, 2, 3, 4, 5].map((value) => (
            <Chip key={value} label={String(value)} selected={count === value} onPress={() => setCount(value)} />
          ))}
        </Row>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label="Reps" value={reps} onChangeText={setReps} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Rest (seconds)" value={rest} onChangeText={setRest} keyboardType="number-pad" />
          </View>
        </Row>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <Field label={`Weight (${setUnit})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="Optional" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Or % of max" value={percent} onChangeText={setPercent} keyboardType="decimal-pad" placeholder="Optional" />
          </View>
        </Row>
        <Row>
          <Chip label="lb" selected={setUnit === "lb"} onPress={() => setSetUnit("lb")} />
          <Chip label="kg" selected={setUnit === "kg"} onPress={() => setSetUnit("kg")} />
        </Row>
        <T variant="small">Percent targets use your training max, or your best estimate if you have not set one.</T>
        {error ? <T style={{ color: theme.danger }}>{error}</T> : null}
        <Button label={count === 1 ? "Add set" : `Add ${count} sets`} onPress={() => void save()} />
      </View>
    </Sheet>
  );
}
