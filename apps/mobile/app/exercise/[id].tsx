import { E1RM_MAX_REPS, exerciseHistory, fromKilograms, liftRecords, RECORD_LABELS, repMaxes, toKilograms } from "@swolltech/metrics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { BarChart, LineChart, RecordBadge } from "../../src/components/charts";
import { Button, Card, Field, Row, Screen, Stat, T } from "../../src/components/ui";
import { deleteRow, newId, saveRow } from "../../src/db";
import { shortDate, trim, volume, weight } from "../../src/format";
import { exerciseProgress, statLog } from "../../src/logic/localStats";
import { live } from "../../src/logic/rows";
import { exerciseName } from "../../src/logic/session";
import { useNotebook } from "../../src/notebook";
import { space, useTheme } from "../../src/theme";
import { parseAmount } from "@swolltech/metrics";

export default function ExerciseDetail() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, data, unit } = useNotebook();
  const router = useRouter();
  const points = useMemo(() => (data && id ? exerciseProgress(data, id) : []), [data, id]);
  const log = useMemo(() => (data ? statLog(data) : null), [data]);
  const history = useMemo(() => (log && id ? exerciseHistory(log.sessions, log.sets, id) : []), [log, id]);
  const maxes = useMemo(() => (log && id ? repMaxes(log.sessions, log.sets, id) : []), [log, id]);
  const timeline = useMemo(() => (log && id ? liftRecords(log.sessions, log.sets).filter((row) => row.exerciseId === id).reverse() : []), [log, id]);
  const [showAll, setShowAll] = useState(false);
  const reference = useMemo(() => live(data?.references ?? []).find((row) => row.exercise_id === id) ?? null, [data, id]);
  const [maxText, setMaxText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  if (!data || !id || !db) return <Screen edges={["bottom"]}>{null}</Screen>;
  const name = exerciseName(data, id);
  const best = points.reduce<number | null>((top, row) => (row.bestE1rmKg != null && (top == null || row.bestE1rmKg > top) ? row.bestE1rmKg : top), null);
  const first = points.find((row) => row.bestE1rmKg != null)?.bestE1rmKg ?? null;
  const latest = [...points].reverse().find((row) => row.bestE1rmKg != null)?.bestE1rmKg ?? null;

  async function saveMax() {
    if (!db || !id) return;
    const value = parseAmount(maxText);
    if (value == null || value <= 0) return setMessage("Enter a weight above zero.");
    await saveRow(db, "exercise_references", {
      ...(reference ?? { id: newId(), exercise_id: id }),
      weight: value,
      unit,
      weight_kg: toKilograms(value, unit),
      noted_on: new Date().toISOString().slice(0, 10),
    });
    setMaxText("");
    setMessage("Training max saved. Percent targets use it from your next session.");
  }

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: name }} />
      <T variant="title">{name}</T>
      {points.length === 0 ? <T variant="muted">Finish a working set of this lift to see its chart.</T> : null}
      {points.length ? (
        <>
          <Card>
            <Row gap={space.lg}>
              <Stat value={weight(best, unit, 0)} label="Best estimated max" accent={theme.highlight} />
              <Stat value={first != null && latest != null ? `${latest >= first ? "+" : ""}${trim(fromKilograms(latest - first, unit), 1)}` : "0"} label={`Change since first (${unit})`} />
              <Stat value={String(points.length)} label="Sessions" />
            </Row>
          </Card>
          <Card>
            <T variant="heading">Estimated 1 rep max</T>
            <T variant="small">From your best working set each session, using the Epley formula.</T>
            <LineChart
              accessibilityLabel={`Estimated max over ${points.length} sessions, best ${weight(best, unit)}`}
              data={points.map((row) => ({ label: shortDate(row.startedAt), value: row.bestE1rmKg == null ? null : fromKilograms(row.bestE1rmKg, unit) }))}
            />
          </Card>
          <Card>
            <T variant="heading">Volume per session</T>
            <BarChart
              accessibilityLabel={`Volume per session, latest ${volume(points[points.length - 1].volumeKg, unit)}`}
              data={points.slice(-12).map((row) => ({ label: shortDate(row.startedAt), value: fromKilograms(row.volumeKg, unit) }))}
            />
          </Card>
          <Card>
            <T variant="heading">Rep maxes</T>
            <T variant="small">Heaviest weight you have done for at least that many reps.</T>
            {maxes.map((row) => (
              <Row key={row.reps} style={{ justifyContent: "space-between", minHeight: 40 }}>
                <T variant="label" style={{ width: 64 }}>
                  {row.reps} rep{row.reps === 1 ? "" : "s"}
                </T>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <T variant="number" style={{ fontSize: 20 }}>
                    {row.weightKg != null ? weight(row.weightKg, unit) : "\u2013"}
                  </T>
                  {row.weightKg != null && row.achievedAt ? (
                    <T variant="small">
                      {row.actualReps !== row.reps ? `${row.actualReps} reps, ` : ""}
                      {shortDate(row.achievedAt)}
                    </T>
                  ) : null}
                </View>
              </Row>
            ))}
          </Card>
          <Card>
            <T variant="heading">Top sets</T>
            <T variant="small">Best set each session: highest estimated max, sets of {E1RM_MAX_REPS} reps or fewer first.</T>
            {history.slice(0, 8).map((row) => (
              <Row key={row.sessionId} style={{ justifyContent: "space-between", minHeight: 36 }}>
                <T variant="muted">{shortDate(row.startedAt)}</T>
                <Row gap={6}>
                  {row.records.length ? <T variant="small" style={{ color: theme.highlight }}>PR</T> : null}
                  <T>
                    {weight(row.best.weightKg, unit)} × {row.best.reps}
                  </T>
                </Row>
              </Row>
            ))}
          </Card>
          <Card>
            <T variant="heading">Personal records</T>
            {timeline.length === 0 ? (
              <T variant="muted">Your first session is the baseline. Beat it on weight, reps or estimated max and it shows up here.</T>
            ) : (
              (showAll ? timeline : timeline.slice(0, 8)).map((record) => (
                <View key={`${record.sessionId}-${record.type}`} style={{ gap: 2, paddingVertical: 4 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <RecordBadge type={record.type} />
                    <T variant="small">{shortDate(record.achievedAt)}</T>
                  </Row>
                  <T>
                    {weight(record.weightKg, unit)} × {record.reps}
                    {record.type === "e1rm" ? `, estimated ${weight(record.e1rmKg, unit)}` : ""}
                  </T>
                  <T variant="small">
                    {record.type === "reps"
                      ? `Beat ${record.previous} reps at this weight or heavier.`
                      : `${RECORD_LABELS[record.type]} was ${weight(record.previous, unit)}.`}
                  </T>
                </View>
              ))
            )}
            {timeline.length > 8 ? <Button label={showAll ? "Show fewer" : `Show all ${timeline.length}`} kind="ghost" compact onPress={() => setShowAll(!showAll)} /> : null}
          </Card>
          <Card>
            <T variant="heading">Recent sessions</T>
            {history.slice(0, 10).map((row) => (
              <Pressable
                key={row.sessionId}
                accessibilityRole="button"
                accessibilityHint="Opens this session"
                onPress={() => router.push({ pathname: "/history/[id]", params: { id: row.sessionId } })}
                style={({ pressed }) => ({ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.line, opacity: pressed ? 0.6 : 1 })}
              >
                <Row style={{ justifyContent: "space-between" }}>
                  <T variant="label" style={{ flex: 1 }} numberOfLines={1}>
                    {shortDate(row.startedAt)}
                    {row.name ? `  ${row.name}` : ""}
                  </T>
                  <T variant="small">{volume(row.volumeKg, unit)}</T>
                </Row>
                <T>{row.sets.map((set) => `${trim(fromKilograms(set.weightKg, unit), 1)} × ${set.reps}`).join(",  ")}</T>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
      <Card>
        <T variant="heading">Training max</T>
        <T variant="muted">
          {reference ? `Set to ${trim(Number(reference.weight), 2)} ${reference.unit} on ${reference.noted_on}.` : "Not set. Percent targets use your best estimate instead."}
        </T>
        <View style={{ gap: space.sm }}>
          <Field label={`New training max (${unit})`} value={maxText} onChangeText={setMaxText} keyboardType="decimal-pad" />
          {message ? <T variant="small" style={{ color: theme.muted }}>{message}</T> : null}
          <Row>
            <Button label="Save training max" onPress={() => void saveMax()} style={{ flex: 1 }} />
            {reference ? <Button label="Clear" kind="ghost" onPress={() => void deleteRow(db, "exercise_references", reference.id)} /> : null}
          </Row>
        </View>
      </Card>
    </Screen>
  );
}
