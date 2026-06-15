"""Strava connect + sync endpoints.

OAuth runs browser-side: /authorize redirects to Strava, Strava redirects back
to /callback with a code, we exchange it for a token stored on the profile.
/sync is called on app-open (debounced) and by the manual "Sync now" button
(force=true). Single-user self-hosted, so no per-request auth here.
"""
from __future__ import annotations

from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.settings import _get_or_create_profile
from app.core.config import settings
from app.core.database import get_db
from app.models.workout import WorkoutLog, WorkoutSource
from app.services import strava_sync
from app.services.activity_source import Activity
from app.services.strava_adapter import StravaAdapter, StravaConfigError

router = APIRouter(prefix="/strava", tags=["strava"])

FRONTEND_URL = "http://localhost:3000"
API_URL = "http://localhost:8000"
REDIRECT_PATH = "/api/v1/strava/callback"


def _redirect_uri() -> str:
    # Strava sends the browser here after auth. localhost is an allowed
    # Authorization Callback Domain in the Strava app settings.
    return f"{API_URL}{REDIRECT_PATH}"


class MatchRequest(BaseModel):
    """Manually attach an ambiguous activity to a planned session date."""

    external_id: str
    planned_at: str                 # iso date of the planned session
    type: str = "Run"
    start: str                      # iso datetime
    duration_minutes: float | None = None
    distance_km: float | None = None
    avg_hr: int | None = None


@router.get("/status")
def strava_status(db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    return {
        "configured": bool(settings.strava_client_id and settings.strava_client_secret),
        "connected": bool(profile.strava_access_token),
        "athlete_id": profile.strava_athlete_id,
        "last_synced_at": profile.strava_last_synced_at.isoformat() if profile.strava_last_synced_at else None,
    }


@router.get("/authorize")
def strava_authorize():
    try:
        url = StravaAdapter().authorize_url(_redirect_uri())
    except StravaConfigError as e:
        raise HTTPException(400, str(e))
    return RedirectResponse(url)


@router.get("/callback")
def strava_callback(code: str | None = None, error: str | None = None, db: Session = Depends(get_db)):
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/settings?strava=error")
    try:
        tokens = StravaAdapter().exchange_code(code, _redirect_uri())
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}/settings?strava=error")

    profile = _get_or_create_profile(db)
    profile.strava_access_token = tokens.access_token
    profile.strava_refresh_token = tokens.refresh_token
    profile.strava_token_expires_at = tokens.expires_at
    profile.strava_athlete_id = tokens.athlete_id
    db.commit()
    return RedirectResponse(f"{FRONTEND_URL}/settings?strava=connected")


@router.post("/sync")
def strava_sync_endpoint(force: bool = False, db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    try:
        return strava_sync.sync(db, profile, StravaAdapter(), force=force)
    except StravaConfigError as e:
        raise HTTPException(400, str(e))
    except httpx.HTTPError:
        # Revoked/expired refresh token or Strava outage — ask the user to reconnect.
        raise HTTPException(502, "Strava request failed. You may need to reconnect Strava.")


@router.post("/match")
def strava_match(req: MatchRequest, db: Session = Depends(get_db)):
    _get_or_create_profile(db)
    activity = Activity(
        external_id=req.external_id,
        type=req.type,
        start=datetime.fromisoformat(req.start),
        duration_minutes=req.duration_minutes,
        distance_km=req.distance_km,
        avg_hr=req.avg_hr,
    )
    log = strava_sync.import_activity(db, activity, req.planned_at)
    db.commit()
    db.refresh(log)
    return {"imported": True, "id": log.id, "planned_at": req.planned_at}


@router.post("/disconnect")
def strava_disconnect(db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    profile.strava_access_token = None
    profile.strava_refresh_token = None
    profile.strava_token_expires_at = None
    profile.strava_athlete_id = None
    profile.strava_last_synced_at = None
    # Strava deauthorization requires deleting the athlete's imported data.
    db.query(WorkoutLog).filter(WorkoutLog.source == WorkoutSource.imported).delete()
    db.commit()
    return {"disconnected": True}
