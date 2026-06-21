from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.profile import Profile
from app.services.hr_zones import derive_zones, seed_hrmax_from_age

router = APIRouter(prefix="/settings", tags=["settings"])


class ProfileUpdate(BaseModel):
    name: str | None = None
    age: int | None = None
    weight_kg: float | None = None
    height_cm: float | None = None
    sex: str | None = None
    unit_preference: str | None = None
    weekly_training_hours: int | None = None
    hr_max_bpm: int | None = None


class ProfileResponse(BaseModel):
    id: int
    name: str | None
    age: int | None
    weight_kg: float | None
    height_cm: float | None
    sex: str | None
    unit_preference: str
    weekly_training_hours: int
    hr_max_bpm: int | None
    hr_zones: dict[int, tuple[int, int]] | None = None

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


def _profile_response(profile: Profile) -> ProfileResponse:
    resp = ProfileResponse.model_validate(profile)
    zones = derive_zones(profile.hr_max_bpm)
    resp.hr_zones = zones
    return resp


@router.get("/profile/exists")
def profile_exists(db: Session = Depends(get_db)):
    exists = db.query(Profile).first() is not None
    return {"exists": exists}


@router.get("/profile", response_model=ProfileResponse)
def get_profile(db: Session = Depends(get_db)):
    return _profile_response(_get_or_create_profile(db))


@router.put("/profile", response_model=ProfileResponse)
def update_profile(update: ProfileUpdate, db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)

    data = update.model_dump(exclude_unset=True)
    if "hr_max_bpm" in data and data["hr_max_bpm"] is not None:
        # User-entered HRmax — guard against typos / implausible values.
        if not (120 <= data["hr_max_bpm"] <= 220):
            raise HTTPException(400, "hr_max_bpm must be between 120 and 220.")

    for field, value in data.items():
        setattr(profile, field, value)

    # Seed HRmax from age the first time we have an age and no HRmax yet.
    # Seed-once: a user-set HRmax is never overwritten by a later age edit.
    if profile.hr_max_bpm is None and profile.age is not None:
        profile.hr_max_bpm = seed_hrmax_from_age(profile.age)

    db.commit()
    db.refresh(profile)
    return _profile_response(profile)
