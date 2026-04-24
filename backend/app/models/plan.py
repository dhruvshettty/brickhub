import enum

from sqlalchemy import Column, Date, DateTime, Enum, Integer, JSON, func

from app.core.database import Base


class ModuleType(str, enum.Enum):
    running = "running"
    biking = "biking"
    swimming = "swimming"
    gym = "gym"
    food = "food"


class WeeklyPlan(Base):
    __tablename__ = "weekly_plans"

    id = Column(Integer, primary_key=True, index=True)
    module = Column(Enum(ModuleType), nullable=False, index=True)
    week_start = Column(Date, nullable=False, index=True)

    plan_json = Column(JSON, nullable=False)  # Claude-generated plan structure
    config_snapshot = Column(JSON, nullable=True)  # config at generation time, for invalidation
    recalibrated_at = Column(DateTime, nullable=True)  # null = original plan

    created_at = Column(DateTime, server_default=func.now())
