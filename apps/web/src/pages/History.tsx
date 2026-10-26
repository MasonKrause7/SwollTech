import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { weekStart, localDay } from "@swolltech/metrics";
import { useApi } from "../auth";
import { LoadError, Loading } from "../components/Feedback";
import { formatDay, formatShortDate, timeZone } from "../format";
import { keys } from "../hooks";

export function HistoryPage() {
  const api = useApi();
  const sessions = useQuery({ queryKey: keys.sessions(), queryFn: () => api.sessions() });
  if (sessions.isPending) return <Loading />;
  if (sessions.error) return <LoadError error={sessions.error} retry={() => sessions.refetch()} />;

  const zone = timeZone();
  const groups = new Map<string, typeof sessions.data>();
  for (const session of sessions.data) {
    const week = weekStart(localDay(session.started_at, zone));
    groups.set(week, [...(groups.get(week) ?? []), session]);
  }
  const thisWeek = weekStart(localDay(new Date(), zone));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>History</h1>
          <p className="lede">Every session you have logged, newest first.</p>
        </div>
      </header>
      {sessions.data.length === 0 && (
        <div className="empty">
          <p>Finished workouts show up here. Start one from Today.</p>
          <Link className="btn primary" to="/">
            Go to Today
          </Link>
        </div>
      )}
      {[...groups.entries()].map(([week, items]) => (
        <section key={week} className="section" aria-label={`Week of ${week}`}>
          <h2>{week === thisWeek ? "This week" : `Week of ${formatShortDate(week)}`}</h2>
          <div className="list">
            {items!.map((session) => (
              <Link
                key={session.id}
                to={session.status === "completed" ? `/sessions/${session.id}/summary` : `/sessions/${session.id}`}
                className="list-row"
              >
                <div>
                  <div className="title">{session.name}</div>
                  <div className="small muted">{formatDay(session.started_at)}</div>
                </div>
                {session.status === "in_progress" ? <span className="tag record">In progress</span> : <span className="small muted">View</span>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
