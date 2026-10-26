import { addDays, weekStart } from "@swolltech/metrics";
import type { CalendarDay } from "@swolltech/api-client";
import { formatShortDate } from "../format";

/** Sixteen weeks of training days, Monday at the top, like a wall calendar of check marks. */
export function Heatmap({ days, today, weeks = 16 }: { days: CalendarDay[]; today: string; weeks?: number }) {
  const counts = new Map(days.map((item) => [item.day, item.sessions]));
  const start = addDays(weekStart(today), -7 * (weeks - 1));
  const cells = Array.from({ length: weeks * 7 }, (_, index) => addDays(start, index));
  const active = days.length;
  return (
    <div className="stack">
      <div className="heatmap" role="img" aria-label={`${active} training days in the last ${weeks} weeks`}>
        {cells.map((day) => {
          const count = day > today ? 0 : counts.get(day) ?? 0;
          return (
            <span
              key={day}
              data-level={count === 0 ? 0 : count === 1 ? 1 : 2}
              data-today={day === today}
              title={`${formatShortDate(day)}: ${count === 0 ? "rest" : `${count} session${count > 1 ? "s" : ""}`}`}
              style={day > today ? { visibility: "hidden" } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
