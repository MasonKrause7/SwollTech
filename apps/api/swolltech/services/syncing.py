import logging
import uuid
from datetime import date, datetime, timezone
from uuid import UUID

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from swolltech.errors import ConflictError, DomainError
from swolltech.metrics import to_kilograms
from swolltech.models import (
    AppliedMutation,
    Exercise,
    ExerciseReference,
    MediaStatus,
    Profile,
    ScheduledWorkout,
    Session,
    SessionExercise,
    SessionSet,
    SessionStatus,
    SetKind,
    SetMedia,
    WeightUnit,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)
from swolltech.schemas import Label, MutationIn, Name, Notes, Percent, Position, PositiveWeight, Reps, Rest, Rpe, Weight
from swolltech.services.common import (
    EXERCISE_FIELDS,
    MEDIA_FIELDS,
    PROFILE_FIELDS,
    REFERENCE_FIELDS,
    SCHEDULED_FIELDS,
    SESSION_EXERCISE_FIELDS,
    SESSION_FIELDS,
    SESSION_SET_FIELDS,
    WORKOUT_EXERCISE_FIELDS,
    WORKOUT_FIELDS,
    WORKOUT_SET_FIELDS,
    check_rpe,
    now,
    row_dict,
)
from swolltech.services.store import (
    archive_exercise,
    assert_exercise_name,
    assert_workout_name,
    delete_scheduled,
    delete_session,
    delete_session_exercise,
    delete_session_set,
    delete_workout,
    delete_workout_exercise,
    delete_workout_set,
    match_sync,
    require_profile,
    visible_exercise,
)

logger = logging.getLogger("swolltech.sync")

ENTITIES = {
    "profiles",
    "exercises",
    "exercise_references",
    "workouts",
    "workout_exercises",
    "workout_sets",
    "scheduled_workouts",
    "sessions",
    "session_exercises",
    "session_sets",
    "set_media",
}


class ProfileSync(BaseModel):
    display_name: Name = ""
    unit_preference: WeightUnit = WeightUnit.lb


class ExerciseSync(BaseModel):
    id: UUID
    name: str = Field(min_length=1, max_length=80)
    primary_muscle: Label = ""
    equipment: Label = ""


class ReferenceSync(BaseModel):
    id: UUID
    exercise_id: UUID
    weight: PositiveWeight
    unit: WeightUnit
    noted_on: date


class WorkoutSync(BaseModel):
    id: UUID
    name: str = Field(min_length=1, max_length=80)
    notes: Notes = ""
    archived_at: datetime | None = None


class WorkoutExerciseSync(BaseModel):
    id: UUID
    workout_id: UUID
    exercise_id: UUID
    position: Position
    notes: Notes = ""


class WorkoutSetSync(BaseModel):
    id: UUID
    workout_exercise_id: UUID
    position: Position
    kind: SetKind = SetKind.working
    target_reps: Reps | None = None
    target_weight: Weight | None = None
    target_unit: WeightUnit | None = None
    target_percent: Percent | None = None
    target_rpe: Rpe | None = None
    rest_seconds: Rest = 120


class ScheduledWorkoutSync(BaseModel):
    id: UUID
    workout_id: UUID
    scheduled_on: date
    notes: str = Field(default="", max_length=500)


class SessionSync(BaseModel):
    id: UUID
    workout_id: UUID | None = None
    name: Name = ""
    status: SessionStatus = SessionStatus.in_progress
    started_at: datetime
    ended_at: datetime | None = None
    notes: Notes = ""


class SessionExerciseSync(BaseModel):
    id: UUID
    session_id: UUID
    exercise_id: UUID
    position: Position
    notes: Notes = ""


class SessionSetSync(BaseModel):
    id: UUID
    session_exercise_id: UUID
    position: Position
    kind: SetKind = SetKind.working
    target_reps: Reps | None = None
    target_weight: Weight | None = None
    target_unit: WeightUnit | None = None
    target_percent: Percent | None = None
    target_rpe: Rpe | None = None
    rest_seconds: Rest = 120
    actual_reps: Reps | None = None
    actual_weight: Weight | None = None
    actual_unit: WeightUnit | None = None
    rpe: Rpe | None = None
    notes: Notes = ""
    skipped: bool = False
    completed_at: datetime | None = None


class MediaSync(BaseModel):
    id: UUID
    session_set_id: UUID
    content_type: str | None = Field(default=None, max_length=100)
    byte_size: int | None = Field(default=None, gt=0, le=10 * 1024**3)
    duration_seconds: float | None = Field(default=None, ge=0, le=86_400)
    status: MediaStatus = MediaStatus.local


class MergedInto(Exception):
    """A new custom exercise has the same name as one the user (or the catalog) already has.
    The phone made it offline on one device while another made the same one. Instead of
    refusing it, the change resolves to the existing exercise and the phone repoints its rows."""

    def __init__(self, row: Exercise) -> None:
        super().__init__(str(row.id))
        self.row = row


async def name_twin(db: AsyncSession, user_id: UUID, name: str) -> Exercise | None:
    lowered = name.strip().lower()
    return await db.scalar(
        select(Exercise)
        .where(
            (Exercise.owner_id == user_id) | Exercise.owner_id.is_(None),
            func.lower(Exercise.name) == lowered,
            Exercise.deleted_at.is_(None),
        )
        # The user's own copy wins over the catalog's.
        .order_by(Exercise.owner_id.is_(None))
        .limit(1)
    )


def aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


async def owned(db: AsyncSession, model, row_id: UUID, user_id: UUID, field: str = "user_id"):
    row = await db.get(model, row_id)
    if row is None or getattr(row, field) != user_id:
        raise DomainError(404, "Not found")
    return row


async def apply_upsert(db: AsyncSession, user_id: UUID, mutation: MutationIn):
    entity = mutation.entity
    payload = dict(mutation.payload)
    payload["id"] = str(mutation.entity_id)
    if entity == "profiles":
        if mutation.entity_id != user_id:
            raise DomainError(404, "Not found")
        body = ProfileSync.model_validate(payload)
        row = await require_profile(db, user_id)
        match_sync(row, mutation.base_updated_at, PROFILE_FIELDS)
        row.display_name = body.display_name.strip()
        row.unit_preference = body.unit_preference
    elif entity == "exercises":
        body = ExerciseSync.model_validate(payload)
        existing = await db.get(Exercise, body.id)
        if existing is not None and existing.owner_id != user_id:
            raise DomainError(404, "Not found")
        if existing is None:
            twin = await name_twin(db, user_id, body.name)
            if twin is not None:
                raise MergedInto(twin)
            row = Exercise(
                id=body.id,
                owner_id=user_id,
                name=body.name.strip(),
                primary_muscle=body.primary_muscle.strip(),
                equipment=body.equipment.strip(),
                created_at=now(),
            )
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, EXERCISE_FIELDS)
            if existing.deleted_at is None and body.name.strip().lower() != existing.name.lower():
                await assert_exercise_name(db, user_id, body.name, exclude=existing.id)
            existing.name = body.name.strip()
            existing.primary_muscle = body.primary_muscle.strip()
            existing.equipment = body.equipment.strip()
            existing.deleted_at = None
            row = existing
    elif entity == "exercise_references":
        body = ReferenceSync.model_validate(payload)
        await visible_exercise(db, user_id, body.exercise_id)
        existing = await db.get(ExerciseReference, body.id)
        noted = body.noted_on
        if existing is not None and existing.user_id != user_id:
            raise DomainError(404, "Not found")
        if existing is None:
            row = ExerciseReference(
                id=body.id,
                user_id=user_id,
                exercise_id=body.exercise_id,
                weight=body.weight,
                unit=body.unit,
                weight_kg=to_kilograms(body.weight, body.unit.value),
                noted_on=noted,
                created_at=now(),
            )
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, REFERENCE_FIELDS)
            existing.exercise_id = body.exercise_id
            existing.weight = body.weight
            existing.unit = body.unit
            existing.weight_kg = to_kilograms(body.weight, body.unit.value)
            existing.noted_on = noted
            existing.deleted_at = None
            row = existing
    elif entity == "workouts":
        body = WorkoutSync.model_validate(payload)
        existing = await db.get(Workout, body.id)
        if existing is not None and existing.user_id != user_id:
            raise DomainError(404, "Not found")
        if existing is None:
            await assert_workout_name(db, user_id, body.name)
            row = Workout(id=body.id, user_id=user_id, name=body.name.strip(), notes=body.notes, archived_at=aware(body.archived_at), created_at=now())
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, WORKOUT_FIELDS)
            if body.name.strip().lower() != existing.name.lower() and body.archived_at is None:
                await assert_workout_name(db, user_id, body.name, exclude=existing.id)
            existing.name = body.name.strip()
            existing.notes = body.notes
            existing.archived_at = aware(body.archived_at)
            existing.deleted_at = None
            row = existing
    elif entity == "workout_exercises":
        body = WorkoutExerciseSync.model_validate(payload)
        await owned(db, Workout, body.workout_id, user_id)
        await visible_exercise(db, user_id, body.exercise_id)
        existing = await db.get(WorkoutExercise, body.id)
        if existing is not None and existing.user_id != user_id:
            raise DomainError(404, "Not found")
        if existing is None:
            row = WorkoutExercise(
                id=body.id, user_id=user_id, workout_id=body.workout_id, exercise_id=body.exercise_id,
                position=body.position, notes=body.notes, created_at=now(),
            )
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, WORKOUT_EXERCISE_FIELDS)
            existing.workout_id = body.workout_id
            existing.exercise_id = body.exercise_id
            existing.position = body.position
            existing.notes = body.notes
            existing.deleted_at = None
            row = existing
    elif entity == "workout_sets":
        body = WorkoutSetSync.model_validate(payload)
        await owned(db, WorkoutExercise, body.workout_exercise_id, user_id)
        if body.target_weight is not None and body.target_percent is not None:
            raise DomainError(400, "Use a target weight or a percent, not both")
        if body.target_weight is not None and body.target_unit is None:
            raise DomainError(400, "A unit is required with weight")
        check_rpe(body.target_rpe)
        existing = await db.get(WorkoutSet, body.id)
        if existing is not None and existing.user_id != user_id:
            raise DomainError(404, "Not found")
        if existing is None:
            row = WorkoutSet(id=body.id, user_id=user_id, workout_exercise_id=body.workout_exercise_id, created_at=now(), position=body.position)
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, WORKOUT_SET_FIELDS)
            row = existing
            row.deleted_at = None
        row.position = body.position
        row.kind = body.kind
        row.target_reps = body.target_reps
        row.target_weight = body.target_weight
        row.target_unit = body.target_unit
        row.target_percent = body.target_percent
        row.target_rpe = body.target_rpe
        row.rest_seconds = body.rest_seconds
    elif entity == "scheduled_workouts":
        body = ScheduledWorkoutSync.model_validate(payload)
        workout = await owned(db, Workout, body.workout_id, user_id)
        if workout.deleted_at is not None:
            raise DomainError(404, "Not found")
        existing = await db.get(ScheduledWorkout, body.id)
        if existing is not None and existing.user_id != user_id:
            raise DomainError(404, "Not found")
        if existing is None:
            row = ScheduledWorkout(id=body.id, user_id=user_id, workout_id=body.workout_id, scheduled_on=body.scheduled_on, notes=body.notes, created_at=now())
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, SCHEDULED_FIELDS)
            existing.workout_id = body.workout_id
            existing.scheduled_on = body.scheduled_on
            existing.notes = body.notes
            existing.deleted_at = None
            row = existing
    elif entity == "sessions":
        body = SessionSync.model_validate(payload)
        if body.workout_id is not None:
            await owned(db, Workout, body.workout_id, user_id)
        existing = await db.get(Session, body.id)
        if existing is not None and existing.user_id != user_id:
            raise DomainError(404, "Not found")
        if existing is None:
            row = Session(
                id=body.id, user_id=user_id, workout_id=body.workout_id, name=body.name or "Workout",
                status=body.status, started_at=aware(body.started_at), ended_at=aware(body.ended_at),
                notes=body.notes, created_at=now(),
            )
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, SESSION_FIELDS)
            existing.workout_id = body.workout_id
            existing.name = body.name or existing.name
            existing.status = body.status
            existing.started_at = aware(body.started_at)
            existing.ended_at = aware(body.ended_at)
            existing.notes = body.notes
            existing.deleted_at = None
            row = existing
    elif entity == "session_exercises":
        body = SessionExerciseSync.model_validate(payload)
        await owned(db, Session, body.session_id, user_id)
        await visible_exercise(db, user_id, body.exercise_id)
        existing = await db.get(SessionExercise, body.id)
        if existing is not None and existing.user_id != user_id:
            raise DomainError(404, "Not found")
        if existing is None:
            row = SessionExercise(
                id=body.id, user_id=user_id, session_id=body.session_id, exercise_id=body.exercise_id,
                position=body.position, notes=body.notes, created_at=now(),
            )
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, SESSION_EXERCISE_FIELDS)
            existing.session_id = body.session_id
            existing.exercise_id = body.exercise_id
            existing.position = body.position
            existing.notes = body.notes
            existing.deleted_at = None
            row = existing
    elif entity == "session_sets":
        body = SessionSetSync.model_validate(payload)
        await owned(db, SessionExercise, body.session_exercise_id, user_id)
        check_rpe(body.rpe)
        check_rpe(body.target_rpe)
        if body.actual_weight is not None and body.actual_unit is None:
            raise DomainError(400, "A unit is required with weight")
        existing = await db.get(SessionSet, body.id)
        if existing is not None and existing.user_id != user_id:
            raise DomainError(404, "Not found")
        if existing is None:
            row = SessionSet(id=body.id, user_id=user_id, session_exercise_id=body.session_exercise_id, created_at=now(), notes="", skipped=False, position=body.position)
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, SESSION_SET_FIELDS)
            row = existing
            row.deleted_at = None
        row.position = body.position
        row.kind = body.kind
        row.target_reps = body.target_reps
        row.target_weight = body.target_weight
        row.target_unit = body.target_unit
        row.target_percent = body.target_percent
        row.target_rpe = body.target_rpe
        row.rest_seconds = body.rest_seconds
        row.actual_reps = body.actual_reps
        row.actual_weight = body.actual_weight
        row.actual_unit = body.actual_unit
        row.weight_kg = to_kilograms(body.actual_weight, body.actual_unit.value) if body.actual_weight is not None and body.actual_unit is not None else None
        row.rpe = body.rpe
        row.notes = body.notes
        row.skipped = body.skipped
        row.completed_at = None if body.skipped else aware(body.completed_at)
    elif entity == "set_media":
        body = MediaSync.model_validate(payload)
        await owned(db, SessionSet, body.session_set_id, user_id)
        existing = await db.get(SetMedia, body.id)
        if existing is not None and existing.user_id != user_id:
            raise DomainError(404, "Not found")
        status = body.status if body.status in (MediaStatus.local, MediaStatus.failed) else MediaStatus.local
        if existing is None:
            row = SetMedia(
                id=body.id, user_id=user_id, session_set_id=body.session_set_id, content_type=body.content_type,
                byte_size=body.byte_size, duration_seconds=body.duration_seconds, status=status, created_at=now(),
            )
            db.add(row)
        else:
            match_sync(existing, mutation.base_updated_at, MEDIA_FIELDS)
            if existing.status != MediaStatus.ready:
                existing.status = status
            existing.content_type = body.content_type or existing.content_type
            existing.byte_size = body.byte_size or existing.byte_size
            existing.duration_seconds = body.duration_seconds if body.duration_seconds is not None else existing.duration_seconds
            existing.deleted_at = None
            row = existing
    else:
        raise DomainError(400, "Unknown entity")
    await db.flush()
    await db.refresh(row)
    return row


async def apply_delete(db: AsyncSession, user_id: UUID, mutation: MutationIn):
    entity = mutation.entity
    if entity == "profiles":
        raise DomainError(400, "Delete the account instead of the profile row")
    mapping = {
        "exercises": (Exercise, EXERCISE_FIELDS, archive_exercise),
        "workouts": (Workout, WORKOUT_FIELDS, delete_workout),
        "workout_exercises": (WorkoutExercise, WORKOUT_EXERCISE_FIELDS, delete_workout_exercise),
        "workout_sets": (WorkoutSet, WORKOUT_SET_FIELDS, delete_workout_set),
        "scheduled_workouts": (ScheduledWorkout, SCHEDULED_FIELDS, delete_scheduled),
        "sessions": (Session, SESSION_FIELDS, delete_session),
        "session_exercises": (SessionExercise, SESSION_EXERCISE_FIELDS, delete_session_exercise),
        "session_sets": (SessionSet, SESSION_SET_FIELDS, delete_session_set),
    }
    if entity == "exercise_references":
        row = await db.get(ExerciseReference, mutation.entity_id)
        if row is None or row.user_id != user_id:
            raise DomainError(404, "Not found")
        if row.deleted_at is None:
            match_sync(row, mutation.base_updated_at, REFERENCE_FIELDS)
            row.deleted_at = now()
        return row
    if entity == "set_media":
        row = await db.get(SetMedia, mutation.entity_id)
        if row is None or row.user_id != user_id:
            raise DomainError(404, "Not found")
        if row.deleted_at is None:
            match_sync(row, mutation.base_updated_at, MEDIA_FIELDS)
            row.deleted_at = now()
        return row
    if entity not in mapping:
        raise DomainError(400, "Unknown entity")
    model, fields, deleter = mapping[entity]
    row = await db.get(model, mutation.entity_id)
    owner = None if row is None else (row.owner_id if entity == "exercises" else row.user_id)
    if row is None or owner != user_id:
        raise DomainError(404, "Not found")
    if row.deleted_at is None:
        match_sync(row, mutation.base_updated_at, fields)
        if entity == "exercises":
            await deleter(db, user_id, mutation.entity_id)
        else:
            await deleter(db, user_id, mutation.entity_id)
    return row


SPECS = {
    "profiles": (Profile, PROFILE_FIELDS, "id"),
    "exercises": (Exercise, EXERCISE_FIELDS, "owner_id"),
    "exercise_references": (ExerciseReference, REFERENCE_FIELDS, "user_id"),
    "workouts": (Workout, WORKOUT_FIELDS, "user_id"),
    "workout_exercises": (WorkoutExercise, WORKOUT_EXERCISE_FIELDS, "user_id"),
    "workout_sets": (WorkoutSet, WORKOUT_SET_FIELDS, "user_id"),
    "scheduled_workouts": (ScheduledWorkout, SCHEDULED_FIELDS, "user_id"),
    "sessions": (Session, SESSION_FIELDS, "user_id"),
    "session_exercises": (SessionExercise, SESSION_EXERCISE_FIELDS, "user_id"),
    "session_sets": (SessionSet, SESSION_SET_FIELDS, "user_id"),
    "set_media": (SetMedia, MEDIA_FIELDS, "user_id"),
}


async def load_row(db: AsyncSession, user_id: UUID, entity: str, entity_id: UUID) -> dict | None:
    model, fields, owner_attr = SPECS[entity]
    row = await db.get(model, entity_id)
    if row is None or getattr(row, owner_attr) != user_id or row.deleted_at is not None:
        return None
    return row_dict(row, fields)


EXERCISE_REFERENCING = ("exercise_references", "workout_exercises", "session_exercises")


def _with_alias(mutation: MutationIn, aliases: dict[str, str]) -> MutationIn:
    """Point a change at the exercise an earlier change in this batch was merged into."""
    if mutation.entity not in EXERCISE_REFERENCING:
        return mutation
    target = aliases.get(str(mutation.payload.get("exercise_id")))
    if target is None:
        return mutation
    return mutation.model_copy(update={"payload": {**mutation.payload, "exercise_id": target}})


async def sync(db: AsyncSession, user_id: UUID, cursor: int, mutations: list[MutationIn], limit: int | None = None) -> dict:
    await require_profile(db, user_id)
    applied = []
    aliases: dict[str, str] = {}
    for mutation in mutations:
        if mutation.entity not in ENTITIES or mutation.op not in {"upsert", "delete"}:
            applied.append({"client_mutation_id": mutation.client_mutation_id, "status": "error", "detail": "Unknown mutation"})
            continue
        existing = await db.scalar(
            select(AppliedMutation.id).where(
                AppliedMutation.user_id == user_id,
                AppliedMutation.client_mutation_id == mutation.client_mutation_id,
            )
        )
        if existing:
            applied.append({"client_mutation_id": mutation.client_mutation_id, "status": "duplicate"})
            continue
        mutation = _with_alias(mutation, aliases)
        try:
            async with db.begin_nested():
                if mutation.op == "upsert":
                    await apply_upsert(db, user_id, mutation)
                    server_row = await load_row(db, user_id, mutation.entity, mutation.entity_id)
                else:
                    await apply_delete(db, user_id, mutation)
                    server_row = None
                db.add(AppliedMutation(id=uuid.uuid4(), user_id=user_id, client_mutation_id=mutation.client_mutation_id, created_at=now()))
                await db.flush()
            applied.append({"client_mutation_id": mutation.client_mutation_id, "status": "applied", "server_row": server_row})
        except MergedInto as exc:
            twin = exc.row
            aliases[str(mutation.entity_id)] = str(twin.id)
            async with db.begin_nested():
                db.add(AppliedMutation(id=uuid.uuid4(), user_id=user_id, client_mutation_id=mutation.client_mutation_id, created_at=now()))
                await db.flush()
            applied.append({
                "client_mutation_id": mutation.client_mutation_id,
                "status": "merged",
                "server_row": row_dict(twin, EXERCISE_FIELDS),
                "detail": "You already had an exercise with that name, so this one was merged into it",
            })
        except ConflictError as exc:
            applied.append({"client_mutation_id": mutation.client_mutation_id, "status": "conflict", "server_row": exc.row, "detail": "Updated on another device"})
        except DomainError as exc:
            applied.append({"client_mutation_id": mutation.client_mutation_id, "status": "error", "detail": exc.detail})
        except ValidationError as exc:
            first = exc.errors()[0] if exc.errors() else {}
            field = ".".join(str(part) for part in first.get("loc", ())) or "payload"
            applied.append({"client_mutation_id": mutation.client_mutation_id, "status": "error", "detail": f"Invalid {field}: {first.get('msg', 'bad value')}"})
        except DBAPIError as exc:
            # A value the database refused (a constraint, an overflowing number, ...). Report
            # this one change and keep going, so one bad row cannot block every later sync.
            if exc.connection_invalidated:
                raise
            logger.warning("Sync change refused by the database: %s %s: %s", mutation.entity, mutation.op, type(exc.orig).__name__ if exc.orig else type(exc).__name__)
            applied.append({"client_mutation_id": mutation.client_mutation_id, "status": "error", "detail": "Could not save that change"})
    new_cursor, changes, has_more = await pull(db, user_id, cursor, limit)
    return {"cursor": new_cursor, "applied": applied, "changes": changes, "has_more": has_more}


DEFAULT_PULL_LIMIT = 2000


async def pull(db: AsyncSession, user_id: UUID, cursor: int, limit: int | None = None) -> tuple[int, list[dict], bool]:
    """Changes after the cursor, newest per row, at most `limit` rows (Vercel caps a
    response at 4.5 MB, and a fresh install pulls the whole history).

    Rows come in order of their latest change and the new cursor is the last change
    returned. Every change at or below it is covered: its row is either in this page (its
    latest change is at or below the cursor) or comes in a later page with a newer one. So
    a client that ignores has_more still converges, one sync at a time.
    """
    take = limit or DEFAULT_PULL_LIMIT
    result = await db.execute(
        text(
            """
            select id, entity, entity_id, op from (
              select distinct on (entity, entity_id) id, entity, entity_id, op
              from sync_changes
              where user_id = :uid and id > :cursor
              order by entity, entity_id, id desc
            ) latest
            order by id
            limit :take
            """
        ),
        {"uid": user_id, "cursor": cursor, "take": take + 1},
    )
    entries = list(result)
    has_more = len(entries) > take
    entries = entries[:take]
    if not entries:
        return cursor, [], False
    max_id = entries[-1][0]
    # One query per entity instead of one per row: a fresh install pulls the whole history.
    wanted: dict[str, list[UUID]] = {}
    for _change_id, entity, entity_id, op in entries:
        if op == "upsert" and entity in SPECS:
            wanted.setdefault(entity, []).append(entity_id)
    loaded: dict[tuple[str, UUID], dict] = {}
    for entity, entity_ids in wanted.items():
        model, fields, owner_attr = SPECS[entity]
        for start in range(0, len(entity_ids), 1000):
            rows = await db.scalars(select(model).where(model.id.in_(entity_ids[start : start + 1000])))
            for row in rows:
                if getattr(row, owner_attr) == user_id and row.deleted_at is None:
                    loaded[(entity, row.id)] = row_dict(row, fields)
    changes = []
    for change_id, entity, entity_id, op in entries:
        row = None
        if op == "upsert" and entity in SPECS:
            row = loaded.get((entity, entity_id))
            if row is None:
                op = "delete"
        changes.append({"id": change_id, "entity": entity, "entity_id": entity_id, "op": op, "row": row})
    return int(max_id), changes, has_more
