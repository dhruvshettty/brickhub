"""Tests for food plan generator deterministic logic.

Only the window algorithm and batch assignment are tested here — these are the
only silent-failure risks. Claude output validation is tested via integration.
"""

import pytest
from datetime import date

from app.services.food_plan_generator import _assign_nutrition_contexts, _assign_prep_batches


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_week(week_start: date, sessions: dict[int, tuple[str, float]]) -> list[dict]:
    """Build a 7-day days list. sessions = {day_index: (type, distance_km)}."""
    days = []
    for i in range(7):
        d = week_start.isoformat()
        type_, dist = sessions.get(i, ("rest", 0))
        days.append({"date": (date.fromisoformat(d) + __import__('datetime').timedelta(days=i)).isoformat(),
                     "type": type_, "distance_km": dist})
    # recalculate dates correctly
    from datetime import timedelta
    result = []
    for i in range(7):
        type_, dist = sessions.get(i, ("rest", 0))
        result.append({
            "date": (week_start + timedelta(days=i)).isoformat(),
            "type": type_,
            "distance_km": dist,
        })
    return result


MONDAY = date(2026, 4, 27)  # arbitrary Monday


# ── _assign_nutrition_contexts ────────────────────────────────────────────────

class TestWindowAlgorithmDefaults:
    def test_all_rest_days_get_maintenance(self):
        days = make_week(MONDAY, {})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert all(d["nutrition_context"] == "maintenance" for d in result)

    def test_easy_run_day_gets_maintenance(self):
        days = make_week(MONDAY, {2: ("easy", 8)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[2]["nutrition_context"] == "maintenance"


class TestTomorrowRule:
    def test_tomorrow_long_run_gte_15km_gives_carb_loading(self):
        # Monday has long 18km tomorrow on Tuesday
        days = make_week(MONDAY, {1: ("long", 18)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[0]["nutrition_context"] == "carb_loading_day"

    def test_tomorrow_long_run_lt_15km_no_carb_loading(self):
        # Long run but only 12km — does not trigger carb loading
        days = make_week(MONDAY, {1: ("long", 12)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[0]["nutrition_context"] == "maintenance"

    def test_tomorrow_interval_gives_carb_loading(self):
        days = make_week(MONDAY, {3: ("interval", 10)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[2]["nutrition_context"] == "carb_loading_day"

    def test_tomorrow_tempo_gives_pre_workout_moderate_carb(self):
        days = make_week(MONDAY, {4: ("tempo", 12)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[3]["nutrition_context"] == "pre_workout_moderate_carb"

    def test_tomorrow_easy_gives_maintenance(self):
        days = make_week(MONDAY, {2: ("easy", 10)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[1]["nutrition_context"] == "maintenance"

    def test_long_run_day_itself_gets_maintenance_not_carb_loading(self):
        # The long run day itself is not carb-loading — day BEFORE is
        days = make_week(MONDAY, {1: ("long", 18)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[1]["nutrition_context"] == "maintenance"

    def test_last_day_of_week_has_no_tomorrow(self):
        # Sunday — no tomorrow in this week's days, no carb loading
        days = make_week(MONDAY, {})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[6]["nutrition_context"] == "maintenance"


class TestYesterdayRule:
    def test_day_after_long_run_gives_recovery(self):
        days = make_week(MONDAY, {1: ("long", 18)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[2]["nutrition_context"] == "recovery_day"

    def test_day_after_long_run_lt_15km_no_recovery(self):
        days = make_week(MONDAY, {1: ("long", 12)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[2]["nutrition_context"] == "maintenance"

    def test_day_after_easy_run_no_recovery(self):
        days = make_week(MONDAY, {1: ("easy", 10)})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[2]["nutrition_context"] == "maintenance"

    def test_first_day_of_week_has_no_yesterday(self):
        # Monday — yesterday is Sunday of prior week, not in this days list
        days = make_week(MONDAY, {})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert result[0]["nutrition_context"] == "maintenance"


class TestPriorityOrdering:
    def test_tomorrow_beats_yesterday(self):
        # Yesterday was long run (→ recovery), but tomorrow is interval (→ carb_loading)
        # Priority 2 (tomorrow) beats Priority 3 (yesterday)
        days = make_week(MONDAY, {0: ("long", 18), 2: ("interval", 10)})
        result = _assign_nutrition_contexts(days, race_date=None)
        # Day 1 (Tuesday): yesterday was long, tomorrow is interval → carb_loading wins
        assert result[1]["nutrition_context"] == "carb_loading_day"

    def test_race_check_beats_tomorrow_rule(self):
        # Race on Wednesday (day 2), day 1 (Tuesday) has tomorrow = interval
        # but race T-1 is not a special case — only T-3, T-2, T, T+1 are
        # So day 0 (Monday) = T-2 → carb_loading (race check, priority 1)
        from datetime import timedelta
        race_date = MONDAY + timedelta(days=2)  # Wednesday = day index 2
        days = make_week(MONDAY, {3: ("interval", 10)})  # interval on Thursday
        result = _assign_nutrition_contexts(days, race_date=race_date)
        # Monday (T-2): race check priority 1 → carb_loading_day
        assert result[0]["nutrition_context"] == "carb_loading_day"
        # Tuesday (T-1): no special race rule (T-1 not in the list), tomorrow = race_morning day
        # but tomorrow's session would be "rest" (we didn't set day 2), so falls through to maintenance
        assert result[1]["nutrition_context"] == "maintenance"

    def test_race_day_gives_race_morning(self):
        from datetime import timedelta
        race_date = MONDAY + timedelta(days=3)  # Thursday
        days = make_week(MONDAY, {})
        result = _assign_nutrition_contexts(days, race_date=race_date)
        assert result[3]["nutrition_context"] == "race_morning"

    def test_day_after_race_gives_post_race_recovery(self):
        from datetime import timedelta
        race_date = MONDAY + timedelta(days=3)  # Thursday
        days = make_week(MONDAY, {})
        result = _assign_nutrition_contexts(days, race_date=race_date)
        assert result[4]["nutrition_context"] == "post_race_recovery"

    def test_t_minus_3_gives_carb_loading(self):
        from datetime import timedelta
        race_date = MONDAY + timedelta(days=5)  # Saturday = day 5
        days = make_week(MONDAY, {})
        result = _assign_nutrition_contexts(days, race_date=race_date)
        # T-3 = Wednesday (day 2), T-2 = Thursday (day 3)
        assert result[2]["nutrition_context"] == "carb_loading_day"
        assert result[3]["nutrition_context"] == "carb_loading_day"
        assert result[5]["nutrition_context"] == "race_morning"
        assert result[6]["nutrition_context"] == "post_race_recovery"

    def test_race_outside_7_days_ignored(self):
        from datetime import timedelta
        race_date = MONDAY + timedelta(days=14)  # two weeks out
        days = make_week(MONDAY, {})
        result = _assign_nutrition_contexts(days, race_date=race_date)
        assert all(d["nutrition_context"] == "maintenance" for d in result)

    def test_no_race_date_skips_race_check(self):
        days = make_week(MONDAY, {})
        result = _assign_nutrition_contexts(days, race_date=None)
        assert all(d["nutrition_context"] == "maintenance" for d in result)


class TestFullWeekIntegration:
    def test_typical_week_long_run_sunday(self):
        """Mon easy, Wed tempo, Fri interval, Sun long — verify all contexts."""
        from datetime import timedelta
        days = make_week(MONDAY, {
            0: ("easy", 8),   # Mon
            2: ("tempo", 12), # Wed
            4: ("interval", 10), # Fri
            6: ("long", 20),  # Sun
        })
        result = _assign_nutrition_contexts(days, race_date=None)
        contexts = {d["date"]: d["nutrition_context"] for d in result}

        mon = (MONDAY).isoformat()
        tue = (MONDAY + timedelta(1)).isoformat()
        wed = (MONDAY + timedelta(2)).isoformat()
        thu = (MONDAY + timedelta(3)).isoformat()
        fri = (MONDAY + timedelta(4)).isoformat()
        sat = (MONDAY + timedelta(5)).isoformat()
        sun = (MONDAY + timedelta(6)).isoformat()

        assert contexts[mon] == "maintenance"        # easy run, nothing special around it
        assert contexts[tue] == "pre_workout_moderate_carb"  # tomorrow = tempo
        assert contexts[wed] == "maintenance"        # tempo day itself
        assert contexts[thu] == "carb_loading_day"   # tomorrow = interval
        assert contexts[fri] == "maintenance"        # interval day itself
        assert contexts[sat] == "carb_loading_day"   # tomorrow = long ≥15km
        assert contexts[sun] == "maintenance"        # long run day (no tomorrow in week)


# ── _assign_prep_batches ──────────────────────────────────────────────────────

class TestPrepBatchAssignment:
    def _days(self):
        from datetime import timedelta
        return [{"date": (MONDAY + timedelta(i)).isoformat()} for i in range(7)]

    def test_every_3_days_batch_assignment(self):
        days = self._days()
        result = _assign_prep_batches(days, "every_3_days")
        batches = [d["prep_batch"] for d in result]
        assert batches == [1, 1, 1, 2, 2, 2, 2]

    def test_every_2_days_batch_assignment(self):
        days = self._days()
        result = _assign_prep_batches(days, "every_2_days")
        batches = [d["prep_batch"] for d in result]
        assert batches == [1, 1, 2, 2, 3, 3, 4]

    def test_daily_batch_assignment(self):
        days = self._days()
        result = _assign_prep_batches(days, "daily")
        batches = [d["prep_batch"] for d in result]
        assert batches == [1, 2, 3, 4, 5, 6, 7]

    def test_unknown_frequency_defaults_to_every_3_days(self):
        days = self._days()
        result = _assign_prep_batches(days, "unknown_value")
        batches = [d["prep_batch"] for d in result]
        assert batches == [1, 1, 1, 2, 2, 2, 2]

    def test_original_day_data_preserved(self):
        days = [{"date": "2026-04-27", "type": "long", "distance_km": 18}]
        result = _assign_prep_batches(days, "daily")
        assert result[0]["type"] == "long"
        assert result[0]["distance_km"] == 18
        assert result[0]["prep_batch"] == 1
