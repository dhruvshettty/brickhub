"""Tests for the M5 80/20 polarized model + personalized HR zones.

Covers the silent-failure risks: HR-zone derivation, the polarization guardrail
(including the n=2 floor and the unconditional aerobic-base exception), the
session-type buckets, read-time HR binding + RPE fallback, the effort_preference
removal, and — critically — the AI-clause boundary (no HR / HRmax in any prompt).
Nothing here hits the network.
"""

import pytest
from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — register every table on Base.metadata
from app.core.database import Base
from app.models.plan import WeeklyPlan
from app.models.profile import Profile

from app.services import hr_zones
from app.services.hr_zones import (
    EASY_TYPES, HARD_TYPES, bind_education, bucket_for_type, derive_zones,
    seed_hrmax_from_age,
)
from app.services.plan_generator import (
    check_polarization, eighty_twenty_rule, _running_config_context,
)
from app.services import coach_service, workout_adjuster
from app.api.v1 import settings as settings_api
from app.api.v1.running import RunningConfigRequest


# ── fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def days_of(*types: str) -> list[dict]:
    """Build a minimal days list from session types."""
    return [{"date": "2026-06-22", "type": t, "distance_km": 8} for t in types]


# ── HR-zone derivation ─────────────────────────────────────────────────────────

class TestDeriveZones:
    def test_happy(self):
        z = derive_zones(190)
        assert z[1] == (round(190 * 0.55), round(190 * 0.72))
        assert z[2] == (137, 156)
        assert z[5] == (175, 190)

    def test_band_edges_contiguous(self):
        # Each zone's high is the next zone's low — no gaps, no overlaps.
        z = derive_zones(190)
        assert z[1][1] == z[2][0]
        assert z[2][1] == z[3][0]
        assert z[4][1] == z[5][0]

    def test_none_and_zero(self):
        assert derive_zones(None) is None
        assert derive_zones(0) is None


class TestSeedHrmax:
    def test_happy(self):
        assert seed_hrmax_from_age(30) == 190

    def test_none(self):
        assert seed_hrmax_from_age(None) is None

    def test_extremes(self):
        assert seed_hrmax_from_age(10) == 210
        assert seed_hrmax_from_age(80) == 140


# ── session-type buckets ───────────────────────────────────────────────────────

class TestBuckets:
    def test_easy_bucket(self):
        for t in ("easy", "recovery", "long"):
            assert bucket_for_type(t) == "easy"

    def test_hard_bucket(self):
        for t in ("tempo", "interval", "race_pace"):
            assert bucket_for_type(t) == "hard"

    def test_rest_and_unknown_have_no_bucket(self):
        assert bucket_for_type("rest") is None
        assert bucket_for_type("threshold") is None  # no such type exists

    def test_buckets_partition_the_enum(self):
        assert EASY_TYPES.isdisjoint(HARD_TYPES)


# ── polarization guardrail ─────────────────────────────────────────────────────

class TestGuardrail:
    def test_pass_one_hard_majority_easy(self):
        ok, c = check_polarization(days_of("easy", "easy", "long", "tempo"))
        assert ok and c == {"n": 4, "hard": 1, "easy": 3}

    def test_pass_two_hard(self):
        ok, _ = check_polarization(days_of("easy", "easy", "tempo", "interval"))
        assert ok

    def test_zero_hard_trips(self):
        ok, _ = check_polarization(days_of("easy", "easy", "easy", "long"))
        assert not ok

    def test_three_hard_trips(self):
        ok, _ = check_polarization(days_of("tempo", "interval", "race_pace", "easy"))
        assert not ok

    def test_majority_easy_required(self):
        # 2 hard / 2 easy is fine (>=), but 2 hard / 1 easy is not majority-easy.
        assert check_polarization(days_of("easy", "easy", "tempo", "interval"))[0]
        assert not check_polarization(days_of("easy", "tempo", "interval"))[0]

    def test_aerobic_base_allows_zero_hard_unconditionally(self):
        ok, _ = check_polarization(days_of("easy", "easy", "easy", "long"), aerobic_base_priority=True)
        assert ok

    def test_aerobic_base_still_caps_at_two_hard(self):
        ok, _ = check_polarization(days_of("tempo", "interval", "race_pace", "easy"), aerobic_base_priority=True)
        assert not ok

    def test_n2_one_easy_one_hard_ok(self):
        assert check_polarization(days_of("easy", "tempo"))[0]

    def test_n2_two_easy_does_not_trip(self):
        # The 2-run floor must not false-warn (eng review).
        assert check_polarization(days_of("easy", "long"))[0]

    def test_n2_two_hard_trips(self):
        assert not check_polarization(days_of("tempo", "interval"))[0]

    def test_rest_days_excluded(self):
        ok, c = check_polarization(days_of("rest", "rest", "easy", "easy", "easy", "tempo", "rest"))
        assert ok and c["n"] == 4


# ── read-time HR binding ───────────────────────────────────────────────────────

class TestHrBinding:
    def test_zone_lookup_easy(self):
        d = bind_education({"date": "x", "type": "easy"}, derive_zones(190))
        assert d["zone"] == 2 and d["intensity"] == "easy"
        assert d["hr_range"] == "Zone 2 · ~137-156 bpm"
        assert d["rpe_text"] is None
        assert d["effort_tag"]

    def test_zone_lookup_interval_is_hard(self):
        d = bind_education({"date": "x", "type": "interval"}, derive_zones(190))
        assert d["zone"] == 5 and d["intensity"] == "hard"
        assert "the 20%" in d["effort_tag"]

    def test_unset_zones_fall_back_to_rpe(self):
        d = bind_education({"date": "x", "type": "tempo"}, None)
        assert d["hr_range"] is None
        assert d["rpe_text"] and "RPE" in d["rpe_text"]
        assert d["effort_tag"]  # role tag still present

    def test_rest_day_gets_nothing(self):
        d = bind_education({"date": "x", "type": "rest"}, derive_zones(190))
        assert "hr_range" not in d and "effort_tag" not in d


# ── effort_preference removal ──────────────────────────────────────────────────

class TestEffortRemoved:
    def test_request_schema_has_no_effort_preference(self):
        assert "effort_preference" not in RunningConfigRequest.model_fields

    def test_volume_preference_survives(self):
        assert "volume_preference" in RunningConfigRequest.model_fields

    def test_context_has_no_effort_line_and_has_8020(self):
        ctx = _running_config_context({"target_distance": "10k", "volume_preference": "steady"}, date(2026, 6, 22))
        assert "Effort preference" not in ctx
        assert "80/20" in ctx

    def test_stale_effort_key_is_ignored(self):
        # An old config blob may still carry effort_preference — it must not surface.
        ctx = _running_config_context(
            {"target_distance": "10k", "effort_preference": "challenging"}, date(2026, 6, 22)
        )
        assert "challenging" not in ctx
        assert "Effort preference" not in ctx


# ── 80/20 carries into recalibration + coach ───────────────────────────────────

class TestModelCarriesThrough:
    def test_recalibration_system_is_polarized(self):
        assert "80/20" in workout_adjuster._RECALIBRATION_SYSTEM

    def test_aerobic_rule_drops_lower_bound_text(self):
        assert "AEROBIC-BASE PRIORITY" in eighty_twenty_rule(True)
        assert "AEROBIC-BASE PRIORITY" not in eighty_twenty_rule(False)

    def test_coach_prompt_injects_8020_but_never_hr(self, db):
        p = Profile(name="A", age=30, hr_max_bpm=190, weekly_training_hours=8)
        db.add(p)
        db.commit()
        db.refresh(p)
        week_start = date.today() - timedelta(days=date.today().weekday())
        db.add(WeeklyPlan(
            module="running", week_start=week_start,
            plan_json={"summary": "wk", "days": [
                {"date": week_start.isoformat(), "type": "easy", "distance_km": 8, "pace_zone": "zone2"},
            ]},
        ))
        db.commit()
        system = coach_service._build_coach_system(p, db, date.today())
        assert "80/20" in system
        # AI-clause: the athlete's HR / HRmax must never reach the prompt.
        assert "190" not in system
        assert "bpm" not in system.lower()


# ── AI-clause: nothing HR-shaped in the plan prompt context ─────────────────────

class TestAiClause:
    def test_plan_context_has_no_hr(self):
        ctx = _running_config_context(
            {"target_distance": "10k", "ability_level": "intermediate", "aerobic_base_priority": True},
            date(2026, 6, 22),
        )
        assert "bpm" not in ctx.lower()
        assert "hr_max" not in ctx.lower()

    def test_eighty_twenty_rule_has_no_hr(self):
        for rule in (eighty_twenty_rule(False), eighty_twenty_rule(True)):
            assert "bpm" not in rule.lower()


# ── migration 012 / profile HR seeding ─────────────────────────────────────────

class TestProfileHrMax:
    def test_column_exists(self, db):
        p = Profile(name="A")
        db.add(p)
        db.commit()
        db.refresh(p)
        assert p.hr_max_bpm is None

    def test_seeds_from_age_on_update(self, db):
        db.add(Profile(name="A"))
        db.commit()
        resp = settings_api.update_profile(settings_api.ProfileUpdate(age=30), db)
        assert resp.hr_max_bpm == 190
        assert resp.hr_zones is not None and resp.hr_zones[2] == (137, 156)

    def test_user_set_hrmax_not_overwritten_by_age(self, db):
        db.add(Profile(name="A"))
        db.commit()
        settings_api.update_profile(settings_api.ProfileUpdate(hr_max_bpm=185), db)
        resp = settings_api.update_profile(settings_api.ProfileUpdate(age=20), db)
        assert resp.hr_max_bpm == 185  # seed-once: age edit doesn't clobber

    def test_out_of_range_hrmax_rejected(self, db):
        from fastapi import HTTPException
        db.add(Profile(name="A"))
        db.commit()
        with pytest.raises(HTTPException):
            settings_api.update_profile(settings_api.ProfileUpdate(hr_max_bpm=300), db)
