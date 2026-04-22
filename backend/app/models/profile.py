import enum
from datetime import date

from sqlalchemy import Column, Date, Enum, Float, Integer, String

from app.core.database import Base


class RaceDistance(str, enum.Enum):
    sprint = "sprint"
    olympic = "olympic"
    half_ironman = "70.3"
    ironman = "ironman"


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, default="Athlete")
    age = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    ftp_watts = Column(Integer, nullable=True)  # functional threshold power for bike zones

    race_distance = Column(Enum(RaceDistance), nullable=True)
    race_date = Column(Date, nullable=True)
    weekly_training_hours = Column(Integer, default=8)
