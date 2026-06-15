"""Tests for Strava integration.

Covers the silent-failure risks: the pure activity->session matching rule,
adapter normalization of the Strava payload, and the sync orchestration
(debounce, incremental cursor, dedupe, token refresh) over an in-memory DB.
Nothing here hits the network — a FakeSource stands in for Strava.
"""

import time
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — register every table on Base.metadata
from app.core.database import Base
from app.models.plan import WeeklyPlan
from app.models.profile import Profile
from app.models.workout import ModuleType, WorkoutLog, WorkoutSource
from app.api.v1 import strava as strava_api
from app.services import strava_onboarding, strava_sync
from app.services.activity_source import Activity, ActivitySource, AthleteProfile, OAuthTokens
from app.services.strava_adapter import StravaAdapter


# ── helpers ───────────────────────────────────────────────────────────────────

def act(ext_id, day: date, type="Run", dur=40.0, dist=8.0, hr=150) -> Activity:
    return Activity(
        external_id=str(ext_id),
        type=type,
        start=datetime.combine(day, datetime.min.time()).replace(hour=7),
        duration_minutes=dur,
        distance_km=dist,
        avg_hr=hr,
    )


class FakeSource(ActivitySource):
    """Canned ActivitySource — no network."""

    def __init__(self, activities, expires_at=9_999_999_999, athlete=None):
        self._activities = activities
        self._expires = expires_at
        self.refreshed = False
        self._athlete = athlete or AthleteProfile(
            athlete_id="99", name="Test Athlete", sex="Male",
            weight_kg=72.0, unit_preference="metric",
        )

    def authorize_url(self, redirect_uri, state=None):
        return "https://example.test/authorize"

    def exchange_code(self, code, redirect_uri):
        return OAuthTokens("access", "refresh", self._expires, "99")

    def refresh(self, refresh_token):
        self.refreshed = True
        return OAuthTokens("new-access", "new-refresh", self._expires, "99")

    def fetch_activities(self, access_token, after):
        return [a for a in self._activities if a.start >= after]

    def fetch_athlete(self, access_token):
        return self._athlete


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def seed_plan(db, planned_days: list[date]):
    monday = planned_days[0] - timedelta(days=planned_days[0].weekday())
    db.add(WeeklyPlan(
        module="running",
        week_start=monday,
        plan_json={"days": [{"date": d.isoformat(), "type": "easy", "distance_km": 8} for d in planned_days]},
    ))
    db.commit()


def seed_profile(db, **kwargs) -> Profile:
    p = Profile(name="Athlete", **kwargs)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


# ── match_activities (pure) ─────────────────────────────────────────────────

class TestMatching:
    def test_single_run_auto_imports(self):
        d = date(2026, 6, 10)
        res = strava_sync.match_activities([act(1, d)], set(), set())
        assert len(res.auto) == 1
        assert res.auto_dates["1"] == d.isoformat()
        assert res.ambiguous == []

    def test_unplanned_run_still_auto_imports_as_extra(self):
        # The key behavior: a run on a day with no planned session is NOT ambiguous —
        # it imports as an extra run on its own date.
        d = date(2026, 6, 10)
        res = strava_sync.match_activities([act(1, d)], set(), set())
        assert res.auto_dates["1"] == d.isoformat()
        assert res.ambiguous == []

    def test_multiple_activities_same_day_ambiguous(self):
        d = date(2026, 6, 10)
        res = strava_sync.match_activities([act(1, d), act(2, d)], set(), set())
        assert res.auto == []
        assert {x["reason"] for x in res.ambiguous} == {"multiple_activities"}
        assert len(res.ambiguous) == 2

    def test_already_logged_is_ambiguous(self):
        d = date(2026, 6, 10)
        res = strava_sync.match_activities([act(1, d)], set(), {d.isoformat()})
        assert res.auto == []
        assert res.ambiguous[0]["reason"] == "already_logged"

    def test_dedupe_by_external_id(self):
        d = date(2026, 6, 10)
        res = strava_sync.match_activities([act(1, d)], {"1"}, set())
        assert res.auto == [] and res.ambiguous == []

    def test_non_run_ignored(self):
        d = date(2026, 6, 10)
        res = strava_sync.match_activities([act(1, d, type="Ride")], set(), set())
        assert res.auto == [] and res.ambiguous == []


# ── adapter normalization (pure) ────────────────────────────────────────────

class TestAdapterNormalization:
    def test_full_payload(self):
        a = StravaAdapter._activity_from({
            "id": 123, "type": "Run", "sport_type": "Run",
            "start_date_local": "2026-06-10T07:30:00Z", "start_date": "2026-06-10T05:30:00Z",
            "moving_time": 2400, "distance": 8000, "average_heartrate": 152.4, "name": "Morning Run",
        })
        assert a.external_id == "123"
        assert a.is_run
        assert a.duration_minutes == 40.0
        assert a.distance_km == 8.0
        assert a.avg_hr == 152
        assert a.start.date().isoformat() == "2026-06-10"

    def test_missing_optional_fields(self):
        a = StravaAdapter._activity_from({
            "id": 9, "type": "Run", "start_date": "2026-06-10T05:30:00Z",
        })
        assert a.duration_minutes is None and a.distance_km is None and a.avg_hr is None

    def test_prefers_local_start(self):
        a = StravaAdapter._activity_from({
            "id": 1, "type": "Run",
            "start_date_local": "2026-06-10T23:30:00", "start_date": "2026-06-11T03:30:00Z",
        })
        # 11:30pm local stays on the 10th, not bumped to the 11th by UTC
        assert a.start.date().isoformat() == "2026-06-10"

    def test_tokens_with_and_without_athlete(self):
        t = StravaAdapter._tokens_from({"access_token": "a", "refresh_token": "r", "expires_at": 1, "athlete": {"id": 7}})
        assert t.athlete_id == "7"
        t2 = StravaAdapter._tokens_from({"access_token": "a", "refresh_token": "r", "expires_at": 1})
        assert t2.athlete_id is None

    def test_authorize_url_requests_private_scope(self):
        url = StravaAdapter("cid", "secret").authorize_url("http://localhost:8000/cb", state="onboarding")
        # read_all so private runs import; profile:read_all so weight/units prefill
        assert "activity%3Aread_all" in url
        assert "profile%3Aread_all" in url
        assert "client_id=cid" in url
        assert "redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fcb" in url
        assert "state=onboarding" in url


# ── athlete profile normalization + onboarding prefill ──────────────────────

class TestAthleteNormalization:
    def test_full_payload(self):
        a = StravaAdapter._athlete_from({
            "id": 123, "firstname": "Dhruv", "lastname": "Shetty",
            "sex": "M", "weight": 71.5, "measurement_preference": "meters",
        })
        assert a.athlete_id == "123"
        assert a.name == "Dhruv Shetty"
        assert a.sex == "Male"
        assert a.weight_kg == 71.5
        assert a.unit_preference == "metric"

    def test_imperial_female(self):
        a = StravaAdapter._athlete_from({"id": 1, "sex": "F", "measurement_preference": "feet"})
        assert a.sex == "Female"
        assert a.unit_preference == "imperial"

    def test_missing_fields_are_none(self):
        a = StravaAdapter._athlete_from({"id": 1})
        assert a.name is None and a.sex is None
        assert a.weight_kg is None and a.unit_preference is None

    def test_zero_weight_treated_as_unset(self):
        assert StravaAdapter._athlete_from({"id": 1, "weight": 0}).weight_kg is None


class TestOnboardingPrefill:
    def test_prefill_drops_nulls(self):
        p = strava_onboarding.prefill_from_athlete(
            AthleteProfile(name="A", sex=None, weight_kg=70.0, unit_preference=None)
        )
        assert p == {"name": "A", "weight_kg": 70.0}

    def test_diff_flags_changed_only(self, db):
        prof = seed_profile(db, sex="Male", weight_kg=72.0, unit_preference="metric")
        diff = strava_onboarding.diff_against_profile(
            {"name": "Real Name", "sex": "Male", "weight_kg": 75.0, "unit_preference": "metric"},
            prof,
        )
        assert diff["name"]["strava"] == "Real Name"   # name differs from default "Athlete"
        assert diff["weight_kg"]["strava"] == 75.0      # > epsilon
        assert "sex" not in diff and "unit_preference" not in diff

    def test_diff_weight_epsilon_ignored(self, db):
        prof = seed_profile(db, weight_kg=72.0)
        assert strava_onboarding.diff_against_profile({"weight_kg": 72.05}, prof) == {}

    def test_diff_blank_local_is_change(self, db):
        prof = seed_profile(db)  # weight_kg is None
        diff = strava_onboarding.diff_against_profile({"weight_kg": 70.0}, prof)
        assert diff["weight_kg"] == {"current": None, "strava": 70.0}


class TestReturnPathWhitelist:
    """Open-redirect guard: callback only honors known frontend paths."""

    def test_known_paths(self):
        assert strava_api._RETURN_PATHS.get("onboarding") == "/onboarding"
        assert strava_api._RETURN_PATHS.get("settings") == "/settings"

    def test_unknown_state_falls_back(self):
        assert strava_api._RETURN_PATHS.get("https://evil.test", strava_api._DEFAULT_RETURN) == "/settings"


# ── sync orchestration (DB) ──────────────────────────────────────────────────

class TestSync:
    def test_not_connected_is_noop(self, db):
        p = seed_profile(db)
        out = strava_sync.sync(db, p, FakeSource([]))
        assert out["connected"] is False

    def test_first_sync_imports_and_sets_cursor(self, db):
        today = date.today()
        seed_plan(db, [today])
        p = seed_profile(db, strava_access_token="tok", strava_refresh_token="r", strava_token_expires_at=9_999_999_999)
        out = strava_sync.sync(db, p, FakeSource([act(1, today)]))

        assert len(out["imported"]) == 1
        assert p.strava_last_synced_at is not None
        log = db.query(WorkoutLog).filter(WorkoutLog.external_id == "1").one()
        assert log.source == WorkoutSource.imported
        assert log.completed_at is not None
        assert log.planned_at.date() == today

    def test_unplanned_run_auto_imports(self, db):
        # A run on a day with no planned session imports as an extra run (not ambiguous).
        today = date.today()
        yesterday = today - timedelta(days=1)
        p = seed_profile(db, strava_access_token="tok", strava_token_expires_at=9_999_999_999)
        out = strava_sync.sync(db, p, FakeSource([act(2, yesterday)]))
        assert len(out["imported"]) == 1
        assert out["ambiguous"] == []
        log = db.query(WorkoutLog).filter(WorkoutLog.external_id == "2").one()
        assert log.planned_at.date() == yesterday

    def test_debounce_skips_within_window(self, db):
        p = seed_profile(db, strava_access_token="tok", strava_last_synced_at=datetime.utcnow())
        out = strava_sync.sync(db, p, FakeSource([]))
        assert out["skipped"] is True

    def test_force_overrides_debounce(self, db):
        p = seed_profile(db, strava_access_token="tok", strava_token_expires_at=9_999_999_999,
                         strava_last_synced_at=datetime.utcnow())
        out = strava_sync.sync(db, p, FakeSource([]), force=True)
        assert out["skipped"] is False

    def test_resync_is_idempotent(self, db):
        today = date.today()
        seed_plan(db, [today])
        p = seed_profile(db, strava_access_token="tok", strava_token_expires_at=9_999_999_999)
        strava_sync.sync(db, p, FakeSource([act(1, today)]))
        strava_sync.sync(db, p, FakeSource([act(1, today)]), force=True)
        assert db.query(WorkoutLog).filter(WorkoutLog.external_id == "1").count() == 1

    def test_expired_token_refreshed(self, db):
        p = seed_profile(db, strava_access_token="old", strava_refresh_token="r",
                         strava_token_expires_at=int(time.time()) - 100)
        source = FakeSource([])
        strava_sync.sync(db, p, source, force=True)
        assert source.refreshed is True
        assert p.strava_access_token == "new-access"


class TestDayActivities:
    """The plan response must surface actual run numbers, including runs done on
    unplanned (rest) days — otherwise the planned-session grid hides them."""

    def test_surfaces_completed_runs_excludes_missed(self, db):
        from app.api.v1.running import _day_activities_for_week
        monday = date(2026, 6, 15)
        db.add(WorkoutLog(
            module=ModuleType.running,
            planned_at=datetime(2026, 6, 15, 0, 0),       # a rest day — still surfaces
            completed_at=datetime(2026, 6, 15, 7, 0),
            distance_km=5.01, duration_minutes=40.0, avg_hr=162,
            source=WorkoutSource.imported, external_id="x1",
        ))
        db.add(WorkoutLog(
            module=ModuleType.running,
            planned_at=datetime(2026, 6, 17, 0, 0),
            completed_at=None,                            # missed — must not surface
            source=WorkoutSource.manual,
        ))
        db.commit()

        out = _day_activities_for_week(db, monday)
        assert out["2026-06-15"] == {
            "source": "imported", "distance_km": 5.01, "duration_minutes": 40.0, "avg_hr": 162,
        }
        assert "2026-06-17" not in out
