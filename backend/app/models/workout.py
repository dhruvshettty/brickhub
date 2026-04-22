import enum

from sqlalchemy import Column, DateTime, Enum, Float, Integer, String, Text, func

from app.core.database import Base


class ModuleType(str, enum.Enum):
    running = "running"
    biking = "biking"
    swimming = "swimming"
    gym = "gym"


class WorkoutSource(str, enum.Enum):
    manual = "manual"
    imported = "imported"  # any third-party sync (Strava, Garmin, etc.)


class WorkoutLog(Base):
    __tablename__ = "workout_logs"

    id = Column(Integer, primary_key=True, index=True)
    module = Column(Enum(ModuleType), nullable=False, index=True)

    planned_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)  # null = missed

    duration_minutes = Column(Float, nullable=True)
    distance_km = Column(Float, nullable=True)
    avg_hr = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    source = Column(Enum(WorkoutSource), default=WorkoutSource.manual)

    created_at = Column(DateTime, server_default=func.now())
