"""Workout recalibration.

Called at end-of-week (or manually) to look at missed workouts
and regenerate next week's plan with context about what was skipped.
"""

import logging
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.module_config import ModuleConfig
from app.models.profile import Profile
from app.models.workout import WorkoutLog, ModuleType
from app.models.plan import WeeklyPlan
from app.services.claude_service import ClaudeService, ClaudeUnavailableError
from app.services.cross_module import get_signals, signals_to_context_string
from app.services.plan_generator import (
    save_plan,
    _profile_context,
    _parse_plan_json,
    check_polarization,
    eighty_twenty_rule,
)

logger = logging.getLogger("uvicorn.error")

_RECALIBRATION_SYSTEM = (
    "You are a triathlon running coach. A week has just ended. "
    "Recalibrate next week's plan based on what was missed. "
    "Don't just reschedule missed sessions — adjust intensity and volume sensibly. "
    "brickhub trains by one fixed model — 80/20 polarized — so the recalibrated week "
    "must stay polarized; do not drift into a moderate-heavy week. "
    "Return valid JSON only."
)


def recalibrate_running(
    db: Session,
    claude: ClaudeService,
    profile: Profile,
    current_week_start: date,
) -> WeeklyPlan:
    """Recalibrate the running plan based on missed sessions this week."""
    today = date.today()
    next_week_start = current_week_start + timedelta(weeks=1)

    missed = db.query(WorkoutLog).filter(
        WorkoutLog.module == "running",
        WorkoutLog.planned_at >= current_week_start,
        WorkoutLog.planned_at < next_week_start,
        WorkoutLog.completed_at.is_(None),
    ).all()

    completed = db.query(WorkoutLog).filter(
        WorkoutLog.module == "running",
        WorkoutLog.planned_at >= current_week_start,
        WorkoutLog.planned_at < next_week_start,
        WorkoutLog.completed_at.isnot(None),
    ).all()

    signals = get_signals(db, profile, today)
    signals_str = signals_to_context_string(signals)

    running_config = db.query(ModuleConfig).filter(
        ModuleConfig.profile_id == profile.id,
        ModuleConfig.module == "running",
    ).first()
    aerobic = bool(running_config and running_config.config_json.get("aerobic_base_priority"))

    missed_summary = ", ".join(
        f"{w.planned_at.strftime('%A')} ({w.notes or 'no notes'})"
        for w in missed
    ) or "none"

    completed_summary = f"{len(completed)} sessions completed"

    system_parts = [{"text": _RECALIBRATION_SYSTEM, "cache": True}]

    user_prompt = f"""Athlete profile:
{_profile_context(profile)}
{eighty_twenty_rule(aerobic)}

This week summary:
- Missed sessions: {missed_summary}
- {completed_summary}

Cross-module signals:
{signals_str}

Generate a recalibrated 7-day running plan for next week starting {next_week_start.isoformat()}.
Use the same JSON structure as always:
{{
  "week_start": "{next_week_start.isoformat()}",
  "module": "running",
  "summary": "...",
  "recalibration_note": "One sentence explaining why you made the adjustments you did",
  "days": [...]
}}"""

    def _generate() -> dict:
        raw = claude.generate_with_cache(
            system_parts,
            user_prompt,
            model="claude-haiku-4-5-20251001",
            call_type="recalibration",
        )
        return _parse_plan_json(raw)

    plan_json = _generate()
    ok, counts = check_polarization(plan_json.get("days", []), aerobic)
    if not ok:
        retry = _generate()
        ok_retry, counts_retry = check_polarization(retry.get("days", []), aerobic)
        plan_json = retry
        logger.warning(
            "polarization_trip module=running call=recalibration first=%s retry=%s aerobic_base=%s regen_fixed=%s",
            counts, counts_retry, aerobic, ok_retry,
        )
        if not ok_retry:
            plan_json["polarization_warning"] = (
                "This recalibrated week isn't a clean 80/20 split — review it before training."
            )

    return save_plan(db, "running", next_week_start, plan_json)
