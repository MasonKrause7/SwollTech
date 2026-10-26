import json
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from swolltech.stats import LoggedSession, LoggedSet, local_day, overview, personal_records, session_summary, week_start

UTC = ZoneInfo("UTC")
BENCH = uuid.UUID("945588d5-76e8-50ff-9b08-5a61982e1c0e")
SQUAT = uuid.UUID("df00b70c-0d32-5048-8e57-2e8af0f85e22")
GOLDEN = json.loads(Path(__file__).resolve().parents[3].joinpath("packages/metrics/fixtures/stats-golden.json").read_text())


def at(day: str, hour: int = 12) -> datetime:
    return datetime.fromisoformat(f"{day}T{hour:02d}:00:00+00:00")


def session(day: str, hour: int = 12) -> LoggedSession:
    return LoggedSession(id=uuid.uuid4(), started_at=at(day, hour), ended_at=at(day, hour) + timedelta(hours=1))


def lift(s: LoggedSession, exercise=BENCH, weight=100.0, reps=5, name=None, muscle="chest") -> LoggedSet:
    return LoggedSet(
        session_id=s.id,
        exercise_id=exercise,
        exercise_name=name or ("Bench Press" if exercise == BENCH else "Back Squat"),
        muscle=muscle,
        weight_kg=weight,
        reps=reps,
    )


def test_week_starts_on_monday():
    assert week_start(date(2026, 10, 25)) == date(2026, 10, 19)
    assert week_start(date(2026, 10, 19)) == date(2026, 10, 19)


def test_local_day_uses_the_callers_zone():
    late = datetime(2026, 10, 20, 2, 30, tzinfo=timezone.utc)
    assert local_day(late, UTC) == date(2026, 10, 20)
    assert local_day(late, ZoneInfo("America/Detroit")) == date(2026, 10, 19)


def test_first_session_is_a_baseline_not_a_record():
    first = session("2026-10-01")
    assert personal_records([first], [lift(first)]) == []


def test_records_only_when_the_estimate_beats_every_earlier_session():
    a, b, c, d = session("2026-10-01"), session("2026-10-03"), session("2026-10-05"), session("2026-10-07")
    sets = [
        lift(a, weight=100, reps=5),
        lift(b, weight=95, reps=5),
        lift(c, weight=100, reps=5),
        lift(d, weight=105, reps=5),
    ]
    records = personal_records([d, c, b, a], sets)
    assert [r["session_id"] for r in records] == [d.id]
    assert records[0]["previous_e1rm_kg"] == 116.666667
    assert records[0]["e1rm_kg"] == 122.5


def test_records_are_tracked_per_exercise():
    a, b = session("2026-10-01"), session("2026-10-03")
    sets = [
        lift(a, BENCH, 100, 5),
        lift(a, SQUAT, 140, 5, muscle="quads"),
        lift(b, BENCH, 90, 5),
        lift(b, SQUAT, 150, 2, muscle="quads"),
    ]
    records = personal_records([a, b], sets)
    assert [r["exercise_name"] for r in records] == []
    sets.append(lift(b, SQUAT, 150, 5, muscle="quads"))
    records = personal_records([a, b], sets)
    assert [r["exercise_name"] for r in records] == ["Back Squat"]
    assert records[0]["weight_kg"] == 150 and records[0]["reps"] == 5


def test_streaks_count_consecutive_weeks():
    now = at("2026-10-22")
    days = ["2026-09-21", "2026-09-29", "2026-10-06", "2026-10-14", "2026-08-03", "2026-08-10"]
    sessions = [session(day) for day in days]
    result = overview(sessions, [], now, UTC)
    # Current week (Oct 19) has nothing yet, so the streak runs back from last week: Oct 12, Oct 5, Sep 28, Sep 21.
    assert result["totals"]["current_streak_weeks"] == 4
    assert result["totals"]["longest_streak_weeks"] == 4
    sessions.append(session("2026-10-21"))
    result = overview(sessions, [], now, UTC)
    assert result["totals"]["current_streak_weeks"] == 5
    assert result["totals"]["this_week_sessions"] == 1


def test_streak_breaks_after_a_missed_week():
    now = at("2026-10-22")
    result = overview([session("2026-10-05")], [], now, UTC)
    assert result["totals"]["current_streak_weeks"] == 0
    assert result["totals"]["longest_streak_weeks"] == 1


def test_overview_weekly_buckets_calendar_and_split():
    now = at("2026-10-22")
    this_week = session("2026-10-20")
    last_week = session("2026-10-13")
    old = session("2026-06-01")
    sets = [
        lift(this_week, BENCH, 100, 5),
        lift(this_week, SQUAT, 140, 5, muscle="quads"),
        lift(last_week, BENCH, 90, 10),
        lift(old, BENCH, 60, 10),
    ]
    result = overview([this_week, last_week, old], sets, now, UTC)
    weekly = result["weekly"]
    assert len(weekly) == 12
    assert weekly[-1]["week_start"] == date(2026, 10, 19)
    assert weekly[-1] == {"week_start": date(2026, 10, 19), "sessions": 1, "sets": 2, "volume_kg": 1200.0}
    assert weekly[-2]["volume_kg"] == 900.0
    assert result["totals"]["this_week_volume_kg"] == 1200.0
    assert result["totals"]["last_week_volume_kg"] == 900.0
    assert result["totals"]["volume_kg"] == 2700.0
    assert [day["day"] for day in result["calendar"]] == [date(2026, 10, 13), date(2026, 10, 20)]
    assert result["muscle_split"] == [
        {"muscle": "chest", "sets": 2, "volume_kg": 1400.0},
        {"muscle": "quads", "sets": 1, "volume_kg": 700.0},
    ]
    names = [row["exercise_name"] for row in result["exercises"]]
    assert names == ["Back Squat", "Bench Press"] or names == ["Bench Press", "Back Squat"]
    bench = next(row for row in result["exercises"] if row["exercise_id"] == BENCH)
    assert bench["sessions"] == 3
    assert bench["best_e1rm_kg"] == 120.0


def test_empty_overview():
    result = overview([], [], at("2026-10-22"), UTC)
    assert result["totals"]["sessions"] == 0
    assert result["totals"]["current_streak_weeks"] == 0
    assert result["recent_records"] == []
    assert all(row["sessions"] == 0 for row in result["weekly"])


def test_session_summary_reports_records_against_earlier_sessions_only():
    a, b, c = session("2026-10-01"), session("2026-10-03"), session("2026-10-05")
    sets = [lift(a, weight=100), lift(b, weight=110), lift(b, weight=60, reps=12), lift(c, weight=120)]
    summary = session_summary(b, [a, b, c], sets)
    assert summary["sets"] == 2
    assert summary["volume_kg"] == 1270.0
    assert summary["duration_seconds"] == 3600
    assert [r["e1rm_kg"] for r in summary["records"]] == [128.333333]
    assert summary["exercises"][0]["top_weight_kg"] == 110
    assert session_summary(a, [a, b, c], sets)["records"] == []


def test_golden_overview_matches_the_phone():
    sessions = {
        row["id"]: LoggedSession(id=uuid.UUID(row["id"]), started_at=datetime.fromisoformat(row["started_at"]))
        for row in GOLDEN["sessions"]
    }
    sets = [
        LoggedSet(
            session_id=uuid.UUID(row["session_id"]),
            exercise_id=uuid.UUID(row["exercise_id"]),
            exercise_name=row["exercise_name"],
            muscle=row["muscle"],
            weight_kg=row["weight_kg"],
            reps=row["reps"],
        )
        for row in GOLDEN["sets"]
    ]
    result = overview(list(sessions.values()), sets, datetime.fromisoformat(GOLDEN["now"]), UTC)
    expected = GOLDEN["expected"]
    assert result["totals"] == expected["totals"]
    assert [{**row, "week_start": row["week_start"].isoformat()} for row in result["weekly"]] == expected["weekly"]
    assert [{"day": row["day"].isoformat(), "sessions": row["sessions"]} for row in result["calendar"]] == expected["calendar"]
    assert result["muscle_split"] == expected["muscle_split"]
    assert [
        {"exercise_name": r["exercise_name"], "e1rm_kg": r["e1rm_kg"], "previous_e1rm_kg": r["previous_e1rm_kg"], "session_id": str(r["session_id"])}
        for r in result["recent_records"]
    ] == expected["recent_records"]
