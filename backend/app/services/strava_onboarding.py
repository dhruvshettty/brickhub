"""Strava -> onboarding prefill + profile diff.

Turns the Strava athlete profile + recent runs into scalar suggestions the user
reviews and saves. Three consumers, one seam:

    M0 onboarding       ── prefill_from_athlete() ───────────► populate profile fields
    settings sync       ── diff_against_profile() ───────────► surface changes for confirm
    running onboarding  ── running_prefill_from_activities() ► populate Step-3 load fields

Emits only individual scalars (profile fields; run count + weekly km) and never
forwards raw provider payloads downstream — the AI-clause boundary. Values become
the user's own data once confirmed and saved. age + height are not here — Strava
does not expose them.
"""
from __future__ import annotations

from app.models.profile import Profile
from app.services.activity_source import Activity, AthleteProfile

# Float noise tolerance for the weight comparison (kg).
_WEIGHT_EPSILON = 0.1

# Running onboarding (RunningSetup Step 3) slider bounds — keep prefill in range.
_MAX_RECENT_RUNS = 30
_MAX_WEEKLY_KM = 80

# Day names match the running config (RunningSetup DAYS); index = datetime.weekday().
_WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


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


def running_prefill_from_activities(activities: list[Activity], weeks: int = 4) -> dict:
    """Derive Step-3 training-load suggestions (run count + weekly km) from runs.

    Counts run activities and sums their distance over the fetched window, then
    emits the two load fields as scalars the user reviews and edits. Aggregates
    only — raw activities never leave this boundary. ``count`` of 0 is a real
    value ("no recent runs"), so both fields are always returned. Clamped to the
    onboarding slider ranges.
    """
    runs = [a for a in activities if a.is_run]
    count = min(len(runs), _MAX_RECENT_RUNS)
    total_km = sum(a.distance_km for a in runs if a.distance_km)
    weekly_km = min(round(total_km / weeks), _MAX_WEEKLY_KM) if weeks > 0 else 0
    prefill = {
        "recent_runs_4_weeks": count,
        "current_weekly_km": weekly_km,
    }
    prefill.update(_run_day_pattern(runs, weeks))
    return prefill


def _run_day_pattern(runs: list[Activity], weeks: int) -> dict:
    """Weekdays the athlete routinely runs + their likely long-run day.

    A weekday is "preferred" if it shows a run in at least half the weeks (filters
    one-off runs). The long-run day is the preferred weekday whose runs average the
    greatest distance — and is always one of the preferred days, which the Step-3
    long-run picker requires. Returns ``{}`` on a sparse / irregular history so the
    user just picks manually. Emits day-name scalars only — never raw activities.
    """
    if not runs:
        return {}
    threshold = max(1, round(weeks / 2))
    counts: dict[int, int] = {}
    distances: dict[int, list[float]] = {}
    for a in runs:
        wd = a.start.weekday()
        counts[wd] = counts.get(wd, 0) + 1
        if a.distance_km:
            distances.setdefault(wd, []).append(a.distance_km)

    preferred = sorted(wd for wd, c in counts.items() if c >= threshold)
    if not preferred:
        return {}

    def avg_dist(wd: int) -> float:
        ds = distances.get(wd, [])
        return sum(ds) / len(ds) if ds else 0.0

    result: dict = {"preferred_days": [_WEEKDAY_NAMES[wd] for wd in preferred]}
    long_day = max(preferred, key=avg_dist)
    if avg_dist(long_day) > 0:
        result["long_run_day"] = _WEEKDAY_NAMES[long_day]
    return result


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
