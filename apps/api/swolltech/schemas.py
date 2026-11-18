from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from swolltech.models import MediaStatus, SessionStatus, SetKind, WeightUnit

# Upper bounds on everything a client can write. Without them a typo (or a fuzzer) can
# overflow a numeric column, and on /v1/sync that one bad change used to fail the whole
# request on every retry. 2000 is far past any real lift in either unit and still fits
# numeric(12, 6) after converting pounds to kilograms.
MAX_WEIGHT = 2000
MAX_REPS = 1000
MAX_REST_SECONDS = 3600
MAX_POSITION = 100_000
MAX_NOTES = 2000
MAX_NAME = 80
MAX_LABEL = 40

Weight = Annotated[float, Field(ge=0, le=MAX_WEIGHT)]
PositiveWeight = Annotated[float, Field(gt=0, le=MAX_WEIGHT)]
Reps = Annotated[int, Field(ge=1, le=MAX_REPS)]
# Steps of 0.5 are checked by check_rpe, which gives a clearer message.
Rpe = Annotated[float, Field(ge=1, le=10)]
Percent = Annotated[float, Field(ge=1, le=120)]
Rest = Annotated[int, Field(ge=0, le=MAX_REST_SECONDS)]
Position = Annotated[int, Field(ge=0, le=MAX_POSITION)]
Notes = Annotated[str, Field(max_length=MAX_NOTES)]
Name = Annotated[str, Field(max_length=MAX_NAME)]
Label = Annotated[str, Field(max_length=MAX_LABEL)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProfileOut(ORMModel):
    id: UUID
    display_name: str
    unit_preference: WeightUnit
    updated_at: datetime


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    unit_preference: WeightUnit | None = None
    base_updated_at: datetime | None = None


class ExerciseOut(ORMModel):
    id: UUID
    owner_id: UUID | None
    name: str
    primary_muscle: str
    equipment: str
    updated_at: datetime


class ExerciseIn(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=80)
    primary_muscle: str = Field(default="", max_length=40)
    equipment: str = Field(default="", max_length=40)


class ExercisePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    primary_muscle: str | None = Field(default=None, max_length=40)
    equipment: str | None = Field(default=None, max_length=40)
    base_updated_at: datetime | None = None


class CatalogOut(BaseModel):
    version: int
    exercises: list[ExerciseOut]


class ReferenceIn(BaseModel):
    id: UUID | None = None
    weight: PositiveWeight
    unit: WeightUnit
    noted_on: date
    base_updated_at: datetime | None = None


class ReferenceOut(ORMModel):
    id: UUID
    exercise_id: UUID
    weight: float
    unit: WeightUnit
    weight_kg: float
    noted_on: date
    updated_at: datetime


class WorkoutSetOut(ORMModel):
    id: UUID
    position: int
    kind: SetKind
    target_reps: int | None
    target_weight: float | None
    target_unit: WeightUnit | None
    target_percent: float | None
    target_rpe: float | None
    rest_seconds: int
    updated_at: datetime


class WorkoutSetIn(BaseModel):
    id: UUID | None = None
    kind: SetKind = SetKind.working
    target_reps: Reps | None = None
    target_weight: Weight | None = None
    target_unit: WeightUnit | None = None
    target_percent: Percent | None = None
    target_rpe: Rpe | None = None
    rest_seconds: Rest = 120


class WorkoutSetPatch(BaseModel):
    kind: SetKind | None = None
    target_reps: Reps | None = None
    target_weight: Weight | None = None
    target_unit: WeightUnit | None = None
    target_percent: Percent | None = None
    target_rpe: Rpe | None = None
    rest_seconds: Rest | None = None
    clear_weight: bool = False
    clear_percent: bool = False
    base_updated_at: datetime | None = None


class WorkoutExerciseOut(ORMModel):
    id: UUID
    exercise_id: UUID
    exercise_name: str
    position: int
    notes: str
    updated_at: datetime
    sets: list[WorkoutSetOut]


class WorkoutExerciseIn(BaseModel):
    id: UUID | None = None
    exercise_id: UUID
    notes: Notes = ""
    position: Position | None = None


class WorkoutExercisePatch(BaseModel):
    notes: Notes | None = None
    base_updated_at: datetime | None = None


class WorkoutOut(ORMModel):
    id: UUID
    name: str
    notes: str
    archived_at: datetime | None
    updated_at: datetime
    exercises: list[WorkoutExerciseOut] = []


class WorkoutSummary(ORMModel):
    id: UUID
    name: str
    notes: str
    archived_at: datetime | None
    updated_at: datetime


class WorkoutIn(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=80)
    notes: Notes = ""


class WorkoutPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    notes: Notes | None = None
    archived: bool | None = None
    base_updated_at: datetime | None = None


class ReorderIn(BaseModel):
    ids: list[UUID] = Field(max_length=1000)


class ScheduledWorkoutOut(BaseModel):
    id: UUID
    workout_id: UUID
    workout_name: str
    workout_archived: bool
    scheduled_on: date
    notes: str
    updated_at: datetime


class ScheduledWorkoutIn(BaseModel):
    id: UUID | None = None
    workout_id: UUID
    scheduled_on: date
    notes: str = Field(default="", max_length=500)
    repeat_weeks: int = Field(default=0, ge=0, le=52, description="Also plan it on the same weekday for this many following weeks")


class ScheduledWorkoutPatch(BaseModel):
    workout_id: UUID | None = None
    scheduled_on: date | None = None
    notes: str | None = Field(default=None, max_length=500)
    base_updated_at: datetime | None = None


class SessionSetOut(ORMModel):
    id: UUID
    position: int
    kind: SetKind
    target_reps: int | None
    target_weight: float | None
    target_unit: WeightUnit | None
    target_percent: float | None
    target_rpe: float | None
    rest_seconds: int
    actual_reps: int | None
    actual_weight: float | None
    actual_unit: WeightUnit | None
    weight_kg: float | None
    rpe: float | None
    notes: str
    skipped: bool
    completed_at: datetime | None
    updated_at: datetime


class SessionExerciseOut(BaseModel):
    id: UUID
    exercise_id: UUID
    exercise_name: str
    position: int
    notes: str
    updated_at: datetime
    sets: list[SessionSetOut]
    previous_sets: list[SessionSetOut] = []


class SessionOut(BaseModel):
    id: UUID
    workout_id: UUID | None
    name: str
    status: SessionStatus
    started_at: datetime
    ended_at: datetime | None
    notes: str
    updated_at: datetime
    exercises: list[SessionExerciseOut] = []


class SessionSummary(ORMModel):
    id: UUID
    workout_id: UUID | None
    name: str
    status: SessionStatus
    started_at: datetime
    ended_at: datetime | None
    notes: str
    updated_at: datetime


class SessionIn(BaseModel):
    id: UUID | None = None
    workout_id: UUID | None = None
    name: Name = ""
    started_at: datetime | None = None
    notes: Notes = ""


class SessionPatch(BaseModel):
    name: Name | None = None
    notes: Notes | None = None
    status: SessionStatus | None = None
    ended_at: datetime | None = None
    base_updated_at: datetime | None = None


class SessionExerciseIn(BaseModel):
    id: UUID | None = None
    exercise_id: UUID
    notes: Notes = ""
    position: Position | None = None


class SessionExercisePatch(BaseModel):
    notes: Notes | None = None
    base_updated_at: datetime | None = None


class SessionSetIn(BaseModel):
    id: UUID | None = None
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
    completed: bool = False


class SessionSetPatch(BaseModel):
    kind: SetKind | None = None
    actual_reps: Reps | None = None
    actual_weight: Weight | None = None
    actual_unit: WeightUnit | None = None
    rpe: Rpe | None = None
    notes: Notes | None = None
    skipped: bool | None = None
    completed: bool | None = None
    rest_seconds: Rest | None = None
    clear_actuals: bool = False
    base_updated_at: datetime | None = None


class ProgressPoint(BaseModel):
    session_id: UUID
    started_at: datetime
    best_e1rm_kg: float | None
    volume_kg: float
    top_set_weight_kg: float | None
    top_set_percent: float | None


class ProgressOut(BaseModel):
    exercise_id: UUID
    reference_kg: float | None
    reference_source: str
    points: list[ProgressPoint]


class MediaUploadIn(BaseModel):
    content_type: str = Field(max_length=100)
    byte_size: int = Field(gt=0, le=10 * 1024**3)
    duration_seconds: float | None = Field(default=None, ge=0, le=86_400)


class MediaConfirmIn(BaseModel):
    duration_seconds: float | None = Field(default=None, ge=0, le=86_400)


class MediaOut(ORMModel):
    id: UUID
    session_set_id: UUID
    content_type: str | None
    byte_size: int | None
    duration_seconds: float | None
    status: MediaStatus
    playback_url: str | None = None
    updated_at: datetime


class MediaUploadOut(BaseModel):
    media_id: UUID
    upload_url: str
    storage_key: str
    headers: dict[str, str]


class DevTokenIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    display_name: Name = ""


class DevTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    email: str


class MutationIn(BaseModel):
    client_mutation_id: UUID
    entity: str = Field(max_length=40)
    op: str = Field(max_length=10)
    entity_id: UUID
    base_updated_at: datetime | None = None
    payload: dict = Field(default_factory=dict)


MAX_PULL_LIMIT = 5000


class SyncIn(BaseModel):
    cursor: int = Field(default=0, ge=0, le=2**63 - 1)
    mutations: list[MutationIn] = Field(default_factory=list, max_length=200)
    limit: int | None = Field(
        default=None,
        ge=1,
        le=MAX_PULL_LIMIT,
        description="Most changes to return (default 2000). When more are waiting, has_more is true and the client syncs again from the new cursor.",
    )


class MutationResult(BaseModel):
    client_mutation_id: UUID
    status: str
    detail: str | None = None
    server_row: dict | None = None


class ChangeOut(BaseModel):
    id: int
    entity: str
    entity_id: UUID
    op: str
    row: dict | None = None


class SyncOut(BaseModel):
    cursor: int
    applied: list[MutationResult]
    changes: list[ChangeOut]
    has_more: bool = False


class StatsTotals(BaseModel):
    sessions: int
    sets: int
    volume_kg: float
    this_week_sessions: int
    this_week_volume_kg: float
    last_week_volume_kg: float
    current_streak_weeks: int
    longest_streak_weeks: int
    records: int


class WeeklyStat(BaseModel):
    week_start: date
    sessions: int
    sets: int
    volume_kg: float


class CalendarDay(BaseModel):
    day: date
    sessions: int


class MuscleStat(BaseModel):
    muscle: str
    sets: int
    volume_kg: float


class RecordOut(BaseModel):
    exercise_id: UUID
    exercise_name: str
    session_id: UUID
    achieved_at: datetime
    e1rm_kg: float
    previous_e1rm_kg: float
    weight_kg: float
    reps: int


class ExerciseStat(BaseModel):
    exercise_id: UUID
    exercise_name: str
    muscle: str
    sessions: int
    best_e1rm_kg: float | None
    last_performed_at: datetime


class LogSessionOut(BaseModel):
    id: UUID
    started_at: datetime


class LogSetOut(BaseModel):
    session_id: UUID
    exercise_id: UUID
    exercise_name: str
    muscle: str
    weight_kg: float
    reps: int


class StatsLogOut(BaseModel):
    """Every completed session and counted working set, for charts the client builds itself."""

    sessions: list[LogSessionOut]
    sets: list[LogSetOut]


class OverviewOut(BaseModel):
    totals: StatsTotals
    weekly: list[WeeklyStat]
    calendar: list[CalendarDay]
    muscle_split: list[MuscleStat]
    recent_records: list[RecordOut]
    exercises: list[ExerciseStat]


class SummaryExercise(BaseModel):
    exercise_id: UUID
    exercise_name: str
    sets: int
    best_e1rm_kg: float
    top_weight_kg: float
    top_reps: int


class SessionSummaryOut(BaseModel):
    session_id: UUID
    name: str
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int | None
    sets: int
    volume_kg: float
    exercises: list[SummaryExercise]
    records: list[RecordOut]
