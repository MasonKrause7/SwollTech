import { deviceTimeZone } from "@swolltech/metrics";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { Card, Empty, Row, Screen, T } from "../../src/components/ui";
import { dayAndTime, volume } from "../../src/format";
import { historyByWeek, weekLabel } from "../../src/logic/localStats";
import { useNotebook } from "../../src/notebook";
import { syncNow, useSyncState } from "../../src/sync";
import { space } from "../../src/theme";

export default function History() {
  const router = useRouter();
  const { data, unit } = useNotebook();
  const { state } = useSyncState();
  const weeks = useMemo(() => (data ? historyByWeek(data, deviceTimeZone()) : []), [data]);
  return (
    <Screen refreshing={state.kind === "syncing"} onRefresh={() => void syncNow()}>
      <T variant="title">History</T>
      {weeks.length === 0 ? <Empty title="Nothing logged yet" body="Finished workouts show up here, grouped by week." /> : null}
      {weeks.map((week) => (
        <View key={week.weekStart} style={{ gap: space.sm, marginTop: space.sm }}>
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="heading">{weekLabel(week.weekStart)}</T>
            <T variant="small">{volume(week.volumeKg, unit)}</T>
          </Row>
          {week.sessions.map(({ session, volumeKg, sets }) => (
            <Card key={session.id} onPress={() => router.push({ pathname: "/history/[id]", params: { id: session.id } })}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <T variant="body">{session.name}</T>
                  <T variant="small">{dayAndTime(session.started_at)}</T>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <T variant="number" style={{ fontSize: 22 }}>{volume(volumeKg, unit)}</T>
                  <T variant="small">{sets} sets</T>
                </View>
              </Row>
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}
