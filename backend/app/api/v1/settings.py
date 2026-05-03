from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.profile import Profile

router = APIRouter(prefix="/settings", tags=["settings"])


class ProfileUpdate(BaseModel):
    name: str | None = None
    age: int | None = None
    weight_kg: float | None = None
    height_cm: float | None = None
    sex: str | None = None
    unit_preference: str | None = None
    weekly_training_hours: int | None = None


class ProfileResponse(BaseModel):
    id: int
    name: str | None
    age: int | None
    weight_kg: float | None
    height_cm: float | None
    sex: str | None
    unit_preference: str
    weekly_training_hours: int

    class Config:
        from_attributes = True


def _get_or_create_profile(db: Session) -> Profile:
    profile = db.query(Profile).first()
    if not profile:
        profile = Profile(name="Athlete", weekly_training_hours=8, unit_preference="metric")
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("/profile/exists")
def profile_exists(db: Session = Depends(get_db)):
    exists = db.query(Profile).first() is not None
    return {"exists": exists}


@router.get("/profile", response_model=ProfileResponse)
def get_profile(db: Session = Depends(get_db)):
    return _get_or_create_profile(db)


@router.put("/profile", response_model=ProfileResponse)
def update_profile(update: ProfileUpdate, db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile
