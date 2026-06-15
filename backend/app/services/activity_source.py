"""Provider-agnostic activity ingestion.

One interface, many adapters (Strava first; Suunto / Garmin / Apple / Manual
later). The load calc and the Claude boundary never know which source produced
an activity — they only ever see a normalized ``Activity`` or the ``WorkoutLog``
it becomes.

    ActivitySource (interface)
        +-- StravaAdapter   (strava_adapter.py)   <- built first
        +-- ...future adapters
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

# Strava activity types we treat as a run (sport_type or type).
RUN_TYPES = {"Run", "TrailRun", "VirtualRun"}


@dataclass
class Activity:
    """A normalized activity, source-agnostic."""

    external_id: str
    type: str                       # raw provider type, e.g. "Run"
    start: datetime                 # local wall-clock start (naive); only the date is matched on
    duration_minutes: float | None
    distance_km: float | None
    avg_hr: int | None
    name: str | None = None

    @property
    def is_run(self) -> bool:
        return self.type in RUN_TYPES


@dataclass
class OAuthTokens:
    access_token: str
    refresh_token: str
    expires_at: int                 # epoch seconds
    athlete_id: str | None = None


class ActivitySource(ABC):
    """A provider that can authorize a user and return their activities."""

    @abstractmethod
    def authorize_url(self, redirect_uri: str, state: str | None = None) -> str:
        ...

    @abstractmethod
    def exchange_code(self, code: str, redirect_uri: str) -> OAuthTokens:
        ...

    @abstractmethod
    def refresh(self, refresh_token: str) -> OAuthTokens:
        ...

    @abstractmethod
    def fetch_activities(self, access_token: str, after: datetime) -> list[Activity]:
        ...
