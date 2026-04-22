"""Cross-module intelligence engine.

Reads state from all modules and produces signals that get injected into
every Claude prompt. This is the key differentiator: each module knows
what's happening in every other module.
"""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.module_config import ModuleConfig
from app.models.profile import Profile
from app.models.workout import WorkoutLog, ModuleType


def _get_race_date(db: Session, profile_id: int) -> date | None:
    """Pull race_date from whichever module config has one set."""
    config = db.query(ModuleConfig).filter(
        ModuleConfig.profile_id == profile_id,
        ModuleConfig.module == "running",
    ).first()
    if config:
        raw = config.config_json.get("race_date")
        if raw:
            try:
                return date.fromisoformat(raw)
            except ValueError:
                pass
    return None


def get_signals(db: Session, profile: Profile, today: date) -> dict:
    """Returns cross-module signals for injection into Claude prompts."""
    week_start = today - timedelta(days=today.weekday())

    week_logs = (
        db.query(WorkoutLog)
        .filter(WorkoutLog.planned_at >= week_start)
        .all()
    )

    completed = [w for w in week_logs if w.completed_at is not None]
    missed = [w for w in week_logs if w.completed_at is None]

    # Brick detection: bike + run on the same day (yesterday)
    yesterday = today - timedelta(days=1)
    yesterday_logs = [w for w in completed if w.completed_at and w.completed_at.date() == yesterday]
    yesterday_modules = {w.module for w in yesterday_logs}
    brick_yesterday = ModuleType.biking in yesterday_modules and ModuleType.running in yesterday_modules

    # Training load: total minutes completed this week
    total_minutes = sum(w.duration_minutes or 0 for w in completed)

    # Race proximity — read from module configs
    race_proximity = None
    days_to_race = None
    race_date = _get_race_date(db, profile.id)
    if race_date:
        days_to_race = (race_date - today).days
        if days_to_race <= 7:
            race_proximity = "race_week"
        elif days_to_race <= 14:
            race_proximity = "2_weeks"
        elif days_to_race <= 30:
            race_proximity = "1_month"
        else:
            race_proximity = f"{days_to_race}d"

    fatigue_level = "low"
    if total_minutes > 300:
        fatigue_level = "high"
    elif total_minutes > 150:
        fatigue_level = "moderate"

    return {
        "fatigue_level": fatigue_level,
        "total_training_minutes_this_week": round(total_minutes),
        "completed_sessions": len(completed),
        "missed_sessions": len(missed),
        "brick_yesterday": brick_yesterday,
        "race_proximity": race_proximity,
        "days_to_race": days_to_race,
    }


def signals_to_context_string(signals: dict) -> str:
    """Format signals as a readable string for injection into Claude prompts."""
    lines = [
        f"- Fatigue level this week: {signals['fatigue_level']}",
        f"- Training this week: {signals['total_training_minutes_this_week']} minutes completed",
        f"- Sessions completed: {signals['completed_sessions']}, missed: {signals['missed_sessions']}",
    ]
    if signals["brick_yesterday"]:
        lines.append("- Did a brick session (bike + run) yesterday — legs may be fatigued")
    if signals["race_proximity"]:
        lines.append(f"- Race proximity: {signals['race_proximity']} ({signals['days_to_race']} days)")
    return "\n".join(lines)
