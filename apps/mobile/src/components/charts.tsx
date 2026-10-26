import { addDays, weekStart } from "@swolltech/metrics";
import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { fonts, plate, radius, space, useTheme } from "../theme";
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
export function BarChart({ data, height = 160, color = plate.blue, format = compact, accessibilityLabel }: { data: BarDatum[]; height?: number; color?: string; format?: (value: number) => string; accessibilityLabel: string }) {
  const theme = useTheme();
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
            <Rect key={`b${index}`} x={x} y={8 + plot - h} width={barWidth} height={Math.max(h, item.value > 0 ? 2 : 0)} rx={3} fill={last ? theme.accent : color} opacity={last ? 1 : 0.85} />,
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
export function LineChart({ data, height = 180, color = plate.yellow, format = compact, accessibilityLabel }: { data: LinePoint[]; height?: number; color?: string; format?: (value: number) => string; accessibilityLabel: string }) {
  const theme = useTheme();
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
                fill={count > 0 ? plate.green : theme.track}
                opacity={count > 1 ? 1 : count === 1 ? 0.85 : 1}
              />
            );
          }),
        )}
      </Svg>
    </View>
  );
}

/** Horizontal bars for sets per muscle group. */
export function SplitBars({ rows, colors }: { rows: { label: string; value: number; detail: string }[]; colors: string[] }) {
  const theme = useTheme();
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
            <View style={{ width: `${(row.value / top) * 100}%`, height: "100%", borderRadius: radius.pill, backgroundColor: colors[index % colors.length] }} />
          </View>
        </View>
      ))}
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
      <View style={{ width: `${Math.min(1, Math.max(0, fraction)) * 100}%`, height: "100%", backgroundColor: theme.accent }} />
    </View>
  );
}
