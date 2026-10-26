import { useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { Button, Card, Empty, Row, Screen, T } from "../../src/components/ui";
import { byPosition, live } from "../../src/logic/rows";
import { exerciseName } from "../../src/logic/session";
import { useNotebook } from "../../src/notebook";
import { syncNow, useSyncState } from "../../src/sync";

export default function Workouts() {
  const router = useRouter();
  const { data } = useNotebook();
  const { state } = useSyncState();
  const rows = useMemo(() => {
    if (!data) return [];
    return live(data.workouts)
      .sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) || a.name.localeCompare(b.name))
      .map((workout) => {
        const items = byPosition(live(data.workoutExercises).filter((row) => row.workout_id === workout.id));
        const sets = live(data.workoutSets).filter((row) => items.some((item) => item.id === row.workout_exercise_id)).length;
        return { workout, names: items.map((item) => exerciseName(data, item.exercise_id)), sets };
      });
  }, [data]);

  return (
    <Screen refreshing={state.kind === "syncing"} onRefresh={() => void syncNow()}>
      <Row style={{ justifyContent: "space-between" }}>
        <T variant="title">Workouts</T>
        <Button label="New" compact onPress={() => router.push({ pathname: "/workout/[id]", params: { id: "new" } })} style={{ minWidth: 80, minHeight: 44 }} />
      </Row>
      {rows.length === 0 ? (
        <Empty title="Write your first workout" body="Name it, add the exercises, and plan the sets and reps. You can edit it any time, even offline." />
      ) : null}
      {rows.map(({ workout, names, sets }) => (
        <Card key={workout.id} onPress={() => router.push({ pathname: "/workout/[id]", params: { id: workout.id } })}>
          <View style={{ gap: 4 }}>
            <T variant="heading">{workout.name}</T>
            <T variant="muted" numberOfLines={2}>
              {names.length ? names.join(", ") : "No exercises yet"}
            </T>
            <T variant="small">
              {workout.archived_at ? "Archived" : `${names.length} exercise${names.length === 1 ? "" : "s"}, ${sets} planned set${sets === 1 ? "" : "s"}`}
            </T>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
