import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { startWorkout } from "../../src/actions";
import { ProgramPicker } from "../../src/components/ProgramPicker";
import { Button, Card, Empty, Row, Screen, T } from "../../src/components/ui";
import { shortDate } from "../../src/format";
import { byPosition, live } from "../../src/logic/rows";
import { exerciseName } from "../../src/logic/session";
import { useNotebook } from "../../src/notebook";
import { syncNow, useSyncState } from "../../src/sync";
import { space } from "../../src/theme";

export default function Workouts() {
  const router = useRouter();
  const { db, data, unit } = useNotebook();
  const { state } = useSyncState();
  const [programs, setPrograms] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const rows = useMemo(() => {
    if (!data) return [];
    const last = new Map<string, string>();
    for (const row of live(data.sessions)) {
      if (row.status !== "completed" || !row.workout_id) continue;
      const current = last.get(row.workout_id);
      if (!current || current < row.started_at) last.set(row.workout_id, row.started_at);
    }
    return live(data.workouts)
      .sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) || a.name.localeCompare(b.name))
      .map((workout) => {
        const items = byPosition(live(data.workoutExercises).filter((row) => row.workout_id === workout.id));
        const sets = live(data.workoutSets).filter((row) => items.some((item) => item.id === row.workout_exercise_id)).length;
        return { workout, names: items.map((item) => exerciseName(data, item.exercise_id)), sets, last: last.get(workout.id) ?? null };
      });
  }, [data]);

  async function start(workoutId: string) {
    if (!db) return;
    setStarting(workoutId);
    try {
      const id = await startWorkout(db, workoutId, unit);
      router.push({ pathname: "/session/[id]", params: { id } });
    } catch (error) {
      Alert.alert("Could not start", error instanceof Error ? error.message : "Try again.");
    } finally {
      setStarting(null);
    }
  }

  return (
    <Screen refreshing={state.kind === "syncing"} onRefresh={() => void syncNow()}>
      <Row style={{ justifyContent: "space-between" }}>
        <T variant="title">Workouts</T>
        <Button label="New" compact onPress={() => router.push({ pathname: "/workout/[id]", params: { id: "new" } })} style={{ minWidth: 80, minHeight: 44 }} />
      </Row>
      {rows.length === 0 ? (
        <Empty
          title="Write your first workout"
          body="Name it, add the exercises, and plan the sets and reps. Or start from a proven program and edit it to taste. Works offline."
          action={<Button label="Start from a program" onPress={() => setPrograms(true)} testID="workouts-start-from-program" />}
        />
      ) : null}
      {rows.map(({ workout, names, sets, last }) => (
        <Card key={workout.id} onPress={() => router.push({ pathname: "/workout/[id]", params: { id: workout.id } })}>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ gap: 4, flex: 1 }}>
              <T variant="heading">{workout.name}</T>
              <T variant="muted" numberOfLines={2}>
                {names.length ? names.join(", ") : "No exercises yet"}
              </T>
              <T variant="small">
                {workout.archived_at
                  ? "Archived"
                  : `${names.length} exercise${names.length === 1 ? "" : "s"}, ${sets} planned set${sets === 1 ? "" : "s"}${last ? `. Last done ${shortDate(last)}` : ""}`}
              </T>
            </View>
            {workout.archived_at ? null : (
              <Button
                label="Start"
                compact
                onPress={() => void start(workout.id)}
                busy={starting === workout.id}
                disabled={starting != null && starting !== workout.id}
                style={{ minWidth: 84, minHeight: 48 }}
                testID={`start-${workout.id}`}
              />
            )}
          </Row>
        </Card>
      ))}
      {rows.length > 0 ? <Button label="Add a program" kind="secondary" onPress={() => setPrograms(true)} style={{ marginTop: space.sm }} /> : null}
      <ProgramPicker visible={programs} onClose={() => setPrograms(false)} />
    </Screen>
  );
}
