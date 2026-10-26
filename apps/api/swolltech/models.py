import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, Text, Uuid
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class WeightUnit(str, enum.Enum):
    lb = "lb"
    kg = "kg"


class SetKind(str, enum.Enum):
    warmup = "warmup"
    working = "working"


class SessionStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"
    abandoned = "abandoned"


class MediaStatus(str, enum.Enum):
    local = "local"
    uploading = "uploading"
    ready = "ready"
    failed = "failed"


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda items: [item.value for item in items],
        create_type=False,
    )


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    display_name: Mapped[str] = mapped_column(Text, default="")
    unit_preference: Mapped[WeightUnit] = mapped_column(pg_enum(WeightUnit, "weight_unit"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Exercise(Base):
    __tablename__ = "exercises"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    name: Mapped[str] = mapped_column(Text)
    primary_muscle: Mapped[str] = mapped_column(Text, default="")
    equipment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CatalogMeta(Base):
    __tablename__ = "catalog_meta"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer)


class ExerciseReference(Base):
    __tablename__ = "exercise_references"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    exercise_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exercises.id"))
    weight: Mapped[float] = mapped_column(Numeric(10, 3))
    unit: Mapped[WeightUnit] = mapped_column(pg_enum(WeightUnit, "weight_unit"))
    weight_kg: Mapped[float] = mapped_column(Numeric(12, 6))
    noted_on: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Workout(Base):
    __tablename__ = "workouts"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    name: Mapped[str] = mapped_column(Text)
    notes: Mapped[str] = mapped_column(Text, default="")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exercises: Mapped[list["WorkoutExercise"]] = relationship(
        back_populates="workout",
        order_by="WorkoutExercise.position",
    )


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    workout_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workouts.id"))
    exercise_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exercises.id"))
    position: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    workout: Mapped[Workout] = relationship(back_populates="exercises")
    exercise: Mapped[Exercise] = relationship()
    sets: Mapped[list["WorkoutSet"]] = relationship(
        back_populates="workout_exercise",
        order_by="WorkoutSet.position",
    )


class WorkoutSet(Base):
    __tablename__ = "workout_sets"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    workout_exercise_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workout_exercises.id"))
    position: Mapped[int] = mapped_column(Integer)
    kind: Mapped[SetKind] = mapped_column(pg_enum(SetKind, "set_kind"))
    target_reps: Mapped[int | None] = mapped_column(Integer)
    target_weight: Mapped[float | None] = mapped_column(Numeric(10, 3))
    target_unit: Mapped[WeightUnit | None] = mapped_column(pg_enum(WeightUnit, "weight_unit"))
    target_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    target_rpe: Mapped[float | None] = mapped_column(Numeric(3, 1))
    rest_seconds: Mapped[int] = mapped_column(Integer, default=120)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    workout_exercise: Mapped[WorkoutExercise] = relationship(back_populates="sets")


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    workout_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    name: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[SessionStatus] = mapped_column(pg_enum(SessionStatus, "session_status"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exercises: Mapped[list["SessionExercise"]] = relationship(
        back_populates="session",
        order_by="SessionExercise.position",
    )


class SessionExercise(Base):
    __tablename__ = "session_exercises"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("sessions.id"))
    exercise_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("exercises.id"))
    position: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    session: Mapped[Session] = relationship(back_populates="exercises")
    exercise: Mapped[Exercise] = relationship()
    sets: Mapped[list["SessionSet"]] = relationship(
        back_populates="session_exercise",
        order_by="SessionSet.position",
    )


class SessionSet(Base):
    __tablename__ = "session_sets"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    session_exercise_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("session_exercises.id"))
    position: Mapped[int] = mapped_column(Integer)
    kind: Mapped[SetKind] = mapped_column(pg_enum(SetKind, "set_kind"))
    target_reps: Mapped[int | None] = mapped_column(Integer)
    target_weight: Mapped[float | None] = mapped_column(Numeric(10, 3))
    target_unit: Mapped[WeightUnit | None] = mapped_column(pg_enum(WeightUnit, "weight_unit"))
    target_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    target_rpe: Mapped[float | None] = mapped_column(Numeric(3, 1))
    rest_seconds: Mapped[int] = mapped_column(Integer, default=120)
    actual_reps: Mapped[int | None] = mapped_column(Integer)
    actual_weight: Mapped[float | None] = mapped_column(Numeric(10, 3))
    actual_unit: Mapped[WeightUnit | None] = mapped_column(pg_enum(WeightUnit, "weight_unit"))
    weight_kg: Mapped[float | None] = mapped_column(Numeric(12, 6))
    rpe: Mapped[float | None] = mapped_column(Numeric(3, 1))
    notes: Mapped[str] = mapped_column(Text, default="")
    skipped: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    session_exercise: Mapped[SessionExercise] = relationship(back_populates="sets")
    media: Mapped["SetMedia | None"] = relationship(back_populates="session_set", uselist=False)


class SetMedia(Base):
    __tablename__ = "set_media"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    session_set_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("session_sets.id"))
    storage_key: Mapped[str | None] = mapped_column(Text)
    content_type: Mapped[str | None] = mapped_column(Text)
    byte_size: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[float | None] = mapped_column(Numeric(8, 2))
    status: Mapped[MediaStatus] = mapped_column(pg_enum(MediaStatus, "media_status"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    session_set: Mapped[SessionSet] = relationship(back_populates="media")


class SyncChange(Base):
    __tablename__ = "sync_changes"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    entity: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    op: Mapped[str] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AppliedMutation(Base):
    __tablename__ = "applied_mutations"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    client_mutation_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
