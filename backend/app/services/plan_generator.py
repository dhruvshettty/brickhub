"""Training plan generation via Claude.

Each module has its own generator. All generators pull cross-module signals
and inject them into the Claude prompt so plans are aware of each other.
"""

import json
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.module_config import ModuleConfig
from app.models.profile import Profile
from app.models.plan import WeeklyPlan, ModuleType
from app.models.workout import WorkoutLog
from app.services.claude_service import ClaudeService, ClaudeUnavailableError
from app.services.cross_module import get_signals, signals_to_context_string


RUN_TYPES = {
    "sprint": ["easy", "tempo", "long"],
    "olympic": ["easy", "tempo", "interval", "long"],
    "70.3": ["easy", "tempo", "interval", "long", "race_pace"],
    "ironman": ["easy", "tempo", "interval", "long", "race_pace", "recovery"],
}


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

    aerobic_note = ""
    if config.get("aerobic_base_priority"):
        aerobic_note = (
            "\nIMPORTANT: This athlete's aerobic base is their primary limiter. "
            "Prioritise Zone 1-2 easy running. Keep at least 80% of sessions easy. "
            "Do not add tempo or interval work until week 4+."
        )

    race_terrain = config.get("race_terrain") or "unknown"
    training_terrain = config.get("training_terrain") or "unknown"

    terrain_note = ""
    if race_terrain != "unknown" and training_terrain != "unknown" and race_terrain != training_terrain:
        terrain_note = (
            f"\nNote: Athlete trains on {training_terrain} terrain but races on {race_terrain} terrain. "
            "Include terrain-specific preparation (e.g. hill sessions or downhill running) as race approaches."
        )

    volume_pref = config.get("volume_preference") or "steady"
    effort_pref = config.get("effort_preference") or "balanced"

    volume_desc = {
        "gradual": "conservative ~5%/week progression, lots of easy running, prioritise consistency over intensity",
        "steady": "standard ~8-10%/week progression, balanced build",
        "progressive": "block periodization — hard build weeks followed by planned recovery weeks, aggressive progression",
    }
    effort_desc = {
        "comfortable": "70-75% easy running, minimal intensity work, aerobic base focus",
        "balanced": "80/20 easy/hard, standard polarized training",
        "challenging": "push aerobic capacity with more threshold and interval sessions",
    }

    primary_note = ""
    if config.get("is_primary_sport"):
        primary_note = "\nPrimary sport: YES — this is the athlete's primary discipline. Schedule takes precedence over all other modules."

    user_set_note = ""
    if config.get("preferences_user_set"):
        user_set_note = "\nNote: athlete explicitly set volume and effort preferences — respect these even if cross-module signals suggest otherwise."

    lines = [
        f"Running goal: {config.get('target_distance', 'not set')}",
        f"Ability level: {config.get('ability_level', 'unknown')}",
        f"Aerobic base priority: {config.get('aerobic_base_priority', False)}",
        f"Runs per week: {config.get('suggested_runs_per_week', 3)}",
        f"Preferred days: {', '.join(config.get('preferred_days', []))}",
        f"Long run day: {config.get('long_run_day', 'sunday')}",
        f"Weeks to race: {weeks_to_race or 'unknown'}",
        f"Race terrain: {race_terrain}",
        f"Training terrain: {training_terrain}",
        f"Volume preference: {volume_pref} — {volume_desc.get(volume_pref, '')}",
        f"Effort preference: {effort_pref} — {effort_desc.get(effort_pref, '')}",
    ]
    return "\n".join(lines) + aerobic_note + terrain_note + primary_note + user_set_note


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
    ]

    running_config_str = ""
    if running_config:
        running_config_str = f"\nRunning configuration:\n{_running_config_context(running_config, today)}\n"

    user_prompt = f"""Cross-module signals (from all training this week):
{signals_str}
{running_config_str}
Recent running completion rate (last 4 weeks): {completion_rate:.0f}%

Generate a 7-day running plan for the week starting {week_start.isoformat()}.
Include rest days. Adjust intensity based on fatigue and cross-module signals.
Schedule runs on the athlete's preferred days when possible.

Return JSON with this exact structure:
{{
  "week_start": "{week_start.isoformat()}",
  "module": "running",
  "summary": "One sentence describing this week's focus",
  "days": [
    {{
      "date": "YYYY-MM-DD",
      "type": "easy|tempo|interval|long|race_pace|recovery|rest",
      "distance_km": 0,
      "duration_minutes": 0,
      "pace_zone": "zone1-5 or null",
      "description": "Brief instruction for this session"
    }}
  ]
}}"""

    raw = claude.generate_with_cache(system_parts, user_prompt)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Claude returned something with wrapping text — extract JSON
        import re
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not parse plan JSON from Claude response: {raw[:200]}")


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
