import { buildSessionReport, RECORD_LABELS, sessionHeadline, type LiftRecord, type SessionReportExercise, type SetRef } from "@swolltech/metrics";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { Image, Text, View } from "react-native";
import { art } from "../../src/art";
import { RecordBadge } from "../../src/components/charts";
import { Button, Card, Row, Screen, Stat, T } from "../../src/components/ui";
import { duration, shortDate, volume, weight } from "../../src/format";
import { statLog } from "../../src/logic/localStats";
import { live, type Unit } from "../../src/logic/rows";
import { useNotebook } from "../../src/notebook";
import { fonts, space, useTheme } from "../../src/theme";

function setText(set: SetRef, unit: Unit) {
  return `${weight(set.weightKg, unit)} × ${set.reps}`;
}

function vsLast(value: number, suffix: string) {
  if (value === 0) return "Same as last time";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}${suffix} vs last`;
}

/** "New best", "2.5% below your best", "First time logged". */
function standingText(item: SessionReportExercise, unit: Unit) {
  if (item.standing === "first" || !item.allTimeBest) return "First time logged. This is your baseline.";
  const best = setText(item.allTimeBest, unit);
  if (item.standing === "best") return item.vsBestPercent ? `New best, up ${item.vsBestPercent}% on ${best}.` : "New best.";
  if (!item.vsBestPercent) return `Matched your best, ${best}.`;
  return `${Math.abs(item.vsBestPercent)}% below your best, ${best}.`;
}

function lastText(item: SessionReportExercise, unit: Unit) {
  if (!item.last || !item.lastAt) return null;
  const change = item.vsLastPercent;
  const tail = !change ? "" : ` (${change > 0 ? "+" : "−"}${Math.abs(change)}%)`;
  return `Last time ${setText(item.last, unit)} on ${shortDate(item.lastAt)}${tail}.`;
}

function recordText(record: LiftRecord, unit: Unit) {
  if (record.type === "e1rm") {
    return `${weight(record.weightKg, unit)} × ${record.reps}, estimated max ${weight(record.e1rmKg, unit)}, up ${weight((record.e1rmKg ?? 0) - record.previous, unit)}.`;
  }
  if (record.type === "weight") return `${weight(record.weightKg, unit)} × ${record.reps}, up from ${weight(record.previous, unit)}.`;
  return `${record.reps} reps at ${weight(record.weightKg, unit)}. Your most at that weight or heavier was ${record.previous}.`;
}

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

  const records = report?.prs.length ?? 0;
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

  const previous = report.previous;
  const headline = sessionHeadline(report, session.name);
  const recordLifts = report.exercises.filter((item) => item.records.length > 0);

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ borderRadius: 20, overflow: "hidden", backgroundColor: "#0F1011", borderWidth: 1, borderColor: theme.line }}>
        <Image source={art.bench} accessible={false} style={{ width: "100%", height: 200 }} resizeMode="cover" />
        <View style={{ padding: space.lg, gap: space.sm }}>
          <T variant="label" style={{ color: "#8E9196" }}>
            Workout done
          </T>
          <T variant="title" style={{ color: "#F4F4F2" }}>
            {session.name}
          </T>
          <Text testID="summary-headline" style={{ fontFamily: fonts.displaySemi, fontSize: 22, lineHeight: 26, color: records ? "#FF5A1F" : "#F4F4F2" }}>
            {headline}
          </Text>
        </View>
      </View>

      <Card>
        <Row gap={space.lg} style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Stat value={volume(report.volumeKg, unit)} label="Volume" />
            {previous?.volumeDeltaPercent != null ? (
              <T variant="small" style={{ color: previous.volumeDeltaPercent >= 0.5 ? theme.ok : theme.muted }}>
                {vsLast(Math.round(previous.volumeDeltaPercent), "%")}
              </T>
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Stat value={String(report.sets)} label="Working sets" />
            {previous ? <T variant="small">{vsLast(previous.setsDelta, Math.abs(previous.setsDelta) === 1 ? " set" : " sets")}</T> : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Stat value={duration(report.durationSeconds)} label="Time" />
            {previous?.durationDeltaSeconds != null ? <T variant="small">{vsLast(Math.round(previous.durationDeltaSeconds / 60), " min")}</T> : null}
          </View>
        </Row>
        {previous ? (
          <T variant="small">
            Your last {session.name} on {shortDate(previous.startedAt)}: {volume(previous.volumeKg, unit)} over {previous.sets} working set{previous.sets === 1 ? "" : "s"}.
          </T>
        ) : null}
      </Card>

      {recordLifts.length > 0 ? (
        <View style={{ backgroundColor: theme.highlight, borderRadius: 14, padding: space.lg, gap: space.md }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: theme.highlightInk }}>
            {records === 1 ? "New personal record" : `${records} new personal records`}
          </Text>
          {recordLifts.map((item) => (
            <View key={item.exerciseId} style={{ gap: 2 }}>
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 17, color: theme.highlightInk }}>{item.exerciseName}</Text>
              {report.prs
                .filter((record) => record.exerciseId === item.exerciseId)
                .map((record) => (
                  <Text key={record.type} style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: theme.highlightInk }}>
                    <Text style={{ fontFamily: fonts.bodySemi }}>{RECORD_LABELS[record.type]}. </Text>
                    {recordText(record, unit)}
                  </Text>
                ))}
            </View>
          ))}
        </View>
      ) : (
        <T variant="muted">No new records this time. Consistent sessions are what move the numbers.</T>
      )}

      {report.exercises.map((item) => {
        const last = lastText(item, unit);
        return (
          <Card key={item.exerciseId} onPress={() => router.push({ pathname: "/exercise/[id]", params: { id: item.exerciseId } })}>
            <T variant="heading">{item.exerciseName}</T>
            {item.records.length ? (
              <Row gap={4} style={{ flexWrap: "wrap" }}>
                {item.records.map((type) => (
                  <RecordBadge key={type} type={type} />
                ))}
              </Row>
            ) : null}
            <T>
              Best set {setText(item.best, unit)}. {item.sets} working set{item.sets === 1 ? "" : "s"}.
            </T>
            {last ? <T variant="muted">{last}</T> : null}
            <T variant="small" style={{ color: item.standing === "best" ? theme.highlight : theme.muted }}>
              {standingText(item, unit)}
            </T>
          </Card>
        );
      })}

      <Button label="Done" onPress={() => router.replace("/(tabs)")} style={{ marginTop: space.md }} />
      <Button label="Review sets" kind="secondary" onPress={() => router.push({ pathname: "/history/[id]", params: { id: session.id } })} />
    </Screen>
  );
}
