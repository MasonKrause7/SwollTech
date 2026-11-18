import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { stroke: "var(--muted)", fontSize: 12, tickLine: false, axisLine: false } as const;
function compact(value: number) {
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(value));
}

const tooltipStyle = {
  contentStyle: { background: "var(--raised)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--text)" },
  labelStyle: { color: "var(--muted)" },
  cursor: { fill: "var(--sunk)" },
};

interface SeriesProps<T> {
  data: T[];
  x: string;
  y: string;
  color: string;
  name: string;
  format?: (value: number) => string;
  label: string;
}

export function BarSeries<T extends object>({ data, x, y, color, name, format, label }: SeriesProps<T>) {
  return (
    <div className="chart-box" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={x} {...axis} interval="preserveStartEnd" minTickGap={12} />
          <YAxis {...axis} width={52} tickFormatter={compact} allowDecimals={false} />
          <Tooltip {...tooltipStyle} formatter={(value) => [format ? format(Number(value)) : String(value), name]} />
          <Bar dataKey={y} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineSeries<T extends object>({ data, x, y, color, name, format, label }: SeriesProps<T>) {
  return (
    <div className="chart-box" role="img" aria-label={label}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={x} {...axis} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axis} width={52} domain={["dataMin - 5", "dataMax + 5"]} tickFormatter={compact} allowDecimals={false} />
          <Tooltip {...tooltipStyle} formatter={(value) => [format ? format(Number(value)) : String(value), name]} />
          <Line type="linear" dataKey={y} name={name} stroke={color} strokeWidth={3} dot={{ r: 4, fill: color }} activeDot={{ r: 6 }} isAnimationActive={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface AnalyticsDatum {
  label: string;
  value: number | null;
  trend: number | null;
}

/**
 * The Analyze chart: one measure as a line, bars or a filled area, with an optional
 * dashed moving-average trend on the same axis. Busy series drop their dots.
 */
export function AnalyticsChart({
  data,
  type,
  showTrend,
  color,
  name,
  format,
  label,
  zeroBased,
}: {
  data: AnalyticsDatum[];
  type: "line" | "bar" | "area";
  showTrend: boolean;
  color: string;
  name: string;
  format: (value: number) => string;
  label: string;
  zeroBased: boolean;
}) {
  const dense = data.length > 40;
  const dot = dense ? false : { r: 4, fill: color, stroke: "var(--raised)", strokeWidth: 2 };
  return (
    <div className="chart-box tall" role="img" aria-label={label}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axis} width={52} domain={zeroBased ? [0, "auto"] : ["auto", "auto"]} tickFormatter={compact} allowDecimals={false} />
          <Tooltip
            {...tooltipStyle}
            cursor={type === "bar" ? { fill: "var(--sunk)" } : { stroke: "var(--line-strong)" }}
            formatter={(value, _name, item) => [value == null ? "Nothing logged" : format(Number(value)), item?.dataKey === "trend" ? "4-point average" : name]}
          />
          {showTrend && <Legend verticalAlign="top" align="right" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />}
          {type === "bar" && <Bar dataKey="value" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />}
          {type === "area" && (
            <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.18} dot={dot} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls />
          )}
          {type === "line" && <Line type="linear" dataKey="value" name={name} stroke={color} strokeWidth={2.5} dot={dot} activeDot={{ r: 6 }} isAnimationActive={false} connectNulls />}
          {showTrend && (
            <Line type="monotone" dataKey="trend" name="4-point average" stroke="var(--text)" strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
