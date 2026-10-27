import { buildOverview, deviceTimeZone, fromKilograms, localDay } from "@swolltech/metrics";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { BarChart, Heatmap, SplitBars } from "../../src/components/charts";
import { Card, Empty, Row, Screen, Stat, T } from "../../src/components/ui";
import { shortDate, volume, weight } from "../../src/format";
import { statLog } from "../../src/logic/localStats";
import { useNotebook } from "../../src/notebook";
import { syncNow, useSyncState } from "../../src/sync";
import { dataColors, space, useTheme } from "../../src/theme";

function weekTick(day: string) {
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
}

export default function Progress() {
  const theme = useTheme();
  const router = useRouter();
  const { data, unit } = useNotebook();
  const { state } = useSyncState();
  const zone = deviceTimeZone();
  const overview = useMemo(() => {
    if (!data) return null;
    const { sessions, sets } = statLog(data);
    return buildOverview(sessions, sets, new Date(), zone);
  }, [data, zone]);

  if (!overview) return <Screen>{null}</Screen>;
  const { totals } = overview;

  if (totals.sessions === 0) {
    return (
      <Screen>
        <T variant="title">Progress</T>
        <Empty title="Your charts start after one workout" body="Finish a session and this page fills in with your weekly volume, streaks, records and a chart for every lift." />
      </Screen>
    );
  }

  return (
    <Screen refreshing={state.kind === "syncing"} onRefresh={() => void syncNow()}>
      <T variant="title">Progress</T>
      <Card>
        <Row gap={space.lg}>
          <Stat value={String(totals.currentStreakWeeks)} label="Week streak" accent={totals.currentStreakWeeks ? theme.highlight : undefined} />
          <Stat value={String(totals.longestStreakWeeks)} label="Longest streak" />
          <Stat value={String(totals.records)} label="Records set" accent={totals.records ? theme.highlight : undefined} />
        </Row>
        <T variant="small">
          {totals.sessions} sessions and {volume(totals.volumeKg, unit)} lifted in total.
        </T>
      </Card>

      <Card>
        <T variant="heading">Weekly volume</T>
        <T variant="small">Working sets only, weight times reps, in {unit}. This week is highlighted.</T>
        <BarChart
          accessibilityLabel={`Weekly volume. This week ${volume(totals.thisWeekVolumeKg, unit)}`}
          data={overview.weekly.map((row) => ({ label: weekTick(row.weekStart), value: fromKilograms(row.volumeKg, unit) }))}
        />
      </Card>

      <Card>
        <T variant="heading">Sessions per week</T>
        <BarChart
          accessibilityLabel={`Sessions per week. This week ${totals.thisWeekSessions}`}
          color={theme.text}
          format={(value) => String(Math.round(value * 10) / 10)}
          data={overview.weekly.map((row) => ({ label: weekTick(row.weekStart), value: row.sessions }))}
          height={130}
        />
      </Card>

      <Card>
        <T variant="heading">Consistency</T>
        <T variant="small">Each square is a day. Green days you trained.</T>
        <Heatmap days={overview.calendar} today={localDay(new Date(), zone)} />
      </Card>

      {overview.muscleSplit.length ? (
        <Card>
          <T variant="heading">Last 4 weeks by muscle</T>
          <SplitBars
            colors={dataColors}
            rows={overview.muscleSplit.map((row) => ({ label: row.muscle, value: row.sets, detail: `${row.sets} sets, ${volume(row.volumeKg, unit)}` }))}
          />
        </Card>
      ) : null}

      {overview.recentRecords.length ? (
        <Card>
          <T variant="heading">Recent records</T>
          {overview.recentRecords.map((record) => (
            <Row key={`${record.sessionId}-${record.exerciseId}`} style={{ justifyContent: "space-between", minHeight: 44 }}>
              <View style={{ flex: 1 }}>
                <T>{record.exerciseName}</T>
                <T variant="small">
                  {weight(record.weightKg, unit)} × {record.reps} on {shortDate(record.achievedAt)}
                </T>
              </View>
              <T variant="number" style={{ fontSize: 20, color: theme.highlight }}>
                +{weight(record.e1rmKg - record.previousE1rmKg, unit)}
              </T>
            </Row>
          ))}
        </Card>
      ) : null}

      <T variant="heading" style={{ marginTop: space.sm }}>
        Lifts
      </T>
      {overview.exercises.map((row) => (
        <Card key={row.exerciseId} onPress={() => router.push({ pathname: "/exercise/[id]", params: { id: row.exerciseId } })}>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <T>{row.exerciseName}</T>
              <T variant="small">
                {row.sessions} session{row.sessions === 1 ? "" : "s"}, last {shortDate(row.lastPerformedAt)}
              </T>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <T variant="number" style={{ fontSize: 22 }}>{weight(row.bestE1rmKg, unit, 0)}</T>
              <T variant="small" style={{ color: theme.muted }}>Best estimate</T>
            </View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
