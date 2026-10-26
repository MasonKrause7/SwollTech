import { buildSessionReport } from "@swolltech/metrics";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import { Button, Card, Row, Screen, Stat, T } from "../../src/components/ui";
import { duration, volume, weight } from "../../src/format";
import { statLog } from "../../src/logic/localStats";
import { live } from "../../src/logic/rows";
import { useNotebook } from "../../src/notebook";
import { fonts, plate, space, useTheme } from "../../src/theme";

export default function Summary() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, unit } = useNotebook();
  const session = useMemo(() => live(data?.sessions ?? []).find((row) => row.id === id) ?? null, [data, id]);
  const report = useMemo(() => {
    if (!data || !session) return null;
    const { sessions, sets } = statLog(data, session.id);
    const target = sessions.find((row) => row.id === session.id)!;
    return buildSessionReport(target, sessions, sets);
  }, [data, session]);

  const records = report?.records.length ?? 0;
  useEffect(() => {
    if (records > 0) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [records]);

  if (!session || !report) {
    return (
      <Screen>
        <T variant="muted">Loading your session.</T>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <T variant="label">Workout done</T>
      <T variant="title">{session.name}</T>
      <Card>
        <Row gap={space.lg}>
          <Stat value={volume(report.volumeKg, unit)} label="Volume" />
          <Stat value={String(report.sets)} label="Working sets" />
          <Stat value={duration(report.durationSeconds)} label="Time" />
        </Row>
      </Card>

      {records > 0 ? (
        <View style={{ backgroundColor: theme.accent, borderRadius: 18, padding: space.lg, gap: space.sm }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: theme.accentInk }}>
            {records === 1 ? "New personal record" : `${records} new personal records`}
          </Text>
          {report.records.map((record) => (
            <View key={record.exerciseId} style={{ gap: 2 }}>
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 17, color: theme.accentInk }}>{record.exerciseName}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 15, color: theme.accentInk }}>
                {weight(record.weightKg, unit)} × {record.reps}. Estimated max {weight(record.e1rmKg, unit)}, up {weight(record.e1rmKg - record.previousE1rmKg, unit)}.
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <T variant="muted">No new records this time. Consistent sessions are what move the numbers.</T>
      )}

      {report.exercises.map((item) => (
        <Card key={item.exerciseId} onPress={() => router.push({ pathname: "/exercise/[id]", params: { id: item.exerciseId } })}>
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="heading" style={{ flex: 1 }}>
              {item.exerciseName}
            </T>
            {report.records.some((record) => record.exerciseId === item.exerciseId) ? <T variant="small" style={{ color: plate.yellow }}>Record</T> : null}
          </Row>
          <T variant="muted">
            Best set {weight(item.topWeightKg, unit)} × {item.topReps}. {item.sets} working set{item.sets === 1 ? "" : "s"}.
          </T>
        </Card>
      ))}

      <Button label="Done" onPress={() => router.replace("/(tabs)")} style={{ marginTop: space.md }} />
      <Button label="Review sets" kind="secondary" onPress={() => router.push({ pathname: "/history/[id]", params: { id: session.id } })} />
    </Screen>
  );
}
