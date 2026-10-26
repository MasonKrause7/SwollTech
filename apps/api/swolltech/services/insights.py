from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from swolltech.errors import DomainError
from swolltech.stats import LoggedSession, LoggedSet, overview, session_summary

SESSIONS_SQL = """
select s.id, s.started_at, s.ended_at, s.name
from sessions s
where s.user_id = :uid
  and s.deleted_at is null
  and (s.status = 'completed' or s.id = :include)
"""

SETS_SQL = """
select se.session_id, se.exercise_id, e.name, e.primary_muscle, ss.weight_kg, ss.actual_reps
from session_sets ss
join session_exercises se on se.id = ss.session_exercise_id and se.deleted_at is null
join sessions s on s.id = se.session_id and s.deleted_at is null
join exercises e on e.id = se.exercise_id
where ss.user_id = :uid
  and ss.deleted_at is null
  and ss.kind = 'working'
  and ss.skipped = false
  and ss.completed_at is not null
  and ss.actual_reps >= 1
  and ss.weight_kg is not null
  and (s.status = 'completed' or s.id = :include)
"""


def parse_zone(name: str | None) -> ZoneInfo:
    if not name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise DomainError(400, "Unknown time zone") from exc


async def load_log(db: AsyncSession, user_id: UUID, include: UUID | None = None) -> tuple[list[LoggedSession], list[LoggedSet]]:
    params = {"uid": user_id, "include": include}
    sessions = [
        LoggedSession(id=row.id, started_at=row.started_at, ended_at=row.ended_at, name=row.name)
        for row in await db.execute(text(SESSIONS_SQL), params)
    ]
    sets = [
        LoggedSet(
            session_id=row.session_id,
            exercise_id=row.exercise_id,
            exercise_name=row.name,
            muscle=row.primary_muscle or "",
            weight_kg=float(row.weight_kg),
            reps=int(row.actual_reps),
        )
        for row in await db.execute(text(SETS_SQL), params)
    ]
    return sessions, sets


async def get_overview(db: AsyncSession, user_id: UUID, tz_name: str | None, now: datetime | None = None) -> dict:
    zone = parse_zone(tz_name)
    sessions, sets = await load_log(db, user_id)
    return overview(sessions, sets, now or datetime.now(timezone.utc), zone)


async def get_session_summary(db: AsyncSession, user_id: UUID, session_id: UUID) -> dict:
    sessions, sets = await load_log(db, user_id, include=session_id)
    target = next((item for item in sessions if item.id == session_id), None)
    if target is None:
        raise DomainError(404, "Not found")
    return session_summary(target, sessions, sets)
