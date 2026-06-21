"""Training plan generation via Claude.

Each module has its own generator. All generators pull cross-module signals
and inject them into the Claude prompt so plans are aware of each other.
"""

import json
import logging
import re
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.module_config import ModuleConfig
from app.models.profile import Profile
from app.models.plan import WeeklyPlan, ModuleType
from app.models.workout import WorkoutLog
from app.services.claude_service import ClaudeService, ClaudeUnavailableError
from app.services.cross_module import get_signals, signals_to_context_string
from app.services.hr_zones import EASY_TYPES, HARD_TYPES

logger = logging.getLogger("uvicorn.error")


RUN_TYPES = {
    "sprint": ["easy", "tempo", "long"],
    "olympic": ["easy", "tempo", "interval", "long"],
    "70.3": ["easy", "tempo", "interval", "long", "race_pace"],
    "ironman": ["easy", "tempo", "interval", "long", "race_pace", "recovery"],
}


def eighty_twenty_rule(aerobic_base_priority: bool = False) -> str:
    """The single fixed 80/20 polarized distribution rule, injected into every
    plan-shaping prompt (generation, recalibration, coach). Successor to the old
    `effort_desc` dict — there is no longer a comfortable/balanced/challenging knob.
    """
    rule = (
        "\nTRAINING MODEL — 80/20 POLARIZED (this is the fixed model; do not deviate):"
        "\n  - ~80% of sessions must be genuinely EASY (easy / recovery / long) — conversational,"
        " Zone 1-2 aerobic. Easy means easy; never let an easy day drift into moderate effort."
        "\n  - The remaining ~20% is genuinely HARD: 1-2 quality sessions per week (tempo / interval /"
        " race_pace) run at real intensity (Zone 4-5). Never schedule 3 or more hard sessions in a week."
        "\n  - NO grey-zone junk miles: do not water down the hard days, and do not push the easy days"
        " into the moderate middle."
        "\n  - The long run counts as easy/aerobic, not as a hard session."
    )
    if aerobic_base_priority:
        rule += (
            "\n  - AEROBIC-BASE PRIORITY: this athlete's aerobic base is the limiter. A week with ZERO"
            " hard sessions (all easy) is perfectly acceptable — do not force a hard session in. Introduce"
            " intensity only gradually (around week 4+), and never more than 1-2 hard sessions."
        )
    return rule


def check_polarization(days: list[dict], aerobic_base_priority: bool = False) -> tuple[bool, dict]:
    """Coarse polarization sanity check on SESSION COUNTS (not volume-exact —
    session count != time share, and minutes are planned estimates). Over non-rest
    sessions, using the shared easy/hard buckets:

    - n >= 3: 1-2 hard (>=1 so the 20% exists, <=2 to enforce polarization) AND
      majority easy (count_easy >= count_hard).
    - n == 2 (the suggest_weekly_runs floor): the n>=3 rule is structurally
      impossible, so accept anything up to 1 hard — only 2 hard / 0 easy trips.
    - aerobic_base_priority: the >=1 hard lower bound is dropped UNCONDITIONALLY
      (0 hard always fine); the <=2 ceiling + majority-easy still hold.
    - n < 2: nothing to enforce.

    Returns (passes, counts) where counts = {n, hard, easy}.
    """
    non_rest = [d for d in days if d.get("type") != "rest"]
    n = len(non_rest)
    count_hard = sum(1 for d in non_rest if d.get("type") in HARD_TYPES)
    count_easy = sum(1 for d in non_rest if d.get("type") in EASY_TYPES)
    counts = {"n": n, "hard": count_hard, "easy": count_easy}

    if n < 2:
        return True, counts
    if aerobic_base_priority:
        return (count_hard <= 2 and count_easy >= count_hard), counts
    if n == 2:
        return (count_hard <= 1), counts
    return (1 <= count_hard <= 2 and count_easy >= count_hard), counts


def _parse_plan_json(raw: str) -> dict:
    """Parse Claude's plan response, tolerating wrapping prose."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not parse plan JSON from Claude response: {raw[:200]}")


def _profile_context(profile: Profile) -> str:
    lines = [
        f"Weekly training hours available: {profile.weekly_training_hours}",
        f"Age: {profile.age or 'unknown'}",
        f"Weight: {profile.weight_kg or 'unknown'} kg",
    ]
    return "\n".join(lines)


def _running_config_context(config: dict, today: date) -> str:
    race_date_str = config.get("race_date")
    weeks_to_race = None
    if race_date_str:
        try:
            race_dt = date.fromisoformat(race_date_str)
            weeks_to_race = max(0, (race_dt - today).days // 7)
        except ValueError:
            pass

    eighty_twenty_note = eighty_twenty_rule(bool(config.get("aerobic_base_priority")))

    race_terrain = config.get("race_terrain") or "unknown"
    training_terrain = config.get("training_terrain") or "unknown"

    terrain_note = ""
    if race_terrain != "unknown" and training_terrain != "unknown" and race_terrain != training_terrain:
        terrain_note = (
            f"\nNote: Athlete trains on {training_terrain} terrain but races on {race_terrain} terrain. "
            "Include terrain-specific preparation (e.g. hill sessions or downhill running) as race approaches."
        )

    volume_pref = config.get("volume_preference") or "steady"

    volume_desc = {
        "gradual": "conservative ~5%/week progression, lots of easy running, prioritise consistency over intensity",
        "steady": "standard ~8-10%/week progression, balanced build",
        "progressive": "block periodization — hard build weeks followed by planned recovery weeks, aggressive progression",
    }

    primary_note = ""
    if config.get("is_primary_sport"):
        primary_note = "\nPrimary sport: YES — this is the athlete's primary discipline. Schedule takes precedence over all other modules."

    user_set_note = ""
    if config.get("preferences_user_set"):
        user_set_note = "\nNote: athlete explicitly set their volume preference — respect it even if cross-module signals suggest otherwise."

    training_goal = config.get("training_goal")
    goal_map = {
        "beat_time": "beat a target finish time (running improvement plan, race optional)",
        "race": "prepare for a race — finish it or build fitness for it",
    }
    training_goal_line = f"Training goal: {goal_map.get(training_goal, training_goal)}" if training_goal else None

    goal_time_line = None
    if training_goal == "beat_time" and config.get("goal_target_time_seconds"):
        total = config["goal_target_time_seconds"]
        h, rem = divmod(total, 3600)
        m, s = divmod(rem, 60)
        goal_time_line = f"Target finish time: {h}:{m:02d}:{s:02d}"

    lines = [
        f"Running goal: {config.get('target_distance', 'not set')}",
        f"Ability level: {config.get('ability_level', 'unknown')}",
        f"Aerobic base priority: {config.get('aerobic_base_priority', False)}",
        f"Average weekly mileage (last 4 weeks): {config.get('current_weekly_km') or 'unknown'} km",
        f"Runs per week: {config.get('suggested_runs_per_week', 3)}",
        f"Preferred days: {', '.join(config.get('preferred_days', []))}",
        f"Long run day: {config.get('long_run_day', 'sunday')}",
        f"Weeks to race: {weeks_to_race or 'unknown'}",
        f"Race terrain: {race_terrain}",
        f"Training terrain: {training_terrain}",
        f"Volume preference: {volume_pref} — {volume_desc.get(volume_pref, '')}",
    ]
    if training_goal_line:
        lines.append(training_goal_line)
    if goal_time_line:
        lines.append(goal_time_line)

    break_note = ""
    if config.get("returning_from_break"):
        reason = config.get("break_reason") or "unspecified"
        duration = config.get("break_duration") or "unspecified"
        prior_km = config.get("prior_baseline_km")

        ability_factor = {"beginner": 0.40, "intermediate": 0.60, "advanced": 0.75, "elite": 0.85}
        duration_factor = {"under_1_month": 0.90, "1_3_months": 0.70, "3_6_months": 0.50, "over_6_months": 0.30}
        injury_cap = 0.50 if reason in ("injury", "illness") else 1.0
        current_km = config.get("current_weekly_km") or 0

        if prior_km:
            effective_km = round(
                prior_km
                * ability_factor.get(config.get("ability_level", "beginner"), 0.50)
                * duration_factor.get(duration, 0.60)
                * injury_cap,
                1,
            )
            effective_km = max(effective_km, current_km)

            duration_labels = {
                "under_1_month": "< 1 month", "1_3_months": "1–3 months",
                "3_6_months": "3–6 months", "over_6_months": "6+ months",
            }
            break_note = (
                f"\nRETURNING FROM BREAK:"
                f"\n  Reason: {reason}"
                f"\n  Break duration: {duration_labels.get(duration, duration)}"
                f"\n  Prior baseline: {prior_km} km/week"
                f"\n  Recommended week-1 volume: {effective_km} km/week (adjusted for ability level + break length)"
                f"\n  Do not treat this athlete as a beginner — they have a real training history."
                f"\n  Do not exceed {effective_km} km/week in week 1. Build conservatively from there."
            )
            if reason in ("injury", "illness"):
                break_note += (
                    f"\n  {reason.capitalize()} recovery: avoid high-intensity sessions in week 1."
                    " Prioritise easy aerobic running and joint-friendly movement."
                )

    return "\n".join(lines) + eighty_twenty_note + terrain_note + primary_note + user_set_note + break_note


def generate_running_plan(
    db: Session,
    claude: ClaudeService,
    profile: Profile,
    week_start: date,
) -> dict:
    """Generate a 7-day running plan. Returns the plan as a dict."""
    today = date.today()
    signals = get_signals(db, profile, today)
    signals_str = signals_to_context_string(signals)

    # Load running-specific config if available
    running_config_row = db.query(ModuleConfig).filter(
        ModuleConfig.profile_id == profile.id,
        ModuleConfig.module == "running",
    ).first()
    running_config = running_config_row.config_json if running_config_row else {}

    # Recent completions for context
    four_weeks_ago = week_start - timedelta(weeks=4)
    recent = db.query(WorkoutLog).filter(
        WorkoutLog.module == "running",
        WorkoutLog.planned_at >= four_weeks_ago,
    ).all()
    completion_rate = (
        len([w for w in recent if w.completed_at]) / max(len(recent), 1) * 100
    )

    system_parts = [
        {
            "text": (
                "You are a triathlon running coach. Generate adaptive, evidence-based training plans. "
                "You understand periodization, pace zones, and how to balance running with biking and swimming. "
                "Always return valid JSON only — no markdown, no explanations outside the JSON."
            ),
            "cache": True,
        },
        {
            "text": f"Athlete profile:\n{_profile_context(profile)}",
            "cache": True,
        },
        {
            "text": (
                "Return JSON with this exact structure:\n"
                '{\n'
                '  "week_start": "YYYY-MM-DD",\n'
                '  "module": "running",\n'
                '  "summary": "One sentence describing this week\'s focus",\n'
                '  "days": [\n'
                '    {\n'
                '      "date": "YYYY-MM-DD",\n'
                '      "type": "easy|tempo|interval|long|race_pace|recovery|rest",\n'
                '      "distance_km": 0,\n'
                '      "duration_minutes": 0,\n'
                '      "pace_zone": "zone1-5 or null",\n'
                '      "description": "Brief instruction for this session (what to do and how)",\n'
                '      "rationale": "1-2 sentences: why this session given the athlete\'s ability, goal, race timeline, and fatigue"\n'
                '    }\n'
                '  ]\n'
                '}'
            ),
            "cache": True,
        },
    ]

    running_config_str = ""
    earliest_session_date = today  # never schedule sessions before today
    if running_config:
        running_config_str = f"\nRunning configuration:\n{_running_config_context(running_config, today)}\n"
        plan_start_str = running_config.get("plan_start_date")
        if plan_start_str:
            try:
                plan_start = date.fromisoformat(plan_start_str)
                earliest_session_date = max(today, plan_start)
            except ValueError:
                pass

    user_prompt = f"""Cross-module signals (from all training this week):
{signals_str}
{running_config_str}
Recent running completion rate (last 4 weeks): {completion_rate:.0f}%

Generate a 7-day running plan for the week starting {week_start.isoformat()}.
IMPORTANT: Do not schedule any training sessions before {earliest_session_date.isoformat()}. Any days before this date must be type "rest" with distance_km 0, duration_minutes 0, and description "".
Include rest days. Adjust intensity based on fatigue and cross-module signals.
Schedule runs on the athlete's preferred days when possible.

Use {week_start.isoformat()} as the week_start value in your JSON response."""

    aerobic = bool(running_config.get("aerobic_base_priority"))

    def _generate() -> dict:
        raw = claude.generate_with_cache(system_parts, user_prompt, call_type="plan_generation")
        return _parse_plan_json(raw)

    plan_json = _generate()
    ok, counts = check_polarization(plan_json.get("days", []), aerobic)
    if not ok:
        # Regenerate once; if it's still off, ship with a warning but log the trip
        # so recurring 80/20 prompt-drift stays visible, not silent.
        retry = _generate()
        ok_retry, counts_retry = check_polarization(retry.get("days", []), aerobic)
        plan_json = retry
        logger.warning(
            "polarization_trip module=running first=%s retry=%s aerobic_base=%s regen_fixed=%s",
            counts, counts_retry, aerobic, ok_retry,
        )
        if not ok_retry:
            plan_json["polarization_warning"] = (
                "This week's plan isn't a clean 80/20 split (aim for 1-2 genuinely hard sessions "
                "and keep the rest easy). It was generated anyway — review it before training."
            )
    return plan_json


def save_plan(db: Session, module: str, week_start: date, plan_json: dict) -> WeeklyPlan:
    # Remove any existing plan for this week/module
    existing = db.query(WeeklyPlan).filter(
        WeeklyPlan.module == module,
        WeeklyPlan.week_start == week_start,
    ).first()
    if existing:
        db.delete(existing)
        db.flush()

    plan = WeeklyPlan(module=module, week_start=week_start, plan_json=plan_json)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan
