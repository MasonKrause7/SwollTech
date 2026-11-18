import {
  ALL_LIFTS,
  CHART_TYPES,
  MEASURES,
  PERIODS,
  RANGES,
  analyticsLabel,
  buildAnalytics,
  defaultLift,
  fromKilograms,
  liftChoices,
  spansYears,
  summaryIsSettled,
  type AnalyticsChartType,
  type AnalyticsMeasure,
  type AnalyticsPeriod,
  type AnalyticsRange,
  type StatSession,
  type StatSet,
} from "@swolltech/metrics";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { trim } from "../format";
import type { Unit } from "../logic/rows";
import { radius, space, useTheme } from "../theme";
import { AnalyticsChart } from "./charts";
import { Card, Chip, Row, Sheet, T } from "./ui";

function ChipRow<K extends string>({ label, value, options, onChange, disabled }: { label: string; value: K; options: { id: K; label: string }[]; onChange: (next: K) => void; disabled?: (id: K) => boolean }) {
  return (
    <View style={{ gap: 6 }} accessibilityLabel={label}>
      <T variant="small">{label}</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {options.map((option) => (
          <Chip key={option.id} small label={option.label} selected={value === option.id} disabled={disabled?.(option.id)} onPress={() => onChange(option.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Custom charts on the Progress tab: pick a lift, what to measure, how to group it and how to draw it. */
export function AnalyzeCard({ sessions, sets, unit, timeZone }: { sessions: StatSession[]; sets: StatSet[]; unit: Unit; timeZone: string }) {
  const theme = useTheme();
  const lifts = useMemo(() => liftChoices(sets), [sets]);
  const [picked, setPicked] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [measure, setMeasure] = useState<AnalyticsMeasure>("e1rm");
  const [period, setPeriod] = useState<AnalyticsPeriod>("week");
  const [range, setRange] = useState<AnalyticsRange>("1y");
  const [chart, setChart] = useState<AnalyticsChartType>("line");
  const [trend, setTrend] = useState(true);

  const fallback = useMemo(() => defaultLift(sets), [sets]);
  const exerciseId = picked ?? fallback;
  const result = useMemo(() => buildAnalytics(sessions, sets, { exerciseId, measure, period, range }, new Date(), timeZone), [sessions, sets, exerciseId, measure, period, range, timeZone]);
  const info = result.measure;
  const isWeight = info.kind === "weight";
  const show = (value: number | null) => (value == null ? null : isWeight ? Number(fromKilograms(value, unit).toFixed(1)) : value);
  const format = (value: number) => (isWeight ? `${trim(value, 0)} ${unit}` : trim(value, 1));
  const multiYear = spansYears(result.points);
  const points = result.points.map((point) => ({ label: analyticsLabel(point.day, period, multiYear), value: show(point.value), trend: show(point.trend) }));
  const liftName = lifts.find((lift) => lift.exerciseId === exerciseId)?.exerciseName ?? "Lift";
  const summary = result.summary;
  const per = period;
  const settled = summaryIsSettled(period);
  const change = summary.changePercent;

  return (
    <Card testID="analyze">
      <T variant="heading">Analyze</T>
      <T variant="small">{info.description}</T>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Lift: ${liftName}. Change lift`}
        onPress={() => setChoosing(true)}
        style={{ minHeight: 48, borderWidth: 1.5, borderColor: theme.line, borderRadius: radius.md, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <T>{liftName}</T>
        <T variant="small">Change</T>
      </Pressable>

      <ChipRow label="Measure" value={info.id} options={MEASURES} onChange={setMeasure} disabled={(id) => exerciseId === ALL_LIFTS && Boolean(MEASURES.find((m) => m.id === id)?.needsLift)} />
      <ChipRow label="Group by" value={period} options={PERIODS} onChange={setPeriod} />
      <ChipRow label="Range" value={range} options={RANGES} onChange={setRange} />
      <View style={{ gap: 6 }}>
        <T variant="small">Chart</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {CHART_TYPES.map((option) => (
            <Chip key={option.id} small label={option.label} selected={chart === option.id} onPress={() => setChart(option.id)} />
          ))}
          <Chip small label="4-point average" selected={trend} onPress={() => setTrend((value) => !value)} />
        </ScrollView>
      </View>

      {summary.points === 0 ? (
        <T variant="small">No {liftName === "All lifts" ? "" : `${liftName} `}sets in this range. Try a longer range.</T>
      ) : (
        <>
          <AnalyticsChart
            data={points}
            type={chart}
            showTrend={trend}
            zeroBased={info.rollup === "sum"}
            format={format}
            accessibilityLabel={`${info.label} of ${liftName} by ${per}. Latest ${format(show(summary.latest)!)}`}
          />
          <Row gap={space.md} style={{ flexWrap: "wrap" }}>
            {[
              [format(show(summary.total)!), info.rollup === "sum" ? "Total" : "Best"],
              [format(show(summary.average)!), settled ? `Average per full ${per}` : `Average per ${per}`],
              [format(show(summary.latest)!), settled ? `Last full ${per}` : `Latest ${per}`],
              [change == null ? "None" : `${change >= 0 ? "+" : ""}${trim(change, 0)}%`, "First to latest"],
            ].map(([value, label], index) => (
              <View key={label} style={{ width: "46%", gap: 2 }}>
                <T variant="number" style={{ fontSize: 20, color: index === 3 && change != null && change > 0 ? theme.ok : theme.text }}>
                  {value}
                </T>
                <T variant="small">{label}</T>
              </View>
            ))}
          </Row>
        </>
      )}

      <Sheet visible={choosing} onClose={() => setChoosing(false)} title="Pick a lift">
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm }}>
          {lifts.map((lift) => (
            <Pressable
              key={lift.exerciseId}
              accessibilityRole="button"
              accessibilityState={{ selected: lift.exerciseId === exerciseId }}
              onPress={() => {
                setPicked(lift.exerciseId);
                setChoosing(false);
              }}
              style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: theme.line }}
            >
              <T style={{ color: lift.exerciseId === exerciseId ? theme.highlight : theme.text }}>{lift.exerciseName}</T>
              <T variant="small">{lift.sessions} sessions</T>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </Card>
  );
}
