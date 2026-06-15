"""Strava -> onboarding profile prefill + profile diff.

Turns the Strava athlete profile into scalar suggestions the user reviews and
saves. Two consumers, one mapping:

    onboarding    ── prefill_from_athlete() ──► populate empty form fields
    settings sync ── diff_against_profile() ──► surface changes for confirm

Emits only individual profile fields (name, sex, weight, units) and never
forwards raw provider payloads downstream. Profile values become the user's own
data once confirmed and saved. age + height are not here — Strava does not
expose them.
"""
from __future__ import annotations

from app.models.profile import Profile
from app.services.activity_source import AthleteProfile

# Float noise tolerance for the weight comparison (kg).
_WEIGHT_EPSILON = 0.1


def prefill_from_athlete(athlete: AthleteProfile) -> dict:
    """Map a normalized AthleteProfile to onboarding profile suggestions.

    Only non-null fields are returned so the frontend fills blanks without
    overwriting anything with None.
    """
    candidates = {
        "name": athlete.name,
        "sex": athlete.sex,
        "weight_kg": athlete.weight_kg,
        "unit_preference": athlete.unit_preference,
    }
    return {field: value for field, value in candidates.items() if value is not None}


def diff_against_profile(prefill: dict, profile: Profile) -> dict:
    """Fields where Strava differs from the stored profile.

    Shape: ``{field: {"current": <local>, "strava": <strava>}}``. Used by the
    Settings sync to surface changes for the user to confirm — never a silent
    overwrite. A field that is blank locally but set on Strava counts as a
    change (offer to fill it).
    """
    changes: dict = {}
    for field, strava_value in prefill.items():
        current = getattr(profile, field, None)
        if _differs(field, current, strava_value):
            changes[field] = {"current": current, "strava": strava_value}
    return changes


def _differs(field: str, current, strava_value) -> bool:
    if current is None:
        return True
    if field == "weight_kg" and isinstance(current, (int, float)):
        return abs(float(current) - float(strava_value)) > _WEIGHT_EPSILON
    return current != strava_value
