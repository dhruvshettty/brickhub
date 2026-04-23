import enum

from sqlalchemy import Column, DateTime, Enum, Float, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class CallType(str, enum.Enum):
    plan_generation = "plan_generation"
    recalibration = "recalibration"
    coach_chat = "coach_chat"


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    call_type = Column(Enum(CallType), nullable=False, index=True)
    model = Column(String, nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cache_creation_tokens = Column(Integer, nullable=False, default=0)
    cache_read_tokens = Column(Integer, nullable=False, default=0)
    estimated_cost_usd = Column(Float, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
