from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class ModuleConfig(Base):
    __tablename__ = "module_configs"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)
    module = Column(String, nullable=False)
    config_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    __table_args__ = (UniqueConstraint("profile_id", "module", name="uq_module_configs_profile_module"),)
