import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import bindparam, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from swolltech.errors import ConflictError, DomainError
from swolltech.metrics import PerformedSet, epley, from_kilograms, summarize_sets, to_kilograms
from swolltech.models import (
    CatalogMeta,
    Exercise,
    ExerciseReference,
    MediaStatus,
    Profile,
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
from swolltech.schemas import (
    ExerciseIn,
    ExerciseOut,
    ExercisePatch,
    MediaOut,
    ProfileOut,
    ProfilePatch,
    ProgressOut,
    ProgressPoint,
    ReferenceIn,
    ReferenceOut,
    SessionExerciseIn,
    SessionExerciseOut,
    SessionExercisePatch,
    SessionIn,
    SessionOut,
    SessionPatch,
    SessionSetIn,
    SessionSetOut,
    SessionSetPatch,
    SessionSummary,
    WorkoutExerciseIn,
    WorkoutExerciseOut,
    WorkoutExercisePatch,
    WorkoutIn,
    WorkoutOut,
    WorkoutPatch,
    WorkoutSetIn,
    WorkoutSetOut,
    WorkoutSetPatch,
    WorkoutSummary,
)
from swolltech.services.common import (
    check_rpe,
    ensure_optional_match,
    enum_value,
    mark_deleted,
    next_position,
    now,
    reorder,
    row_dict,
    timestamps_match,
)
from swolltech.services.common import (
    EXERCISE_FIELDS,
    MEDIA_FIELDS,
    PROFILE_FIELDS,
    REFERENCE_FIELDS,
    SESSION_EXERCISE_FIELDS,
    SESSION_FIELDS,
    SESSION_SET_FIELDS,
    WORKOUT_EXERCISE_FIELDS,
    WORKOUT_FIELDS,
    WORKOUT_SET_FIELDS,
)
from swolltech.storage import ALLOWED_VIDEO_TYPES


def conflict(row, fields: list[str]) -> None:
    raise ConflictError(row_dict(row, fields))


def match_sync(row, base: datetime | None, fields: list[str]) -> None:
    if row is None:
        return
    if base is None or not timestamps_match(row.updated_at, base):
        conflict(row, fields)


async def require_profile(db: AsyncSession, user_id: UUID) -> Profile:
    profile = await db.get(Profile, user_id)
    if profile is None or profile.deleted_at is not None:
        raise DomainError(401, "Profile not found")
    return profile


async def update_profile(db: AsyncSession, user_id: UUID, body: ProfilePatch) -> Profile:
    profile = await require_profile(db, user_id)
    ensure_optional_match(profile, body.base_updated_at, ProfileOut)
    if body.display_name is not None:
        profile.display_name = body.display_name.strip()
    if body.unit_preference is not None:
        profile.unit_preference = body.unit_preference
    await db.flush()
    await db.refresh(profile)
    return profile


async def visible_exercise(db: AsyncSession, user_id: UUID, exercise_id: UUID) -> Exercise:
    row = await db.get(Exercise, exercise_id)
    if row is None or row.deleted_at is not None:
        raise DomainError(404, "Not found")
    if row.owner_id is not None and row.owner_id != user_id:
        raise DomainError(404, "Not found")
    return row


async def list_exercises(db: AsyncSession, user_id: UUID, query: str | None) -> list[Exercise]:
    stmt = select(Exercise).where(
        Exercise.deleted_at.is_(None),
        or_(Exercise.owner_id.is_(None), Exercise.owner_id == user_id),
    )
    if query:
        term = query.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(Exercise.name.ilike(f"%{term}%", escape="\\"))
    stmt = stmt.order_by(Exercise.owner_id.is_(None).desc(), Exercise.name)
    return list((await db.scalars(stmt)).all())


async def catalog(db: AsyncSession, user_id: UUID):
    version = await db.scalar(select(CatalogMeta.version).where(CatalogMeta.id == 1))
    exercises = await list_exercises(db, user_id, None)
    global_only = [item for item in exercises if item.owner_id is None]
    return int(version or 1), global_only


async def assert_exercise_name(db: AsyncSession, user_id: UUID, name: str, exclude: UUID | None = None) -> None:
    lowered = name.strip().lower()
    global_hit = await db.scalar(
        select(Exercise.id).where(
            Exercise.owner_id.is_(None),
            func.lower(Exercise.name) == lowered,
            Exercise.deleted_at.is_(None),
        )
    )
    if global_hit:
        raise DomainError(409, "That exercise is already in the catalog")
    stmt = select(Exercise.id).where(
        Exercise.owner_id == user_id,
        func.lower(Exercise.name) == lowered,
        Exercise.deleted_at.is_(None),
    )
    if exclude:
        stmt = stmt.where(Exercise.id != exclude)
    if await db.scalar(stmt):
        raise DomainError(409, "You already have an exercise with that name")


async def create_exercise(db: AsyncSession, user_id: UUID, body: ExerciseIn) -> Exercise:
    await assert_exercise_name(db, user_id, body.name)
    row = Exercise(
        id=body.id or uuid.uuid4(),
        owner_id=user_id,
        name=body.name.strip(),
        primary_muscle=body.primary_muscle.strip(),
        equipment=body.equipment.strip(),
        created_at=now(),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise DomainError(409, "You already have an exercise with that name") from exc
    await db.refresh(row)
    return row


async def update_exercise(db: AsyncSession, user_id: UUID, exercise_id: UUID, body: ExercisePatch) -> Exercise:
    row = await db.get(Exercise, exercise_id)
    if row is None or row.deleted_at is not None or row.owner_id != user_id:
        raise DomainError(404, "Not found")
    ensure_optional_match(row, body.base_updated_at, ExerciseOut)
    if body.name is not None:
        await assert_exercise_name(db, user_id, body.name, exclude=row.id)
        row.name = body.name.strip()
    if body.primary_muscle is not None:
        row.primary_muscle = body.primary_muscle.strip()
    if body.equipment is not None:
        row.equipment = body.equipment.strip()
    await db.flush()
    await db.refresh(row)
    return row


async def archive_exercise(db: AsyncSession, user_id: UUID, exercise_id: UUID) -> None:
    row = await db.get(Exercise, exercise_id)
    if row is None or row.deleted_at is not None or row.owner_id != user_id:
        raise DomainError(404, "Not found")
    mark_deleted(row)
    await db.flush()


async def get_reference(db: AsyncSession, user_id: UUID, exercise_id: UUID) -> ExerciseReference | None:
    await visible_exercise(db, user_id, exercise_id)
    return await db.scalar(
        select(ExerciseReference).where(
            ExerciseReference.user_id == user_id,
            ExerciseReference.exercise_id == exercise_id,
            ExerciseReference.deleted_at.is_(None),
        )
    )


async def put_reference(db: AsyncSession, user_id: UUID, exercise_id: UUID, body: ReferenceIn) -> ExerciseReference:
    await visible_exercise(db, user_id, exercise_id)
    existing = await db.scalar(
        select(ExerciseReference).where(
            ExerciseReference.user_id == user_id,
            ExerciseReference.exercise_id == exercise_id,
            ExerciseReference.deleted_at.is_(None),
        )
    )
    if existing:
        ensure_optional_match(existing, body.base_updated_at, ReferenceOut)
        existing.weight = body.weight
        existing.unit = body.unit
        existing.weight_kg = to_kilograms(body.weight, body.unit.value)
        existing.noted_on = body.noted_on
        await db.flush()
        await db.refresh(existing)
        return existing
    row = ExerciseReference(
        id=body.id or uuid.uuid4(),
        user_id=user_id,
        exercise_id=exercise_id,
        weight=body.weight,
        unit=body.unit,
        weight_kg=to_kilograms(body.weight, body.unit.value),
        noted_on=body.noted_on,
        created_at=now(),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def delete_reference(db: AsyncSession, user_id: UUID, exercise_id: UUID) -> None:
    existing = await get_reference(db, user_id, exercise_id)
    if existing is None:
        raise DomainError(404, "Not found")
    mark_deleted(existing)
    await db.flush()


async def reference_max(db: AsyncSession, user_id: UUID, exercise_id: UUID) -> tuple[float | None, str]:
    ref = await db.scalar(
        select(ExerciseReference).where(
            ExerciseReference.user_id == user_id,
            ExerciseReference.exercise_id == exercise_id,
            ExerciseReference.deleted_at.is_(None),
        )
    )
    if ref is not None:
        return float(ref.weight_kg), "training_max"
    result = await db.execute(
        text(
            """
            select ss.weight_kg, ss.actual_reps
            from session_sets ss
            join session_exercises se on se.id = ss.session_exercise_id
            join sessions s on s.id = se.session_id
            where se.user_id = :uid
              and se.exercise_id = :eid
              and se.deleted_at is null
              and ss.deleted_at is null
              and s.deleted_at is null
              and s.status = 'completed'
              and ss.kind = 'working'
              and ss.skipped = false
              and ss.completed_at is not null
              and ss.actual_reps >= 1
              and ss.weight_kg is not null
            """
        ),
        {"uid": user_id, "eid": exercise_id},
    )
    best = None
    for weight_kg, reps in result:
        estimate = epley(float(weight_kg), int(reps))
        if estimate is not None and (best is None or estimate > best):
            best = estimate
    if best is None:
        return None, "none"
    return best, "estimated"


async def assert_workout_name(db: AsyncSession, user_id: UUID, name: str, exclude: UUID | None = None) -> None:
    stmt = select(Workout.id).where(
        Workout.user_id == user_id,
        func.lower(Workout.name) == name.strip().lower(),
        Workout.deleted_at.is_(None),
        Workout.archived_at.is_(None),
    )
    if exclude:
        stmt = stmt.where(Workout.id != exclude)
    if await db.scalar(stmt):
        raise DomainError(409, "You already have a workout with that name")


async def list_workouts(db: AsyncSession, user_id: UUID) -> list[Workout]:
    stmt = (
        select(Workout)
        .where(Workout.user_id == user_id, Workout.deleted_at.is_(None))
        .order_by(Workout.archived_at.is_(None).desc(), Workout.name)
    )
    return list((await db.scalars(stmt)).all())


async def get_workout(db: AsyncSession, user_id: UUID, workout_id: UUID) -> Workout:
    stmt = (
        select(Workout)
        .where(Workout.id == workout_id, Workout.user_id == user_id, Workout.deleted_at.is_(None))
        .options(
            selectinload(Workout.exercises).selectinload(WorkoutExercise.sets),
            selectinload(Workout.exercises).selectinload(WorkoutExercise.exercise),
        )
    )
    row = (await db.scalars(stmt)).unique().one_or_none()
    if row is None:
        raise DomainError(404, "Not found")
    return row


def present_workout(row: Workout) -> WorkoutOut:
    exercises = []
    for item in row.exercises:
        if item.deleted_at is not None:
            continue
        sets = [WorkoutSetOut.model_validate(s) for s in item.sets if s.deleted_at is None]
        exercises.append(
            WorkoutExerciseOut(
                id=item.id,
                exercise_id=item.exercise_id,
                exercise_name=item.exercise.name,
                position=item.position,
                notes=item.notes,
                updated_at=item.updated_at,
                sets=sets,
            )
        )
    return WorkoutOut(
        id=row.id,
        name=row.name,
        notes=row.notes,
        archived_at=row.archived_at,
        updated_at=row.updated_at,
        exercises=exercises,
    )


async def create_workout(db: AsyncSession, user_id: UUID, body: WorkoutIn) -> Workout:
    await assert_workout_name(db, user_id, body.name)
    row = Workout(
        id=body.id or uuid.uuid4(),
        user_id=user_id,
        name=body.name.strip(),
        notes=body.notes,
        created_at=now(),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise DomainError(409, "You already have a workout with that name") from exc
    await db.refresh(row)
    return row


async def update_workout(db: AsyncSession, user_id: UUID, workout_id: UUID, body: WorkoutPatch) -> Workout:
    row = await db.get(Workout, workout_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    ensure_optional_match(row, body.base_updated_at, WorkoutSummary)
    if body.name is not None and body.name.strip().lower() != row.name.lower():
        await assert_workout_name(db, user_id, body.name, exclude=row.id)
        row.name = body.name.strip()
    if body.notes is not None:
        row.notes = body.notes
    if body.archived is True:
        row.archived_at = row.archived_at or now()
    elif body.archived is False:
        await assert_workout_name(db, user_id, row.name, exclude=row.id)
        row.archived_at = None
    await db.flush()
    await db.refresh(row)
    return await get_workout(db, user_id, row.id)


async def delete_workout(db: AsyncSession, user_id: UUID, workout_id: UUID) -> None:
    row = await get_workout(db, user_id, workout_id)
    for item in row.exercises:
        if item.deleted_at is not None:
            continue
        for planned in item.sets:
            if planned.deleted_at is None:
                mark_deleted(planned)
        mark_deleted(item)
    mark_deleted(row)
    await db.flush()


async def add_workout_exercise(db: AsyncSession, user_id: UUID, workout_id: UUID, body: WorkoutExerciseIn) -> WorkoutExercise:
    workout = await db.get(Workout, workout_id)
    if workout is None or workout.deleted_at is not None or workout.user_id != user_id:
        raise DomainError(404, "Not found")
    await visible_exercise(db, user_id, body.exercise_id)
    duplicate = await db.scalar(
        select(WorkoutExercise.id).where(
            WorkoutExercise.workout_id == workout_id,
            WorkoutExercise.exercise_id == body.exercise_id,
            WorkoutExercise.deleted_at.is_(None),
        )
    )
    if duplicate:
        raise DomainError(409, "That exercise is already on this workout")
    position = body.position if body.position is not None else await next_position(db, WorkoutExercise, WorkoutExercise.workout_id, workout_id)
    row = WorkoutExercise(
        id=body.id or uuid.uuid4(),
        user_id=user_id,
        workout_id=workout_id,
        exercise_id=body.exercise_id,
        position=position,
        notes=body.notes,
        created_at=now(),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_workout_exercise(db: AsyncSession, user_id: UUID, item_id: UUID, body: WorkoutExercisePatch) -> WorkoutExercise:
    row = await db.get(WorkoutExercise, item_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    if body.base_updated_at is not None and not timestamps_match(row.updated_at, body.base_updated_at):
        conflict(row, WORKOUT_EXERCISE_FIELDS)
    if body.notes is not None:
        row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


async def delete_workout_exercise(db: AsyncSession, user_id: UUID, item_id: UUID) -> None:
    row = await db.get(WorkoutExercise, item_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    sets = (
        await db.scalars(
            select(WorkoutSet).where(WorkoutSet.workout_exercise_id == row.id, WorkoutSet.deleted_at.is_(None))
        )
    ).all()
    for planned in sets:
        mark_deleted(planned)
    mark_deleted(row)
    await db.flush()


def apply_plan_fields(row: WorkoutSet, *, kind, target_reps, target_weight, target_unit, target_percent, target_rpe, rest_seconds) -> None:
    if target_weight is not None and target_percent is not None:
        raise DomainError(400, "Use a target weight or a percent, not both")
    if target_weight is not None and target_unit is None:
        raise DomainError(400, "A unit is required with weight")
    check_rpe(float(target_rpe) if target_rpe is not None else None)
    row.kind = kind
    row.target_reps = target_reps
    row.target_weight = target_weight
    row.target_unit = target_unit
    row.target_percent = target_percent
    row.target_rpe = target_rpe
    row.rest_seconds = rest_seconds


async def add_workout_set(db: AsyncSession, user_id: UUID, item_id: UUID, body: WorkoutSetIn) -> WorkoutSet:
    parent = await db.get(WorkoutExercise, item_id)
    if parent is None or parent.deleted_at is not None or parent.user_id != user_id:
        raise DomainError(404, "Not found")
    row = WorkoutSet(
        id=body.id or uuid.uuid4(),
        user_id=user_id,
        workout_exercise_id=parent.id,
        position=await next_position(db, WorkoutSet, WorkoutSet.workout_exercise_id, parent.id),
        created_at=now(),
    )
    apply_plan_fields(
        row,
        kind=body.kind,
        target_reps=body.target_reps,
        target_weight=body.target_weight,
        target_unit=body.target_unit,
        target_percent=body.target_percent,
        target_rpe=body.target_rpe,
        rest_seconds=body.rest_seconds,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_workout_set(db: AsyncSession, user_id: UUID, set_id: UUID, body: WorkoutSetPatch) -> WorkoutSet:
    row = await db.get(WorkoutSet, set_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    ensure_optional_match(row, body.base_updated_at, WorkoutSetOut)
    kind = body.kind or row.kind
    target_reps = body.target_reps if body.target_reps is not None else row.target_reps
    target_weight = None if body.clear_weight else (body.target_weight if body.target_weight is not None else row.target_weight)
    target_unit = body.target_unit or row.target_unit
    if body.clear_weight:
        target_unit = body.target_unit
    target_percent = None if body.clear_percent else (body.target_percent if body.target_percent is not None else row.target_percent)
    target_rpe = body.target_rpe if body.target_rpe is not None else row.target_rpe
    rest_seconds = body.rest_seconds if body.rest_seconds is not None else row.rest_seconds
    if target_weight is not None and target_unit is None:
        raise DomainError(400, "A unit is required with weight")
    apply_plan_fields(
        row,
        kind=kind,
        target_reps=target_reps,
        target_weight=float(target_weight) if target_weight is not None else None,
        target_unit=target_unit,
        target_percent=float(target_percent) if target_percent is not None else None,
        target_rpe=float(target_rpe) if target_rpe is not None else None,
        rest_seconds=rest_seconds,
    )
    await db.flush()
    await db.refresh(row)
    return row


async def delete_workout_set(db: AsyncSession, user_id: UUID, set_id: UUID) -> None:
    row = await db.get(WorkoutSet, set_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    mark_deleted(row)
    await db.flush()


async def reorder_workout_exercises(db: AsyncSession, user_id: UUID, workout_id: UUID, ids: list[UUID]) -> Workout:
    await get_workout(db, user_id, workout_id)
    await reorder(db, WorkoutExercise, WorkoutExercise.workout_id, workout_id, ids)
    await db.flush()
    return await get_workout(db, user_id, workout_id)


async def reorder_workout_sets(db: AsyncSession, user_id: UUID, item_id: UUID, ids: list[UUID]) -> None:
    parent = await db.get(WorkoutExercise, item_id)
    if parent is None or parent.deleted_at is not None or parent.user_id != user_id:
        raise DomainError(404, "Not found")
    await reorder(db, WorkoutSet, WorkoutSet.workout_exercise_id, item_id, ids)
    await db.flush()


async def get_session(db: AsyncSession, user_id: UUID, session_id: UUID) -> Session:
    stmt = (
        select(Session)
        .where(Session.id == session_id, Session.user_id == user_id, Session.deleted_at.is_(None))
        .options(
            selectinload(Session.exercises).selectinload(SessionExercise.sets),
            selectinload(Session.exercises).selectinload(SessionExercise.exercise),
        )
    )
    row = (await db.scalars(stmt)).unique().one_or_none()
    if row is None:
        raise DomainError(404, "Not found")
    return row


async def previous_sets(db: AsyncSession, user_id: UUID, exercise_ids: list[UUID], before: datetime) -> dict[UUID, list[SessionSetOut]]:
    if not exercise_ids:
        return {}
    result = await db.execute(
        text(
            """
            select distinct on (se.exercise_id) se.exercise_id, se.id
            from session_exercises se
            join sessions s on s.id = se.session_id
            where se.user_id = :uid
              and se.exercise_id in :eids
              and se.deleted_at is null
              and s.deleted_at is null
              and s.status = 'completed'
              and s.started_at < :before
            order by se.exercise_id, s.started_at desc
            """
        ).bindparams(bindparam("eids", expanding=True)),
        {"uid": user_id, "eids": exercise_ids, "before": before},
    )
    chosen = {row.exercise_id: row.id for row in result}
    if not chosen:
        return {}
    sets = (
        await db.scalars(
            select(SessionSet)
            .where(SessionSet.session_exercise_id.in_(list(chosen.values())), SessionSet.deleted_at.is_(None))
            .order_by(SessionSet.position)
        )
    ).all()
    grouped: dict[UUID, list[SessionSetOut]] = {exercise_id: [] for exercise_id in chosen}
    by_session_exercise = {session_exercise_id: exercise_id for exercise_id, session_exercise_id in chosen.items()}
    for item in sets:
        grouped[by_session_exercise[item.session_exercise_id]].append(SessionSetOut.model_validate(item))
    return grouped


def present_session(row: Session, history: dict[UUID, list[SessionSetOut]] | None = None) -> SessionOut:
    history = history or {}
    exercises = []
    for item in row.exercises:
        if item.deleted_at is not None:
            continue
        sets = [SessionSetOut.model_validate(s) for s in item.sets if s.deleted_at is None]
        exercises.append(
            SessionExerciseOut(
                id=item.id,
                exercise_id=item.exercise_id,
                exercise_name=item.exercise.name,
                position=item.position,
                notes=item.notes,
                updated_at=item.updated_at,
                sets=sets,
                previous_sets=history.get(item.exercise_id, []),
            )
        )
    return SessionOut(
        id=row.id,
        workout_id=row.workout_id,
        name=row.name,
        status=row.status,
        started_at=row.started_at,
        ended_at=row.ended_at,
        notes=row.notes,
        updated_at=row.updated_at,
        exercises=exercises,
    )


async def present_session_with_history(db: AsyncSession, row: Session) -> SessionOut:
    exercise_ids = [item.exercise_id for item in row.exercises if item.deleted_at is None]
    history = await previous_sets(db, row.user_id, exercise_ids, row.started_at)
    return present_session(row, history)


async def list_sessions(db: AsyncSession, user_id: UUID, status: SessionStatus | None) -> list[Session]:
    stmt = select(Session).where(Session.user_id == user_id, Session.deleted_at.is_(None))
    if status is not None:
        stmt = stmt.where(Session.status == status)
    stmt = stmt.order_by(Session.started_at.desc())
    return list((await db.scalars(stmt)).all())


async def start_session(db: AsyncSession, user_id: UUID, body: SessionIn) -> Session:
    profile = await require_profile(db, user_id)
    name = body.name.strip()
    workout_id = body.workout_id
    started = body.started_at or now()
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    session = Session(
        id=body.id or uuid.uuid4(),
        user_id=user_id,
        workout_id=workout_id,
        name=name,
        status=SessionStatus.in_progress,
        started_at=started,
        notes=body.notes,
        created_at=now(),
    )
    if workout_id is not None:
        workout = await get_workout(db, user_id, workout_id)
        if workout.archived_at is not None:
            raise DomainError(400, "That workout is archived")
        session.name = name or workout.name
        db.add(session)
        await db.flush()
        for item in workout.exercises:
            if item.deleted_at is not None:
                continue
            reference_kg, _source = await reference_max(db, user_id, item.exercise_id)
            session_exercise = SessionExercise(
                id=uuid.uuid4(),
                user_id=user_id,
                session_id=session.id,
                exercise_id=item.exercise_id,
                position=item.position,
                notes=item.notes,
                created_at=now(),
            )
            db.add(session_exercise)
            await db.flush()
            for planned in item.sets:
                if planned.deleted_at is not None:
                    continue
                target_weight = float(planned.target_weight) if planned.target_weight is not None else None
                target_unit = planned.target_unit
                target_percent = float(planned.target_percent) if planned.target_percent is not None else None
                if target_percent is not None and reference_kg is not None:
                    target_weight = from_kilograms(reference_kg * target_percent / 100, profile.unit_preference.value)
                    target_unit = profile.unit_preference
                copied = SessionSet(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    session_exercise_id=session_exercise.id,
                    position=planned.position,
                    kind=planned.kind,
                    target_reps=planned.target_reps,
                    target_weight=target_weight,
                    target_unit=target_unit,
                    target_percent=target_percent,
                    target_rpe=planned.target_rpe,
                    rest_seconds=planned.rest_seconds,
                    notes="",
                    skipped=False,
                    created_at=now(),
                )
                db.add(copied)
        await db.flush()
    else:
        if not session.name:
            session.name = "Workout"
        db.add(session)
        await db.flush()
    await db.refresh(session)
    return await get_session(db, user_id, session.id)


async def update_session(db: AsyncSession, user_id: UUID, session_id: UUID, body: SessionPatch) -> Session:
    row = await db.get(Session, session_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    ensure_optional_match(row, body.base_updated_at, SessionSummary)
    if body.name is not None:
        row.name = body.name
    if body.notes is not None:
        row.notes = body.notes
    if body.status is not None:
        row.status = body.status
        if body.status == SessionStatus.in_progress:
            row.ended_at = None
        elif row.ended_at is None:
            row.ended_at = body.ended_at or now()
    if body.ended_at is not None and row.status != SessionStatus.in_progress:
        row.ended_at = body.ended_at
    await db.flush()
    await db.refresh(row)
    return await get_session(db, user_id, row.id)


async def delete_session(db: AsyncSession, user_id: UUID, session_id: UUID) -> None:
    row = await get_session(db, user_id, session_id)
    for item in row.exercises:
        if item.deleted_at is not None:
            continue
        for performed in item.sets:
            if performed.deleted_at is None:
                mark_deleted(performed)
        mark_deleted(item)
    mark_deleted(row)
    await db.flush()


async def add_session_exercise(db: AsyncSession, user_id: UUID, session_id: UUID, body: SessionExerciseIn) -> SessionExercise:
    session = await db.get(Session, session_id)
    if session is None or session.deleted_at is not None or session.user_id != user_id:
        raise DomainError(404, "Not found")
    await visible_exercise(db, user_id, body.exercise_id)
    position = body.position if body.position is not None else await next_position(db, SessionExercise, SessionExercise.session_id, session_id)
    row = SessionExercise(
        id=body.id or uuid.uuid4(),
        user_id=user_id,
        session_id=session_id,
        exercise_id=body.exercise_id,
        position=position,
        notes=body.notes,
        created_at=now(),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_session_exercise(db: AsyncSession, user_id: UUID, item_id: UUID, body: SessionExercisePatch) -> SessionExercise:
    row = await db.get(SessionExercise, item_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    if body.base_updated_at is not None and not timestamps_match(row.updated_at, body.base_updated_at):
        conflict(row, SESSION_EXERCISE_FIELDS)
    if body.notes is not None:
        row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


async def delete_session_exercise(db: AsyncSession, user_id: UUID, item_id: UUID) -> None:
    row = await db.get(SessionExercise, item_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    sets = (
        await db.scalars(select(SessionSet).where(SessionSet.session_exercise_id == row.id, SessionSet.deleted_at.is_(None)))
    ).all()
    for performed in sets:
        await delete_media_for_set(db, performed.id)
        mark_deleted(performed)
    mark_deleted(row)
    await db.flush()


def apply_performed(row: SessionSet, body: SessionSetIn | SessionSetPatch, *, creating: bool) -> None:
    if isinstance(body, SessionSetIn) or creating:
        data = body if isinstance(body, SessionSetIn) else None
    if creating and isinstance(body, SessionSetIn):
        check_rpe(body.target_rpe)
        check_rpe(body.rpe)
        if body.target_weight is not None and body.target_unit is None:
            raise DomainError(400, "A unit is required with weight")
        row.kind = body.kind
        row.target_reps = body.target_reps
        row.target_weight = body.target_weight
        row.target_unit = body.target_unit
        row.target_percent = body.target_percent
        row.target_rpe = body.target_rpe
        row.rest_seconds = body.rest_seconds
        row.notes = body.notes
        row.actual_reps = body.actual_reps
        if body.actual_weight is not None:
            if body.actual_unit is None:
                raise DomainError(400, "A unit is required with weight")
            row.actual_weight = body.actual_weight
            row.actual_unit = body.actual_unit
            row.weight_kg = to_kilograms(body.actual_weight, body.actual_unit.value)
        row.rpe = body.rpe
        row.skipped = body.skipped
        if body.completed:
            if body.skipped:
                raise DomainError(400, "A skipped set cannot be completed")
            if row.actual_reps is None or row.actual_weight is None:
                raise DomainError(400, "Reps and weight are required to complete a set")
            row.completed_at = now()
        return

    patch = body
    assert isinstance(patch, SessionSetPatch)
    if patch.kind is not None:
        row.kind = patch.kind
    if patch.rest_seconds is not None:
        row.rest_seconds = patch.rest_seconds
    if patch.notes is not None:
        row.notes = patch.notes
    if patch.rpe is not None or "rpe" in patch.model_fields_set:
        check_rpe(patch.rpe)
        row.rpe = patch.rpe
    if patch.clear_actuals:
        row.actual_reps = None
        row.actual_weight = None
        row.actual_unit = None
        row.weight_kg = None
        row.completed_at = None
    else:
        if patch.actual_reps is not None:
            row.actual_reps = patch.actual_reps
        if patch.actual_weight is not None:
            unit = patch.actual_unit or row.actual_unit
            if unit is None:
                raise DomainError(400, "A unit is required with weight")
            row.actual_weight = patch.actual_weight
            row.actual_unit = unit
            row.weight_kg = to_kilograms(patch.actual_weight, enum_value(unit))
        elif patch.actual_unit is not None and row.actual_weight is not None:
            row.actual_unit = patch.actual_unit
            row.weight_kg = to_kilograms(float(row.actual_weight), patch.actual_unit.value)
    if patch.skipped is True:
        row.skipped = True
        row.completed_at = None
    elif patch.skipped is False:
        row.skipped = False
    if patch.completed is True:
        if row.skipped:
            raise DomainError(400, "A skipped set cannot be completed")
        if row.actual_reps is None or row.actual_weight is None:
            raise DomainError(400, "Reps and weight are required to complete a set")
        row.completed_at = row.completed_at or now()
    elif patch.completed is False:
        row.completed_at = None


async def add_session_set(db: AsyncSession, user_id: UUID, item_id: UUID, body: SessionSetIn) -> SessionSet:
    parent = await db.get(SessionExercise, item_id)
    if parent is None or parent.deleted_at is not None or parent.user_id != user_id:
        raise DomainError(404, "Not found")
    row = SessionSet(
        id=body.id or uuid.uuid4(),
        user_id=user_id,
        session_exercise_id=parent.id,
        position=await next_position(db, SessionSet, SessionSet.session_exercise_id, parent.id),
        created_at=now(),
        notes="",
        skipped=False,
    )
    apply_performed(row, body, creating=True)
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_session_set(db: AsyncSession, user_id: UUID, set_id: UUID, body: SessionSetPatch) -> SessionSet:
    row = await db.get(SessionSet, set_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    ensure_optional_match(row, body.base_updated_at, SessionSetOut)
    apply_performed(row, body, creating=False)
    await db.flush()
    await db.refresh(row)
    return row


async def delete_session_set(db: AsyncSession, user_id: UUID, set_id: UUID) -> None:
    row = await db.get(SessionSet, set_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    await delete_media_for_set(db, row.id)
    mark_deleted(row)
    await db.flush()


async def delete_media_for_set(db: AsyncSession, set_id: UUID) -> SetMedia | None:
    media = await db.scalar(select(SetMedia).where(SetMedia.session_set_id == set_id, SetMedia.deleted_at.is_(None)))
    if media is not None:
        mark_deleted(media)
    return media


async def progress(db: AsyncSession, user_id: UUID, exercise_id: UUID) -> ProgressOut:
    await visible_exercise(db, user_id, exercise_id)
    reference_kg, source = await reference_max(db, user_id, exercise_id)
    result = await db.execute(
        text(
            """
            select s.id, s.started_at, ss.weight_kg, ss.actual_reps, ss.kind, ss.skipped, ss.completed_at
            from sessions s
            join session_exercises se on se.session_id = s.id and se.deleted_at is null
            join session_sets ss on ss.session_exercise_id = se.id and ss.deleted_at is null
            where s.user_id = :uid
              and se.exercise_id = :eid
              and s.deleted_at is null
              and s.status = 'completed'
            order by s.started_at
            """
        ),
        {"uid": user_id, "eid": exercise_id},
    )
    grouped: dict[UUID, dict] = {}
    for session_id, started_at, weight_kg, reps, kind, skipped, completed_at in result:
        bucket = grouped.setdefault(session_id, {"started_at": started_at, "sets": []})
        if weight_kg is None or reps is None:
            continue
        bucket["sets"].append(
            PerformedSet(
                weight_kg=float(weight_kg),
                reps=int(reps),
                kind=str(kind),
                skipped=bool(skipped),
                completed=completed_at is not None,
            )
        )
    points = []
    for session_id, bucket in grouped.items():
        summary = summarize_sets(bucket["sets"], reference_kg)
        if summary["best_e1rm_kg"] is None and summary["volume_kg"] == 0:
            continue
        points.append(
            ProgressPoint(
                session_id=session_id,
                started_at=bucket["started_at"],
                best_e1rm_kg=summary["best_e1rm_kg"],
                volume_kg=summary["volume_kg"],
                top_set_weight_kg=summary["top_set_weight_kg"],
                top_set_percent=summary["top_set_percent"],
            )
        )
    return ProgressOut(exercise_id=exercise_id, reference_kg=reference_kg, reference_source=source, points=points)


async def live_media(db: AsyncSession, set_id: UUID) -> SetMedia | None:
    return await db.scalar(select(SetMedia).where(SetMedia.session_set_id == set_id, SetMedia.deleted_at.is_(None)))


async def owned_set(db: AsyncSession, user_id: UUID, set_id: UUID) -> SessionSet:
    row = await db.get(SessionSet, set_id)
    if row is None or row.deleted_at is not None or row.user_id != user_id:
        raise DomainError(404, "Not found")
    return row


def present_media(row: SetMedia, playback_url: str | None = None) -> MediaOut:
    return MediaOut(
        id=row.id,
        session_set_id=row.session_set_id,
        content_type=row.content_type,
        byte_size=row.byte_size,
        duration_seconds=float(row.duration_seconds) if row.duration_seconds is not None else None,
        status=row.status,
        playback_url=playback_url,
        updated_at=row.updated_at,
    )


async def request_upload(db, user_id, set_id, content_type, byte_size, duration, storage, settings):
    if content_type not in ALLOWED_VIDEO_TYPES:
        raise DomainError(400, "Only mp4 and quicktime videos are allowed")
    if byte_size > settings.media_max_bytes:
        raise DomainError(400, "Video is larger than 100 MB")
    if not getattr(storage, "configured", False):
        raise DomainError(503, "Object storage is not configured")
    await owned_set(db, user_id, set_id)
    existing = await live_media(db, set_id)
    if existing is not None and existing.storage_key:
        storage.delete_key(existing.storage_key)
    key = f"users/{user_id}/sets/{set_id}/{uuid.uuid4()}"
    if existing is None:
        existing = SetMedia(
            id=uuid.uuid4(),
            user_id=user_id,
            session_set_id=set_id,
            created_at=now(),
        )
        db.add(existing)
    existing.storage_key = key
    existing.content_type = content_type
    existing.byte_size = byte_size
    existing.duration_seconds = duration
    existing.status = MediaStatus.uploading
    await db.flush()
    await db.refresh(existing)
    return existing, storage.presign_put(key, content_type)


async def confirm_upload(db, user_id, set_id, duration, storage, settings):
    await owned_set(db, user_id, set_id)
    media = await live_media(db, set_id)
    if media is None or media.user_id != user_id or not media.storage_key:
        raise DomainError(404, "Not found")
    head = storage.head(media.storage_key)
    if head is None or head.content_type not in ALLOWED_VIDEO_TYPES or head.size != media.byte_size or head.size > settings.media_max_bytes:
        media.status = MediaStatus.failed
        await db.flush()
        raise DomainError(400, "Upload did not match the declared video")
    media.status = MediaStatus.ready
    if duration is not None:
        media.duration_seconds = duration
    await db.flush()
    await db.refresh(media)
    return media


async def delete_account(db: AsyncSession, user_id: UUID, storage, settings) -> None:
    storage.delete_prefix(f"users/{user_id}/")
    if settings.supabase_url and settings.service_role_key:
        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
                headers={"Authorization": f"Bearer {settings.service_role_key}", "apikey": settings.service_role_key},
                timeout=20,
            )
        if response.status_code not in (200, 204, 404):
            raise DomainError(502, "Could not delete the auth user")
        return
    await db.execute(text("delete from auth.sessions where user_id = :id"), {"id": user_id})
    await db.execute(text("delete from auth.users where id = :id"), {"id": user_id})
