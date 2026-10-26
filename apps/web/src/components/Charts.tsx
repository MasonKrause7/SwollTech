import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
