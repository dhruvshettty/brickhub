from sqlalchemy import Column, DateTime, Float, Integer, String

from app.core.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, default="Athlete")
    age = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    sex = Column(String, nullable=True)
    unit_preference = Column(String, default="metric")
    weekly_training_hours = Column(Integer, default=8)

    # Strava integration — single-user self-hosted, so the OAuth token and sync
    # cursor live on the one profile row (no per-user token table).
    strava_athlete_id = Column(String, nullable=True)
    strava_access_token = Column(String, nullable=True)
    strava_refresh_token = Column(String, nullable=True)
    strava_token_expires_at = Column(Integer, nullable=True)  # epoch seconds
    strava_last_synced_at = Column(DateTime, nullable=True)   # incremental fetch cursor
