"""Training statistics used for the progress dashboard and the post-workout summary.

Everything here is pure: it takes plain rows and returns plain dicts so the same
rules can be mirrored in packages/metrics for the phone and checked against
packages/metrics/fixtures/stats-golden.json.

Rules:
- Only completed sessions count.
- A set counts when it is a working set, not skipped, completed, has reps >= 1
  and a weight. Warmups never count toward volume, estimates, or records.
- Weeks start on Monday in the caller's time zone.
- A personal record is a session whose best estimated 1RM for an exercise beats
  every earlier session for that exercise. The first session of an exercise is
  a baseline, not a record.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from swolltech.metrics import epley, round6

WEEKS = 12
CALENDAR_DAYS = 112
SPLIT_DAYS = 28
RECORD_LIMIT = 10
EPSILON = 1e-9


@dataclass
class LoggedSession:
    id: UUID
    started_at: datetime
    ended_at: datetime | None = None
    name: str = ""


@dataclass
class LoggedSet:
    session_id: UUID
    exercise_id: UUID
    exercise_name: str
    muscle: str
    weight_kg: float
    reps: int


@dataclass
class _ExerciseBest:
    e1rm: float
    weight_kg: float
    reps: int


@dataclass
class _Bucket:
    sets: int = 0
    volume: Decimal = field(default_factory=lambda: Decimal("0"))


def local_day(moment: datetime, tz: ZoneInfo) -> date:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(tz).date()


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _session_bests(sets: list[LoggedSet]) -> dict[UUID, dict[UUID, _ExerciseBest]]:
    bests: dict[UUID, dict[UUID, _ExerciseBest]] = {}
    for item in sets:
        estimate = epley(item.weight_kg, item.reps)
        if estimate is None:
            continue
        per_session = bests.setdefault(item.session_id, {})
        current = per_session.get(item.exercise_id)
        if current is None or estimate > current.e1rm + EPSILON:
            per_session[item.exercise_id] = _ExerciseBest(estimate, item.weight_kg, item.reps)
    return bests


def personal_records(sessions: list[LoggedSession], sets: list[LoggedSet]) -> list[dict]:
    """Every record in chronological order."""
    names = {item.exercise_id: item.exercise_name for item in sets}
    bests = _session_bests(sets)
    ordered = sorted(sessions, key=lambda item: (item.started_at, str(item.id)))
    running: dict[UUID, float] = {}
    records: list[dict] = []
    for session in ordered:
        for exercise_id, best in sorted(bests.get(session.id, {}).items(), key=lambda pair: names[pair[0]]):
            previous = running.get(exercise_id)
            if previous is not None and best.e1rm > previous + EPSILON:
                records.append(
                    {
                        "exercise_id": exercise_id,
                        "exercise_name": names[exercise_id],
                        "session_id": session.id,
                        "achieved_at": session.started_at,
                        "e1rm_kg": best.e1rm,
                        "previous_e1rm_kg": previous,
                        "weight_kg": best.weight_kg,
                        "reps": best.reps,
                    }
                )
            if previous is None or best.e1rm > previous:
                running[exercise_id] = best.e1rm
    return records


def _streaks(weeks_with_sessions: set[date], current_week: date) -> tuple[int, int]:
    if not weeks_with_sessions:
        return 0, 0
    longest = 0
    run = 0
    previous: date | None = None
    for week in sorted(weeks_with_sessions):
        if previous is not None and week - previous == timedelta(weeks=1):
            run += 1
        else:
            run = 1
        longest = max(longest, run)
        previous = week
    anchor = current_week if current_week in weeks_with_sessions else current_week - timedelta(weeks=1)
    current = 0
    while anchor in weeks_with_sessions:
        current += 1
        anchor -= timedelta(weeks=1)
    return current, longest


def overview(sessions: list[LoggedSession], sets: list[LoggedSet], now: datetime, tz: ZoneInfo) -> dict:
    today = local_day(now, tz)
    this_week = week_start(today)
    session_day = {item.id: local_day(item.started_at, tz) for item in sessions}

    weekly: dict[date, dict] = {}
    for offset in range(WEEKS - 1, -1, -1):
        start = this_week - timedelta(weeks=offset)
        weekly[start] = {"week_start": start, "sessions": 0, "sets": 0, "volume": Decimal("0")}

    calendar: dict[date, int] = {}
    calendar_start = today - timedelta(days=CALENDAR_DAYS - 1)
    active_weeks: set[date] = set()
    for item in sessions:
        day = session_day[item.id]
        start = week_start(day)
        active_weeks.add(start)
        if start in weekly:
            weekly[start]["sessions"] += 1
        if calendar_start <= day <= today:
            calendar[day] = calendar.get(day, 0) + 1

    total_volume = Decimal("0")
    split: dict[str, _Bucket] = {}
    split_start = today - timedelta(days=SPLIT_DAYS - 1)
    exercises: dict[UUID, dict] = {}
    for item in sets:
        day = session_day.get(item.session_id)
        if day is None:
            continue
        volume = Decimal(str(item.weight_kg)) * Decimal(item.reps)
        total_volume += volume
        start = week_start(day)
        if start in weekly:
            weekly[start]["sets"] += 1
            weekly[start]["volume"] += volume
        if split_start <= day <= today:
            bucket = split.setdefault(item.muscle or "other", _Bucket())
            bucket.sets += 1
            bucket.volume += volume
        summary = exercises.setdefault(
            item.exercise_id,
            {
                "exercise_id": item.exercise_id,
                "exercise_name": item.exercise_name,
                "muscle": item.muscle or "other",
                "sessions": set(),
                "best_e1rm_kg": None,
                "last_performed_at": None,
            },
        )
        summary["sessions"].add(item.session_id)
        estimate = epley(item.weight_kg, item.reps)
        if estimate is not None and (summary["best_e1rm_kg"] is None or estimate > summary["best_e1rm_kg"]):
            summary["best_e1rm_kg"] = estimate

    started = {item.id: item.started_at for item in sessions}
    for summary in exercises.values():
        summary["last_performed_at"] = max(started[sid] for sid in summary["sessions"])
        summary["sessions"] = len(summary["sessions"])

    current_streak, longest_streak = _streaks(active_weeks, this_week)
    records = personal_records(sessions, sets)
    last_week = weekly.get(this_week - timedelta(weeks=1))
    current = weekly[this_week]

    return {
        "totals": {
            "sessions": len(sessions),
            "sets": len(sets),
            "volume_kg": round6(total_volume),
            "this_week_sessions": current["sessions"],
            "this_week_volume_kg": round6(current["volume"]),
            "last_week_volume_kg": round6(last_week["volume"]) if last_week else 0.0,
            "current_streak_weeks": current_streak,
            "longest_streak_weeks": longest_streak,
            "records": len(records),
        },
        "weekly": [
            {"week_start": row["week_start"], "sessions": row["sessions"], "sets": row["sets"], "volume_kg": round6(row["volume"])}
            for row in weekly.values()
        ],
        "calendar": [{"day": day, "sessions": count} for day, count in sorted(calendar.items())],
        "muscle_split": [
            {"muscle": muscle, "sets": bucket.sets, "volume_kg": round6(bucket.volume)}
            for muscle, bucket in sorted(split.items(), key=lambda pair: (-pair[1].sets, pair[0]))
        ],
        "recent_records": list(reversed(records))[:RECORD_LIMIT],
        "exercises": sorted(exercises.values(), key=lambda row: row["last_performed_at"], reverse=True),
    }


def session_summary(target: LoggedSession, sessions: list[LoggedSession], sets: list[LoggedSet]) -> dict:
    """Totals for one session plus the records it set against everything before it."""
    mine = [item for item in sets if item.session_id == target.id]
    volume = sum((Decimal(str(item.weight_kg)) * Decimal(item.reps) for item in mine), Decimal("0"))
    earlier = [item for item in sessions if (item.started_at, str(item.id)) < (target.started_at, str(target.id))]
    considered = earlier + [target]
    considered_ids = {item.id for item in considered}
    records = [
        record
        for record in personal_records(considered, [item for item in sets if item.session_id in considered_ids])
        if record["session_id"] == target.id
    ]
    bests = _session_bests(mine).get(target.id, {})
    names = {item.exercise_id: item.exercise_name for item in mine}
    counts: dict[UUID, int] = {}
    for item in mine:
        counts[item.exercise_id] = counts.get(item.exercise_id, 0) + 1
    duration = None
    if target.ended_at is not None:
        duration = max(0, int((target.ended_at - target.started_at).total_seconds()))
    return {
        "session_id": target.id,
        "name": target.name,
        "started_at": target.started_at,
        "ended_at": target.ended_at,
        "duration_seconds": duration,
        "sets": len(mine),
        "volume_kg": round6(volume),
        "exercises": [
            {
                "exercise_id": exercise_id,
                "exercise_name": names[exercise_id],
                "sets": counts[exercise_id],
                "best_e1rm_kg": best.e1rm,
                "top_weight_kg": best.weight_kg,
                "top_reps": best.reps,
            }
            for exercise_id, best in sorted(bests.items(), key=lambda pair: names[pair[0]])
        ],
        "records": records,
    }
