"""Strava sync orchestration + activity->session matching.

Phase 1 scope: import completed runs, confirm completion, accurate volume.
NOTHING here sends data to Claude. Imported activities land in WorkoutLog and
feed the existing deterministic get_signals() aggregation unchanged. Derived
deltas to Claude come in Phase 2.

Matching rule (runs only):

    dedupe by external_id (re-syncs never double-insert)
    group remaining activities by local date
    auto-import a date IFF exactly one activity that day AND no existing log
        - planned day        -> completes that session
        - rest/unplanned day -> shows as an "extra" run (still counts toward load)
    ambiguous (surfaced to the UI for confirm/dismiss) only where one WorkoutLog
    per date genuinely can't represent the runs:
        multiple_activities | already_logged
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.models.workout import ModuleType, WorkoutLog, WorkoutSource
from app.services.activity_source import Activity, ActivitySource

DEBOUNCE_MINUTES = 15
FIRST_SYNC_LOOKBACK_DAYS = 28
REFETCH_BUFFER_DAYS = 1


@dataclass
class MatchResult:
    auto: list[Activity] = field(default_factory=list)        # ready to import
    auto_dates: dict[str, str] = field(default_factory=dict)  # external_id -> planned date iso
    ambiguous: list[dict] = field(default_factory=list)       # {activity, reason}


def match_activities(
    activities: list[Activity],
    existing_external_ids: set[str],
    logged_dates: set[str],
) -> MatchResult:
    """Pure matching, no DB. See module docstring for the rule."""
    runs = [a for a in activities if a.is_run and a.external_id not in existing_external_ids]

    by_date: dict[str, list[Activity]] = {}
    for a in runs:
        by_date.setdefault(a.start.date().isoformat(), []).append(a)

    result = MatchResult()
    for d, acts in by_date.items():
        if len(acts) > 1:
            reason = "multiple_activities"
        elif d in logged_dates:
            reason = "already_logged"
        else:
            result.auto.append(acts[0])
            result.auto_dates[acts[0].external_id] = d
            continue
        for a in acts:
            result.ambiguous.append({"activity": a, "reason": reason})
    return result


def import_activity(db: Session, activity: Activity, planned_date: str) -> WorkoutLog:
    """Create or replace the running WorkoutLog for planned_date from an activity.

    Keyed by (module, planned_at) — same key the manual log flow uses — so the
    plan view and get_signals() pick it up with no other changes.
    """
    planned_dt = datetime.combine(date.fromisoformat(planned_date), datetime.min.time())
    log = db.query(WorkoutLog).filter(
        WorkoutLog.module == ModuleType.running,
        WorkoutLog.planned_at == planned_dt,
    ).first()
    if log is None:
        log = WorkoutLog(module=ModuleType.running, planned_at=planned_dt)
        db.add(log)
    log.completed_at = activity.start
    log.duration_minutes = activity.duration_minutes
    log.distance_km = activity.distance_km
    log.avg_hr = activity.avg_hr
    log.relative_effort = activity.relative_effort
    log.source = WorkoutSource.imported
    log.external_id = activity.external_id
    return log


# ── internal helpers ────────────────────────────────────────────────────────

def _activity_summary(a: Activity) -> dict:
    return {
        "external_id": a.external_id,
        "type": a.type,
        "start": a.start.isoformat(),
        "date": a.start.date().isoformat(),
        "duration_minutes": a.duration_minutes,
        "distance_km": a.distance_km,
        "avg_hr": a.avg_hr,
        "relative_effort": a.relative_effort,
        "name": a.name,
    }


def _ensure_fresh_token(db: Session, profile: Profile, source: ActivitySource) -> str:
    """Refresh the access token if it expires within 60s."""
    if profile.strava_token_expires_at and profile.strava_token_expires_at <= int(time.time()) + 60:
        tokens = source.refresh(profile.strava_refresh_token)
        profile.strava_access_token = tokens.access_token
        profile.strava_refresh_token = tokens.refresh_token
        profile.strava_token_expires_at = tokens.expires_at
        db.commit()
    return profile.strava_access_token


def sync(db: Session, profile: Profile, source: ActivitySource, *, force: bool = False) -> dict:
    """Run a sync. On app-open this is called unforced (debounced); the manual
    "Sync now" button calls it with force=True."""
    if not profile.strava_access_token:
        return {"connected": False, "skipped": False, "imported": [], "ambiguous": []}

    now = datetime.utcnow()
    last = profile.strava_last_synced_at
    if not force and last and (now - last) < timedelta(minutes=DEBOUNCE_MINUTES):
        return {
            "connected": True, "skipped": True, "imported": [], "ambiguous": [],
            "last_synced_at": last.isoformat(),
        }

    # Bounded fetch window: lifetime is never pulled.
    after = (now - timedelta(days=FIRST_SYNC_LOOKBACK_DAYS)) if last is None \
        else (last - timedelta(days=REFETCH_BUFFER_DAYS))

    access = _ensure_fresh_token(db, profile, source)
    activities = source.fetch_activities(access, after)

    existing_ids = {
        r[0] for r in db.query(WorkoutLog.external_id).filter(WorkoutLog.external_id.isnot(None)).all()
    }
    logged_dates = {
        log.planned_at.date().isoformat()
        for log in db.query(WorkoutLog).filter(
            WorkoutLog.module == ModuleType.running,
            WorkoutLog.completed_at.isnot(None),
        ).all()
    }

    result = match_activities(activities, existing_ids, logged_dates)

    imported = []
    for a in result.auto:
        import_activity(db, a, result.auto_dates[a.external_id])
        imported.append({**_activity_summary(a), "planned_at": result.auto_dates[a.external_id]})

    profile.strava_last_synced_at = now
    db.commit()

    return {
        "connected": True,
        "skipped": False,
        "imported": imported,
        "ambiguous": [{"reason": x["reason"], **_activity_summary(x["activity"])} for x in result.ambiguous],
        "last_synced_at": now.isoformat(),
    }
