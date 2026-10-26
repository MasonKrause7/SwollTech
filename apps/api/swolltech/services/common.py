import enum
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from swolltech.errors import ConflictError, DomainError
from swolltech.schemas import (
    ExerciseOut,
    ProfileOut,
    ReferenceOut,
    SessionSetOut,
    SessionSummary,
    WorkoutSetOut,
    WorkoutSummary,
)


def now() -> datetime:
    return datetime.now(timezone.utc)


def enum_value(value):
    if isinstance(value, enum.Enum):
        return value.value
    return value


def timestamps_match(stored: datetime, incoming: datetime | None) -> bool:
    if incoming is None:
        return False
    left = stored if stored.tzinfo else stored.replace(tzinfo=timezone.utc)
    right = incoming if incoming.tzinfo else incoming.replace(tzinfo=timezone.utc)
    return abs((left - right).total_seconds()) < 0.001


def check_rpe(value: float | None) -> None:
    if value is None:
        return
    if value < 1 or value > 10 or abs(value * 2 - round(value * 2)) > 1e-6:
        raise DomainError(400, "RPE must be between 1 and 10 in steps of 0.5")


def jsonable(value):
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    return value


def row_dict(row, names: list[str]) -> dict:
    return {name: jsonable(getattr(row, name)) for name in names}


def ensure_optional_match(row, base: datetime | None, schema) -> None:
    if base is None:
        return
    if not timestamps_match(row.updated_at, base):
        raise ConflictError(schema.model_validate(row).model_dump(mode="json"))


def ensure_sync_match(row, base: datetime | None, schema) -> None:
    if row is None:
        return
    if base is None or not timestamps_match(row.updated_at, base):
        raise ConflictError(schema.model_validate(row).model_dump(mode="json"))


async def next_position(db: AsyncSession, model, parent_column, parent_id) -> int:
    current = await db.scalar(
        select(func.max(model.position)).where(parent_column == parent_id, model.deleted_at.is_(None))
    )
    if current is None:
        return 0
    return int(current) + 1


async def reorder(db: AsyncSession, model, parent_column, parent_id, ids: list[UUID]) -> None:
    rows = (
        await db.scalars(select(model).where(parent_column == parent_id, model.deleted_at.is_(None)))
    ).all()
    by_id = {row.id: row for row in rows}
    if set(by_id) != set(ids) or len(ids) != len(by_id):
        raise DomainError(400, "Reorder must include every current item once")
    for index, item_id in enumerate(ids):
        by_id[item_id].position = index


def mark_deleted(row) -> None:
    row.deleted_at = now()


PROFILE_FIELDS = ["id", "display_name", "unit_preference", "updated_at", "deleted_at"]
EXERCISE_FIELDS = ["id", "owner_id", "name", "primary_muscle", "equipment", "updated_at", "deleted_at"]
REFERENCE_FIELDS = ["id", "user_id", "exercise_id", "weight", "unit", "weight_kg", "noted_on", "updated_at", "deleted_at"]
WORKOUT_FIELDS = ["id", "user_id", "name", "notes", "archived_at", "updated_at", "deleted_at"]
WORKOUT_EXERCISE_FIELDS = ["id", "user_id", "workout_id", "exercise_id", "position", "notes", "updated_at", "deleted_at"]
WORKOUT_SET_FIELDS = [
    "id", "user_id", "workout_exercise_id", "position", "kind", "target_reps", "target_weight",
    "target_unit", "target_percent", "target_rpe", "rest_seconds", "updated_at", "deleted_at",
]
SESSION_FIELDS = ["id", "user_id", "workout_id", "name", "status", "started_at", "ended_at", "notes", "updated_at", "deleted_at"]
SESSION_EXERCISE_FIELDS = ["id", "user_id", "session_id", "exercise_id", "position", "notes", "updated_at", "deleted_at"]
SESSION_SET_FIELDS = [
    "id", "user_id", "session_exercise_id", "position", "kind", "target_reps", "target_weight", "target_unit",
    "target_percent", "target_rpe", "rest_seconds", "actual_reps", "actual_weight", "actual_unit", "weight_kg",
    "rpe", "notes", "skipped", "completed_at", "updated_at", "deleted_at",
]
MEDIA_FIELDS = [
    "id", "user_id", "session_set_id", "storage_key", "content_type", "byte_size", "duration_seconds",
    "status", "updated_at", "deleted_at",
]

CONFLICT_SCHEMA = {
    "profiles": ProfileOut,
    "exercises": ExerciseOut,
    "exercise_references": ReferenceOut,
    "workouts": WorkoutSummary,
    "sessions": SessionSummary,
    "session_sets": SessionSetOut,
    "workout_sets": WorkoutSetOut,
}
