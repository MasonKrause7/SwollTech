import { buildOverview, deviceTimeZone } from "@swolltech/metrics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { startQuick, startWorkout } from "../../src/actions";
import { Button, Card, Empty, Row, Screen, Stat, SyncPill, T } from "../../src/components/ui";
import { greeting, shortDate, volume, weight } from "../../src/format";
import { live } from "../../src/logic/rows";
import { statLog } from "../../src/logic/localStats";
import { useNotebook } from "../../src/notebook";
import { syncNow, useSyncState } from "../../src/sync";
import { space, useTheme } from "../../src/theme";

export default function Today() {
  const theme = useTheme();
  const router = useRouter();
  const { db, data, profile, unit } = useNotebook();
  const { state } = useSyncState();
  const [starting, setStarting] = useState<string | null>(null);

  const overview = useMemo(() => {
    if (!data) return null;
    const { sessions, sets } = statLog(data);
    return buildOverview(sessions, sets, new Date(), deviceTimeZone());
  }, [data]);

  const active = useMemo(() => live(data?.sessions ?? []).filter((row) => row.status === "in_progress").sort((a, b) => b.started_at.localeCompare(a.started_at)), [data]);
  const workouts = useMemo(() => live(data?.workouts ?? []).filter((row) => !row.archived_at).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const lastByWorkout = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of live(data?.sessions ?? [])) {
      if (row.status !== "completed" || !row.workout_id) continue;
      const current = map.get(row.workout_id);
      if (!current || current < row.started_at) map.set(row.workout_id, row.started_at);
    }
    return map;
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

  async function quick() {
    if (!db) return;
    const id = await startQuick(db);
    router.push({ pathname: "/session/[id]", params: { id } });
  }

  const totals = overview?.totals;
  const record = overview?.recentRecords[0];
  const name = profile?.display_name?.trim();

  return (
    <Screen refreshing={state.kind === "syncing"} onRefresh={() => void syncNow()}>
      <View style={{ gap: 2 }}>
        <T variant="title">{name ? `${greeting()}, ${name}` : greeting()}</T>
        <SyncPill onPress={() => void syncNow()} />
      </View>

      {active.map((session) => (
        <Card key={session.id} onPress={() => router.push({ pathname: "/session/[id]", params: { id: session.id } })} style={{ borderColor: theme.highlight, borderWidth: 2 }}>
          <T variant="heading">Resume {session.name}</T>
          <T variant="muted">Started {shortDate(session.started_at)}. Your sets are saved on this phone.</T>
        </Card>
      ))}

      {totals ? (
        <Card>
          <Row gap={space.lg}>
            <Stat value={String(totals.thisWeekSessions)} label="Sessions this week" />
            <Stat value={volume(totals.thisWeekVolumeKg, unit)} label="Volume this week" />
            <Stat value={String(totals.currentStreakWeeks)} label={totals.currentStreakWeeks === 1 ? "Week in a row" : "Weeks in a row"} accent={totals.currentStreakWeeks > 0 ? theme.highlight : undefined} />
          </Row>
          {totals.lastWeekVolumeKg > 0 ? (
            <T variant="small">
              Last week {volume(totals.lastWeekVolumeKg, unit)}.{" "}
              {totals.thisWeekVolumeKg >= totals.lastWeekVolumeKg ? "You have already matched it." : `${volume(totals.lastWeekVolumeKg - totals.thisWeekVolumeKg, unit)} to match it.`}
            </T>
          ) : null}
        </Card>
      ) : null}

      {record ? (
        <Card onPress={() => router.push({ pathname: "/exercise/[id]", params: { id: record.exerciseId } })}>
          <T variant="label">Latest record</T>
          <T variant="heading">{record.exerciseName}</T>
          <T variant="muted">
            {weight(record.weightKg, unit)} × {record.reps} on {shortDate(record.achievedAt)}. Estimated max {weight(record.e1rmKg, unit)}, up from {weight(record.previousE1rmKg, unit)}.
          </T>
        </Card>
      ) : null}

      <T variant="heading" style={{ marginTop: space.sm }}>
        Start a workout
      </T>
      {workouts.length === 0 ? (
        <Empty
          title="No workouts yet"
          body="Write down a workout the way you would in your notebook. Then start it here and the app walks you through every set."
          action={<Button label="Write a workout" onPress={() => router.push({ pathname: "/workout/[id]", params: { id: "new" } })} />}
        />
      ) : (
        workouts.map((workout) => {
          const last = lastByWorkout.get(workout.id);
          return (
            <Card key={workout.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="heading">{workout.name}</T>
                  <T variant="small">{last ? `Last done ${shortDate(last)}` : "Not done yet"}</T>
                </View>
                <Button label="Start" compact onPress={() => void start(workout.id)} busy={starting === workout.id} style={{ minWidth: 92, minHeight: 48 }} />
              </Row>
            </Card>
          );
        })
      )}
      <Button label="Quick start without a plan" kind="secondary" onPress={() => void quick()} />
    </Screen>
  );
}
