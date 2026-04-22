from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
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

    # Current week plans
    plans = db.query(WeeklyPlan).filter(
        WeeklyPlan.week_start == week_start,
    ).all()
    plans_by_module = {p.module: p.plan_json for p in plans}

    # Workout logs this week
    logs = db.query(WorkoutLog).filter(
        WorkoutLog.planned_at >= week_start,
    ).all()

    completed_by_module: dict[str, int] = {}
    total_by_module: dict[str, int] = {}
    for log in logs:
        module = log.module.value
        total_by_module[module] = total_by_module.get(module, 0) + 1
        if log.completed_at:
            completed_by_module[module] = completed_by_module.get(module, 0) + 1

    # Cross-module signals
    signals = get_signals(db, profile, today)

    # Today's running session
    today_run = None
    running_plan = plans_by_module.get("running")
    if running_plan:
        for day in running_plan.get("days", []):
            if day.get("date") == today.isoformat() and day.get("type") != "rest":
                today_run = day
                break

    # Race countdown
    race_countdown = None
    if profile.race_date:
        days = (profile.race_date - today).days
        race_countdown = {"days": days, "distance": profile.race_distance, "date": str(profile.race_date)}

    return {
        "today": today.isoformat(),
        "week_start": week_start.isoformat(),
        "profile": {
            "name": profile.name,
            "race_distance": profile.race_distance,
            "race_date": str(profile.race_date) if profile.race_date else None,
        },
        "race_countdown": race_countdown,
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
