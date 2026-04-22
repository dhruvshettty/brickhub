from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.module_config import ModuleConfig
from app.models.plan import WeeklyPlan
from app.models.workout import WorkoutLog
from app.services.cross_module import get_signals
from app.api.v1.settings import _get_or_create_profile

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    """Unified dashboard data: this week's status across all modules."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    profile = _get_or_create_profile(db)

    plans = db.query(WeeklyPlan).filter(WeeklyPlan.week_start == week_start).all()
    plans_by_module = {p.module: p.plan_json for p in plans}

    logs = db.query(WorkoutLog).filter(WorkoutLog.planned_at >= week_start).all()
    completed_by_module: dict[str, int] = {}
    total_by_module: dict[str, int] = {}
    for log in logs:
        module = log.module.value
        total_by_module[module] = total_by_module.get(module, 0) + 1
        if log.completed_at:
            completed_by_module[module] = completed_by_module.get(module, 0) + 1

    signals = get_signals(db, profile, today)

    today_run = None
    running_plan = plans_by_module.get("running")
    if running_plan:
        for day in running_plan.get("days", []):
            if day.get("date") == today.isoformat() and day.get("type") != "rest":
                today_run = day
                break

    # Race countdown from running module config
    race_countdown = None
    running_goal = None
    running_config = db.query(ModuleConfig).filter(
        ModuleConfig.profile_id == profile.id,
        ModuleConfig.module == "running",
    ).first()
    if running_config:
        target_distance = running_config.config_json.get("target_distance")
        running_goal = target_distance
        race_date_str = running_config.config_json.get("race_date")
        if race_date_str:
            try:
                race_date = date.fromisoformat(race_date_str)
                days = (race_date - today).days
                race_countdown = {"days": days, "distance": target_distance, "date": race_date_str}
            except ValueError:
                pass

    return {
        "today": today.isoformat(),
        "week_start": week_start.isoformat(),
        "profile": {"name": profile.name},
        "race_countdown": race_countdown,
        "running_goal": running_goal,
        "today_run": today_run,
        "module_progress": {
            module: {
                "completed": completed_by_module.get(module, 0),
                "total": total_by_module.get(module, 0),
            }
            for module in ["running", "biking", "swimming", "gym"]
        },
        "signals": signals,
        "plans_available": list(plans_by_module.keys()),
    }
