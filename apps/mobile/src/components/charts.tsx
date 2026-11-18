import { addDays, RECORD_LABELS, weekStart, type RecordType } from "@swolltech/metrics";
import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { fonts, radius, space, useTheme } from "../theme";
import { T } from "./ui";

function useWidth(initial = 320) {
  const [width, setWidth] = useState(initial);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };
  return { width, onLayout };
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value) ?? 10;
  return step * power;
}

function compact(value: number) {
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

export interface BarDatum {
  label: string;
  value: number;
}

/** Vertical bars, oldest to newest. The newest bar is highlighted. */
export function BarChart({ data, height = 160, color: colorProp, format = compact, accessibilityLabel }: { data: BarDatum[]; height?: number; color?: string; format?: (value: number) => string; accessibilityLabel: string }) {
  const theme = useTheme();
  const color = colorProp ?? theme.muted;
  const { width, onLayout } = useWidth();
  const top = niceMax(Math.max(0, ...data.map((item) => item.value)));
  const axis = 34;
  const bottom = 20;
  const plot = height - bottom - 8;
  const slot = (width - axis) / Math.max(1, data.length);
  const barWidth = Math.max(4, Math.min(28, slot * 0.62));
  return (
    <View onLayout={onLayout} accessible accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((fraction) => {
          const y = 8 + plot * (1 - fraction);
          return [
            <Line key={`g${fraction}`} x1={axis} x2={width} y1={y} y2={y} stroke={theme.line} strokeWidth={1} />,
            <SvgText key={`l${fraction}`} x={axis - 6} y={y + 4} fontSize={11} fill={theme.muted} textAnchor="end" fontFamily={fonts.displaySemi}>
              {format(top * fraction)}
            </SvgText>,
          ];
        })}
        {data.map((item, index) => {
          const h = top ? (item.value / top) * plot : 0;
          const x = axis + slot * index + (slot - barWidth) / 2;
          const last = index === data.length - 1;
          const showLabel = data.length <= 8 || index % 3 === (data.length - 1) % 3;
          return [
            <Rect key={`b${index}`} x={x} y={8 + plot - h} width={barWidth} height={Math.max(h, item.value > 0 ? 2 : 0)} rx={3} fill={last ? theme.highlight : color} opacity={last ? 1 : 0.85} />,
            showLabel ? (
              <SvgText key={`x${index}`} x={x + barWidth / 2} y={height - 4} fontSize={10} fill={theme.muted} textAnchor="middle" fontFamily={fonts.displaySemi}>
                {item.label}
              </SvgText>
            ) : null,
          ];
        })}
      </Svg>
    </View>
  );
}

export interface LinePoint {
  label: string;
  value: number | null;
}

/** A trend line with dots. Gaps in the data are skipped, not drawn as zero. */
export function LineChart({ data, height = 180, color: colorProp, format = compact, accessibilityLabel }: { data: LinePoint[]; height?: number; color?: string; format?: (value: number) => string; accessibilityLabel: string }) {
  const theme = useTheme();
  const color = colorProp ?? theme.highlight;
  const { width, onLayout } = useWidth();
  const values = data.map((item) => item.value).filter((value): value is number => value != null);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || max * 0.1 || 1;
  const low = Math.max(0, min - pad);
  const high = max + pad;
  const axis = 38;
  const bottom = 20;
  const plot = height - bottom - 10;
  const xFor = (index: number) => axis + 8 + ((width - axis - 16) * index) / Math.max(1, data.length - 1);
  const yFor = (value: number) => 10 + plot * (1 - (value - low) / (high - low));
  let path = "";
  data.forEach((item, index) => {
    if (item.value == null) return;
    path += `${path ? "L" : "M"}${xFor(index).toFixed(1)},${yFor(item.value).toFixed(1)} `;
  });
  const best = Math.max(...values);
  return (
    <View onLayout={onLayout} accessible accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        {[low, (low + high) / 2, high].map((value, index) => (
          <SvgText key={`a${index}`} x={axis - 4} y={yFor(value) + 4} fontSize={11} fill={theme.muted} textAnchor="end" fontFamily={fonts.displaySemi}>
            {format(value)}
          </SvgText>
        ))}
        <Line x1={axis} x2={width} y1={10 + plot} y2={10 + plot} stroke={theme.line} />
        <Path d={path} stroke={color} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((item, index) =>
          item.value == null ? null : (
            <Circle
              key={`d${index}`}
              cx={xFor(index)}
              cy={yFor(item.value)}
              r={item.value === best ? 6 : 4}
              fill={item.value === best ? color : theme.bg}
              stroke={color}
              strokeWidth={2}
            />
          ),
        )}
        {[0, data.length - 1].filter((value, index, list) => list.indexOf(value) === index).map((index) => (
          <SvgText key={`x${index}`} x={xFor(index)} y={height - 4} fontSize={10} fill={theme.muted} textAnchor={index === 0 ? "start" : "end"} fontFamily={fonts.displaySemi}>
            {data[index]?.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

/** Training days over the last 16 weeks. Columns are weeks, rows are Monday to Sunday. */
export function Heatmap({ days, today, weeks = 16 }: { days: { day: string; sessions: number }[]; today: string; weeks?: number }) {
  const theme = useTheme();
  const { width, onLayout } = useWidth();
  const counts = new Map(days.map((item) => [item.day, item.sessions]));
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const gap = 3;
  const cell = Math.max(8, Math.min(18, (width - gap * (weeks - 1)) / weeks));
  const height = cell * 7 + gap * 6;
  const trained = days.filter((item) => item.day >= first).length;
  return (
    <View onLayout={onLayout} accessible accessibilityLabel={`Trained on ${trained} days in the last ${weeks} weeks`}>
      <Svg width={width} height={height}>
        {Array.from({ length: weeks }).flatMap((_, column) =>
          Array.from({ length: 7 }).map((__, row) => {
            const day = addDays(first, column * 7 + row);
            if (day > today) return null;
            const count = counts.get(day) ?? 0;
            return (
              <Rect
                key={day}
                x={column * (cell + gap)}
                y={row * (cell + gap)}
                width={cell}
                height={cell}
                rx={3}
                fill={count > 0 ? theme.highlight : theme.track}
                opacity={count > 1 ? 1 : count === 1 ? 0.85 : 1}
              />
            );
          }),
        )}
      </Svg>
    </View>
  );
}

/**
 * One stable colour per muscle so chest is the same colour every week. Each palette is checked
 * for at least 3:1 contrast against its card and the bar track, so no bar disappears (the old
 * shared palette drew chest near-white on the light theme).
 */
const MUSCLE_COLORS: Record<"light" | "dark", Record<string, string>> = {
  light: {
    chest: "#E4480E",
    back: "#2F5F8A",
    shoulders: "#8A6A2F",
    quads: "#3F7A5C",
    hamstrings: "#7A4E8A",
    glutes: "#B0436A",
    biceps: "#1F7A80",
    triceps: "#4A4D52",
    calves: "#8A5A3C",
    core: "#0F1011",
    other: "#6E7176",
  },
  dark: {
    chest: "#FF5A1F",
    back: "#7F9FBF",
    shoulders: "#C9B08A",
    quads: "#7FBF9A",
    hamstrings: "#B39BC8",
    glutes: "#E08AA8",
    biceps: "#6FC2C8",
    triceps: "#B5B8BD",
    calves: "#C79A7A",
    core: "#F4F4F2",
    other: "#8E9196",
  },
};

export function muscleColor(muscle: string, mode: "light" | "dark") {
  const palette = MUSCLE_COLORS[mode];
  const key = muscle.trim().toLowerCase();
  if (palette[key]) return palette[key];
  // A custom muscle word: pick a stable colour from the palette.
  const values = Object.values(palette);
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return values[hash % values.length];
}

/** Horizontal bars for sets per muscle group. Bars are coloured by muscle unless colours are given. */
export function SplitBars({ rows, colors }: { rows: { label: string; value: number; detail: string }[]; colors?: string[] }) {
  const theme = useTheme();
  const mode = theme.bg === "#0F1011" ? "dark" : "light";
  const top = Math.max(1, ...rows.map((row) => row.value));
  return (
    <View style={{ gap: space.sm }}>
      {rows.map((row, index) => (
        <View key={row.label} style={{ gap: 4 }} accessible accessibilityLabel={`${row.label}: ${row.detail}`}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <T style={{ textTransform: "capitalize" }}>{row.label}</T>
            <T variant="small">{row.detail}</T>
          </View>
          <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: theme.track, overflow: "hidden" }}>
            <View
              style={{
                width: `${(row.value / top) * 100}%`,
                height: "100%",
                borderRadius: radius.pill,
                backgroundColor: colors ? colors[index % colors.length] : muscleColor(row.label, mode),
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A small pill naming a record type: "Estimated max", "Heaviest weight", "Rep record". */
export function RecordBadge({ type }: { type: RecordType }) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.highlight, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, color: theme.highlightInk }}>{RECORD_LABELS[type]}</Text>
    </View>
  );
}

/** Thin progress bar for the workout. */
export function ProgressBar({ fraction }: { fraction: number }) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={{ height: 6, borderRadius: radius.pill, backgroundColor: theme.track, overflow: "hidden" }}
    >
      <View style={{ width: `${Math.min(1, Math.max(0, fraction)) * 100}%`, height: "100%", backgroundColor: theme.highlight }} />
    </View>
  );
}

export interface AnalyticsDatum {
  label: string;
  value: number | null;
  trend: number | null;
}

/**
 * The Analyze chart: one measure as a line, bars or a filled area, with an optional dashed
 * moving-average trend. Touch and drag across it to read a point, like hovering on the web.
 */
export function AnalyticsChart({
  data,
  type,
  showTrend,
  zeroBased,
  format = compact,
  accessibilityLabel,
  height = 200,
}: {
  data: AnalyticsDatum[];
  type: "line" | "bar" | "area";
  showTrend: boolean;
  zeroBased: boolean;
  format?: (value: number) => string;
  accessibilityLabel: string;
  height?: number;
}) {
  const theme = useTheme();
  const color = theme.highlight;
  const { width, onLayout } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const values = data.flatMap((item) => [item.value, showTrend ? item.trend : null]).filter((value): value is number => value != null);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || max * 0.1 || 1;
  const low = zeroBased || type === "bar" ? 0 : Math.max(0, min - pad);
  const high = zeroBased || type === "bar" ? niceMax(max) : max + pad;
  const axis = 40;
  const bottom = 20;
  const top = 8;
  const plot = height - bottom - top;
  const inner = width - axis - 8;
  const slot = inner / Math.max(1, data.length);
  const xFor = (index: number) => (type === "bar" ? axis + slot * index + slot / 2 : axis + 4 + ((inner - 8) * index) / Math.max(1, data.length - 1));
  const yFor = (value: number) => top + plot * (1 - (value - low) / (high - low || 1));
  const dense = data.length > 30;

  const pathFor = (pick: (item: AnalyticsDatum) => number | null) => {
    let path = "";
    data.forEach((item, index) => {
      const value = pick(item);
      if (value == null) return;
      path += `${path ? "L" : "M"}${xFor(index).toFixed(1)},${yFor(value).toFixed(1)} `;
    });
    return path;
  };
  const line = pathFor((item) => item.value);
  const present = data.map((item, index) => (item.value == null ? null : index)).filter((index): index is number => index != null);
  const area = present.length
    ? `${line}L${xFor(present[present.length - 1]).toFixed(1)},${yFor(low).toFixed(1)} L${xFor(present[0]).toFixed(1)},${yFor(low).toFixed(1)} Z`
    : "";
  const barWidth = Math.max(2, Math.min(24, slot * 0.7));

  const pick = (x: number) => {
    const index = type === "bar" ? Math.floor((x - axis) / slot) : Math.round(((x - axis - 4) / Math.max(1, inner - 8)) * (data.length - 1));
    setActive(Math.min(data.length - 1, Math.max(0, index)));
  };
  const shown = active != null ? data[active] : null;
  const labels = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((value, index, list) => list.indexOf(value) === index);

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ minHeight: 20 }}>
        {shown ? (
          <T variant="small">
            {shown.label}: {shown.value == null ? "Nothing logged" : format(shown.value)}
            {showTrend && shown.trend != null ? `, average ${format(shown.trend)}` : ""}
          </T>
        ) : (
          <T variant="small">Touch the chart to read a point.</T>
        )}
      </View>
      <View
        onLayout={onLayout}
        accessible
        accessibilityLabel={accessibilityLabel}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => pick(event.nativeEvent.locationX)}
        onResponderMove={(event) => pick(event.nativeEvent.locationX)}
        onResponderTerminationRequest={() => false}
      >
        <Svg width={width} height={height}>
          {[0, 0.5, 1].map((fraction) => {
            const value = low + (high - low) * fraction;
            const y = yFor(value);
            return [
              <Line key={`g${fraction}`} x1={axis} x2={width} y1={y} y2={y} stroke={theme.line} strokeWidth={1} />,
              <SvgText key={`l${fraction}`} x={axis - 6} y={y + 4} fontSize={11} fill={theme.muted} textAnchor="end" fontFamily={fonts.displaySemi}>
                {compact(value)}
              </SvgText>,
            ];
          })}
          {type === "bar" &&
            data.map((item, index) => {
              if (item.value == null) return null;
              const h = Math.max(item.value > 0 ? 2 : 0, yFor(low) - yFor(item.value));
              return <Rect key={`b${index}`} x={xFor(index) - barWidth / 2} y={yFor(low) - h} width={barWidth} height={h} rx={Math.min(3, barWidth / 2)} fill={color} opacity={active == null || active === index ? 1 : 0.55} />;
            })}
          {type === "area" && area ? <Path d={area} fill={color} opacity={0.18} /> : null}
          {type !== "bar" ? <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {type !== "bar" && !dense
            ? data.map((item, index) =>
                item.value == null ? null : <Circle key={`d${index}`} cx={xFor(index)} cy={yFor(item.value)} r={4} fill={color} stroke={theme.raised} strokeWidth={2} />,
              )
            : null}
          {showTrend ? <Path d={pathFor((item) => item.trend)} stroke={theme.text} strokeWidth={2} strokeDasharray="6 4" fill="none" strokeLinejoin="round" /> : null}
          {active != null ? <Line x1={xFor(active)} x2={xFor(active)} y1={top} y2={top + plot} stroke={theme.muted} strokeWidth={1} /> : null}
          {active != null && shown?.value != null && type !== "bar" ? <Circle cx={xFor(active)} cy={yFor(shown.value)} r={6} fill={color} stroke={theme.raised} strokeWidth={2} /> : null}
          {labels.map((index) => (
            <SvgText key={`x${index}`} x={xFor(index)} y={height - 4} fontSize={10} fill={theme.muted} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} fontFamily={fonts.displaySemi}>
              {data[index]?.label}
            </SvgText>
          ))}
        </Svg>
      </View>
    </View>
  );
}
