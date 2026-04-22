from sqlalchemy import Column, Float, Integer, String

from app.core.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, default="Athlete")
    age = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    weekly_training_hours = Column(Integer, default=8)
