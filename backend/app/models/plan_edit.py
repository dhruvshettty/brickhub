from sqlalchemy import Column, Date, DateTime, Integer, JSON, String, func

from app.core.database import Base


class PlanEdit(Base):
    __tablename__ = "plan_edits"

    id = Column(Integer, primary_key=True, index=True)
    module = Column(String, nullable=False, default="running")
    week_start = Column(Date, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    changed_at = Column(DateTime, server_default=func.now())
    original_session = Column(JSON, nullable=False)
    new_session = Column(JSON, nullable=False)
    reason = Column(String, nullable=False)
