"""Strava implementation of ActivitySource. REST via httpx.

Auth is OAuth2. Single-user self-hosted: the hoster registers their own app at
strava.com/settings/api and drops STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET in
.env. Scope is read-only activities.
"""
from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.services.activity_source import Activity, ActivitySource, AthleteProfile, OAuthTokens

_OAUTH_BASE = "https://www.strava.com/oauth"
_API_BASE = "https://www.strava.com/api/v3"
# read_all (not plain read) so the athlete's PRIVATE activities import too —
# otherwise private runs silently never sync. profile:read_all so GET /athlete
# returns weight + measurement_preference (private fields) for onboarding prefill.
# Adding profile:read_all forces a one-time reconnect for an already-connected
# athlete — acceptable for the single self-host user.
_SCOPE = "activity:read_all,profile:read_all"
_TIMEOUT = 20.0
_PER_PAGE = 100


class StravaConfigError(RuntimeError):
    """Strava client credentials are not configured."""


class StravaAdapter(ActivitySource):
    def __init__(self, client_id: str | None = None, client_secret: str | None = None):
        self.client_id = client_id if client_id is not None else settings.strava_client_id
        self.client_secret = client_secret if client_secret is not None else settings.strava_client_secret

    def _require_creds(self) -> None:
        if not self.client_id or not self.client_secret:
            raise StravaConfigError(
                "Strava is not configured. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET "
                "in .env (register an app at strava.com/settings/api)."
            )

    def authorize_url(self, redirect_uri: str, state: str | None = None) -> str:
        self._require_creds()
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "approval_prompt": "auto",
            "scope": _SCOPE,
        }
        if state:
            params["state"] = state
        return f"{_OAUTH_BASE}/authorize?{urlencode(params)}"

    def exchange_code(self, code: str, redirect_uri: str) -> OAuthTokens:
        self._require_creds()
        resp = httpx.post(
            f"{_OAUTH_BASE}/token",
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code": code,
                "grant_type": "authorization_code",
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return self._tokens_from(resp.json())

    def refresh(self, refresh_token: str) -> OAuthTokens:
        self._require_creds()
        resp = httpx.post(
            f"{_OAUTH_BASE}/token",
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return self._tokens_from(resp.json())

    def fetch_activities(self, access_token: str, after: datetime) -> list[Activity]:
        if after.tzinfo is None:
            after_epoch = int(after.replace(tzinfo=timezone.utc).timestamp())
        else:
            after_epoch = int(after.timestamp())

        activities: list[Activity] = []
        page = 1
        while True:
            resp = httpx.get(
                f"{_API_BASE}/athlete/activities",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"after": after_epoch, "per_page": _PER_PAGE, "page": page},
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            activities.extend(self._activity_from(a) for a in batch)
            if len(batch) < _PER_PAGE:
                break
            page += 1
        return activities

    def fetch_athlete(self, access_token: str) -> AthleteProfile:
        resp = httpx.get(
            f"{_API_BASE}/athlete",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return self._athlete_from(resp.json())

    @staticmethod
    def _athlete_from(a: dict) -> AthleteProfile:
        first = (a.get("firstname") or "").strip()
        last = (a.get("lastname") or "").strip()
        name = " ".join(p for p in (first, last) if p) or None
        # Strava sex is "M"/"F"; the app stores "Male"/"Female" (onboarding buttons).
        sex = {"M": "Male", "F": "Female"}.get(a.get("sex") or "")
        weight = a.get("weight")
        # Strava measurement_preference is "feet"/"meters".
        units = {"feet": "imperial", "meters": "metric"}.get(a.get("measurement_preference") or "")
        return AthleteProfile(
            athlete_id=str(a["id"]) if a.get("id") is not None else None,
            name=name,
            sex=sex,
            weight_kg=round(float(weight), 1) if weight else None,
            unit_preference=units,
        )

    @staticmethod
    def _tokens_from(data: dict) -> OAuthTokens:
        athlete = data.get("athlete") or {}
        return OAuthTokens(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=int(data["expires_at"]),
            athlete_id=str(athlete["id"]) if athlete.get("id") is not None else None,
        )

    @staticmethod
    def _activity_from(a: dict) -> Activity:
        # start_date_local matches the user's wall-clock day (a 11pm run is "today").
        raw_start = a.get("start_date_local") or a["start_date"]
        start = datetime.fromisoformat(raw_start.replace("Z", "+00:00")).replace(tzinfo=None)
        moving = a.get("moving_time")
        dist = a.get("distance")
        hr = a.get("average_heartrate")
        # Relative Effort. Strava only returns it for HR-recorded activities.
        re = a.get("suffer_score")
        return Activity(
            external_id=str(a["id"]),
            type=a.get("sport_type") or a.get("type") or "",
            start=start,
            duration_minutes=round(moving / 60.0, 1) if moving else None,
            distance_km=round(dist / 1000.0, 2) if dist else None,
            avg_hr=round(hr) if hr else None,
            relative_effort=round(re) if re else None,
            name=a.get("name"),
        )
