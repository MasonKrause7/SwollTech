import json
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from swolltech.auth import current_user_id, mint_dev_token
from swolltech.config import Settings, get_settings
from swolltech.db import get_db
from swolltech.errors import DomainError
from swolltech.models import SessionStatus
from swolltech.rate_limit import limiter
from swolltech.schemas import (
    CatalogOut,
    DevTokenIn,
    DevTokenOut,
    ExerciseIn,
    ExerciseOut,
    ExercisePatch,
    MediaConfirmIn,
    MediaOut,
    MediaUploadIn,
    MediaUploadOut,
    OverviewOut,
    ProfileOut,
    ProfilePatch,
    ProgressOut,
    ReferenceIn,
    ReferenceOut,
    ReorderIn,
    SessionExerciseIn,
    SessionExercisePatch,
    SessionIn,
    SessionOut,
    SessionPatch,
    SessionSetIn,
    SessionSetOut,
    SessionSetPatch,
    SessionSummary,
    SessionSummaryOut,
    SyncIn,
    SyncOut,
    WorkoutExerciseIn,
    WorkoutExercisePatch,
    WorkoutIn,
    WorkoutOut,
    WorkoutPatch,
    WorkoutSetIn,
    WorkoutSetOut,
    WorkoutSetPatch,
    WorkoutSummary,
)
from swolltech.services import insights, store, syncing
from swolltech.storage import build_storage

router = APIRouter(prefix="/v1")
_storage = None


def get_storage(settings: Settings = Depends(get_settings)):
    global _storage
    if _storage is None:
        _storage = build_storage(settings)
    return _storage


def set_storage(storage) -> None:
    global _storage
    _storage = storage


@router.get("/me", response_model=ProfileOut)
async def get_me(user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.require_profile(db, user_id)


@router.patch("/me", response_model=ProfileOut)
async def patch_me(body: ProfilePatch, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.update_profile(db, user_id, body)


@router.delete("/me", status_code=204)
async def delete_me(
    user_id: UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    storage=Depends(get_storage),
):
    limiter.hit(f"delete:{user_id}", 5, 3600)
    await store.delete_account(db, user_id, storage, settings)
    return Response(status_code=204)


@router.post("/dev/token", response_model=DevTokenOut)
async def dev_token(body: DevTokenIn, db: AsyncSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    if not settings.dev_token_enabled:
        raise DomainError(404, "Not found")
    limiter.hit(f"dev:{body.email}", 20, 60)
    existing = await db.scalar(text("select id from auth.users where lower(email) = lower(:email)"), {"email": body.email})
    if existing:
        user_id = existing
    else:
        user_id = uuid.uuid4()
        await db.execute(
            text(
                """
                insert into auth.users (id, email, raw_user_meta_data)
                values (:id, :email, cast(:meta as jsonb))
                """
            ),
            {"id": user_id, "email": body.email, "meta": json.dumps({"display_name": body.display_name})},
        )
        await db.flush()
    return DevTokenOut(access_token=mint_dev_token(user_id, settings), user_id=user_id, email=body.email)


@router.get("/catalog", response_model=CatalogOut)
async def get_catalog(user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    version, exercises = await store.catalog(db, user_id)
    return CatalogOut(version=version, exercises=[ExerciseOut.model_validate(item) for item in exercises])


@router.get("/exercises", response_model=list[ExerciseOut])
async def get_exercises(q: str | None = None, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    rows = await store.list_exercises(db, user_id, q)
    return [ExerciseOut.model_validate(item) for item in rows]


@router.post("/exercises", response_model=ExerciseOut, status_code=201)
async def post_exercise(body: ExerciseIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.create_exercise(db, user_id, body)


@router.patch("/exercises/{exercise_id}", response_model=ExerciseOut)
async def patch_exercise(exercise_id: UUID, body: ExercisePatch, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.update_exercise(db, user_id, exercise_id, body)


@router.delete("/exercises/{exercise_id}", status_code=204)
async def remove_exercise(exercise_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.archive_exercise(db, user_id, exercise_id)
    return Response(status_code=204)


@router.get("/exercises/{exercise_id}/reference", response_model=ReferenceOut)
async def get_reference(exercise_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    row = await store.get_reference(db, user_id, exercise_id)
    if row is None:
        raise DomainError(404, "Not found")
    return row


@router.put("/exercises/{exercise_id}/reference", response_model=ReferenceOut)
async def put_reference(exercise_id: UUID, body: ReferenceIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.put_reference(db, user_id, exercise_id, body)


@router.delete("/exercises/{exercise_id}/reference", status_code=204)
async def remove_reference(exercise_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.delete_reference(db, user_id, exercise_id)
    return Response(status_code=204)


@router.get("/exercises/{exercise_id}/progress", response_model=ProgressOut)
async def get_progress(exercise_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.progress(db, user_id, exercise_id)


@router.get("/workouts", response_model=list[WorkoutSummary])
async def get_workouts(user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.list_workouts(db, user_id)


@router.post("/workouts", response_model=WorkoutSummary, status_code=201)
async def post_workout(body: WorkoutIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.create_workout(db, user_id, body)


@router.get("/workouts/{workout_id}", response_model=WorkoutOut)
async def get_workout(workout_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return store.present_workout(await store.get_workout(db, user_id, workout_id))


@router.patch("/workouts/{workout_id}", response_model=WorkoutOut)
async def patch_workout(workout_id: UUID, body: WorkoutPatch, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return store.present_workout(await store.update_workout(db, user_id, workout_id, body))


@router.delete("/workouts/{workout_id}", status_code=204)
async def remove_workout(workout_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.delete_workout(db, user_id, workout_id)
    return Response(status_code=204)


@router.post("/workouts/{workout_id}/exercises", response_model=WorkoutOut, status_code=201)
async def post_workout_exercise(workout_id: UUID, body: WorkoutExerciseIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.add_workout_exercise(db, user_id, workout_id, body)
    return store.present_workout(await store.get_workout(db, user_id, workout_id))


@router.post("/workouts/{workout_id}/reorder", response_model=WorkoutOut)
async def reorder_workout(workout_id: UUID, body: ReorderIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return store.present_workout(await store.reorder_workout_exercises(db, user_id, workout_id, body.ids))


@router.patch("/workout-exercises/{item_id}", response_model=WorkoutExercisePatch)
async def patch_workout_exercise(item_id: UUID, body: WorkoutExercisePatch, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.update_workout_exercise(db, user_id, item_id, body)
    return body


@router.delete("/workout-exercises/{item_id}", status_code=204)
async def remove_workout_exercise(item_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.delete_workout_exercise(db, user_id, item_id)
    return Response(status_code=204)


@router.post("/workout-exercises/{item_id}/sets", response_model=WorkoutSetOut, status_code=201)
async def post_workout_set(item_id: UUID, body: WorkoutSetIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.add_workout_set(db, user_id, item_id, body)


@router.post("/workout-exercises/{item_id}/reorder-sets", status_code=204)
async def reorder_sets(item_id: UUID, body: ReorderIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.reorder_workout_sets(db, user_id, item_id, body.ids)
    return Response(status_code=204)


@router.patch("/workout-sets/{set_id}", response_model=WorkoutSetOut)
async def patch_workout_set(set_id: UUID, body: WorkoutSetPatch, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.update_workout_set(db, user_id, set_id, body)


@router.delete("/workout-sets/{set_id}", status_code=204)
async def remove_workout_set(set_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.delete_workout_set(db, user_id, set_id)
    return Response(status_code=204)


@router.get("/sessions", response_model=list[SessionSummary])
async def get_sessions(status: SessionStatus | None = None, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.list_sessions(db, user_id, status)


@router.post("/sessions", response_model=SessionOut, status_code=201)
async def post_session(body: SessionIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    row = await store.start_session(db, user_id, body)
    return await store.present_session_with_history(db, row)


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(session_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.present_session_with_history(db, await store.get_session(db, user_id, session_id))


@router.get("/sessions/{session_id}/summary", response_model=SessionSummaryOut)
async def get_session_summary(session_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await insights.get_session_summary(db, user_id, session_id)


@router.get("/stats/overview", response_model=OverviewOut)
async def get_overview(tz: str | None = None, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await insights.get_overview(db, user_id, tz)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def patch_session(session_id: UUID, body: SessionPatch, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    row = await store.update_session(db, user_id, session_id, body)
    return await store.present_session_with_history(db, row)


@router.delete("/sessions/{session_id}", status_code=204)
async def remove_session(session_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.delete_session(db, user_id, session_id)
    return Response(status_code=204)


@router.post("/sessions/{session_id}/exercises", response_model=SessionOut, status_code=201)
async def post_session_exercise(session_id: UUID, body: SessionExerciseIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.add_session_exercise(db, user_id, session_id, body)
    return await store.present_session_with_history(db, await store.get_session(db, user_id, session_id))


@router.patch("/session-exercises/{item_id}", response_model=SessionExercisePatch)
async def patch_session_exercise(item_id: UUID, body: SessionExercisePatch, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.update_session_exercise(db, user_id, item_id, body)
    return body


@router.delete("/session-exercises/{item_id}", status_code=204)
async def remove_session_exercise(item_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.delete_session_exercise(db, user_id, item_id)
    return Response(status_code=204)


@router.post("/session-exercises/{item_id}/sets", response_model=SessionSetOut, status_code=201)
async def post_session_set(item_id: UUID, body: SessionSetIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.add_session_set(db, user_id, item_id, body)


@router.patch("/session-sets/{set_id}", response_model=SessionSetOut)
async def patch_session_set(set_id: UUID, body: SessionSetPatch, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    return await store.update_session_set(db, user_id, set_id, body)


@router.delete("/session-sets/{set_id}", status_code=204)
async def remove_session_set(set_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    await store.delete_session_set(db, user_id, set_id)
    return Response(status_code=204)


@router.post("/session-sets/{set_id}/media/upload-url", response_model=MediaUploadOut)
async def upload_url(
    set_id: UUID,
    body: MediaUploadIn,
    user_id: UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    storage=Depends(get_storage),
):
    limiter.hit(f"presign:{user_id}", 30, 60)
    media, url = await store.request_upload(db, user_id, set_id, body.content_type, body.byte_size, body.duration_seconds, storage, settings)
    return MediaUploadOut(media_id=media.id, upload_url=url, storage_key=media.storage_key, headers={"Content-Type": body.content_type})


@router.post("/session-sets/{set_id}/media/confirm", response_model=MediaOut)
async def confirm_media(
    set_id: UUID,
    body: MediaConfirmIn,
    user_id: UUID = Depends(current_user_id),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    storage=Depends(get_storage),
):
    media = await store.confirm_upload(db, user_id, set_id, body.duration_seconds, storage, settings)
    playback = storage.presign_get(media.storage_key) if media.storage_key else None
    return store.present_media(media, playback)


@router.get("/session-sets/{set_id}/media", response_model=MediaOut)
async def get_media(set_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db), storage=Depends(get_storage)):
    await store.owned_set(db, user_id, set_id)
    media = await store.live_media(db, set_id)
    if media is None or media.user_id != user_id:
        raise DomainError(404, "Not found")
    playback = None
    if media.status.value == "ready" and media.storage_key and getattr(storage, "configured", False):
        playback = storage.presign_get(media.storage_key)
    return store.present_media(media, playback)


@router.delete("/session-sets/{set_id}/media", status_code=204)
async def remove_media(set_id: UUID, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db), storage=Depends(get_storage)):
    await store.owned_set(db, user_id, set_id)
    media = await store.delete_media_for_set(db, set_id)
    if media is None:
        raise DomainError(404, "Not found")
    if media.storage_key:
        storage.delete_key(media.storage_key)
    return Response(status_code=204)


@router.post("/sync", response_model=SyncOut)
async def post_sync(body: SyncIn, user_id: UUID = Depends(current_user_id), db: AsyncSession = Depends(get_db)):
    limiter.hit(f"sync:{user_id}", 60, 60)
    return await syncing.sync(db, user_id, body.cursor, body.mutations)
