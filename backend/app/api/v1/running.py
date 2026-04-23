from __future__ import annotations

from datetime import datetime, timedelta
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.module_config import ModuleConfig
from app.models.plan import WeeklyPlan
from app.models.profile import Profile
from app.models.workout import ModuleType, WorkoutLog, WorkoutSource
from app.services.claude_service import ClaudeUnavailableError, get_claude_service
from app.services.plan_generator import generate_running_plan, save_plan
from app.services.running_ability import classify, suggest_weekly_runs
from app.services.workout_adjuster import recalibrate_running
from app.api.v1.settings import _get_or_create_profile

router = APIRouter(prefix="/running", tags=["running"])


# ── Pydantic models ──────────────────────────────────────────────────────────

class WorkoutLogRequest(BaseModel):
    planned_at: date
    completed_at: date | None = None
    duration_minutes: float | None = None
    distance_km: float | None = None
    avg_hr: int | None = None
    notes: str | None = None


class ClassifyRequest(BaseModel):
    distance: str
    time_seconds: int
    effort_score: int


class RunningConfigRequest(BaseModel):
    target_distance: str
    has_previous_race: bool
    best_time_seconds: int | None = None
    effort_score: int | None = None
    ability_level: str
    aerobic_base_priority: bool
    recent_runs_4_weeks: int
    current_weekly_km: int | None = None
    suggested_runs_per_week: int
    preferred_days: list[str]
    long_run_day: str
    plan_start_date: str
    race_date: str | None = None
    plan_weeks: int | None = None
    race_terrain: str | None = None
    training_terrain: str | None = None
    volume_preference: str | None = None
    effort_preference: str | None = None
    is_primary_sport: bool = False
    preferences_user_set: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_running_config(db: Session, profile_id: int) -> ModuleConfig | None:
    return db.query(ModuleConfig).filter(
        ModuleConfig.profile_id == profile_id,
        ModuleConfig.module == "running",
    ).first()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/config")
def get_running_config(db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    config = _get_running_config(db, profile.id)
    if config is None:
        return {"config": None, "onboarded": False}
    return {"config": config.config_json, "onboarded": bool(config.config_json.get("onboarded_at"))}


@router.put("/config")
def save_running_config(req: RunningConfigRequest, db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)

    config_data: dict[str, Any] = req.model_dump()
    config_data["onboarded_at"] = datetime.utcnow().isoformat() + "Z"

    config = _get_running_config(db, profile.id)
    if config is None:
        config = ModuleConfig(profile_id=profile.id, module="running", config_json=config_data)
        db.add(config)
    else:
        config.config_json = config_data
        config.updated_at = datetime.utcnow()

    # Invalidate the current week's cached plan so it regenerates with the new config
    today = date.today()
    current_week_start = today - timedelta(days=today.weekday())
    db.query(WeeklyPlan).filter(
        WeeklyPlan.module == "running",
        WeeklyPlan.week_start == current_week_start,
    ).delete()

    db.commit()
    db.refresh(config)
    return {"config": config.config_json, "saved": True}


@router.post("/classify")
def classify_ability(req: ClassifyRequest):
    result = classify(req.distance, req.time_seconds, req.effort_score)
    return result


def _day_logs_for_week(db: Session, week_start: date) -> dict[str, str]:
    """Return {date_str: 'done'|'missed'} for all logged running sessions in the week."""
    week_end = week_start + timedelta(days=6)
    logs = db.query(WorkoutLog).filter(
        WorkoutLog.module == ModuleType.running,
        WorkoutLog.planned_at >= datetime.combine(week_start, datetime.min.time()),
        WorkoutLog.planned_at <= datetime.combine(week_end, datetime.max.time()),
    ).all()
    return {
        log.planned_at.date().isoformat(): ("done" if log.completed_at else "missed")
        for log in logs
    }


@router.get("/plan")
def get_running_plan(week_start: date | None = None, db: Session = Depends(get_db)):
    if week_start is None:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())

    day_logs = _day_logs_for_week(db, week_start)

    plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.module == "running",
        WeeklyPlan.week_start == week_start,
    ).first()

    if plan:
        return {"plan": plan.plan_json, "ai_unavailable": False, "day_logs": day_logs}

    profile = _get_or_create_profile(db)
    try:
        claude = get_claude_service()
        plan_json = generate_running_plan(db, claude, profile, week_start)
        save_plan(db, "running", week_start, plan_json)
        return {"plan": plan_json, "ai_unavailable": False, "day_logs": day_logs}
    except ClaudeUnavailableError:
        return {
            "plan": None,
            "ai_unavailable": True,
            "message": "AI coach unavailable. Set your ANTHROPIC_API_KEY in .env and restart.",
            "day_logs": {},
        }
    except EnvironmentError as e:
        return {"plan": None, "ai_unavailable": True, "message": str(e), "day_logs": {}}


@router.post("/log")
def log_workout(req: WorkoutLogRequest, db: Session = Depends(get_db)):
    planned_dt = datetime.combine(req.planned_at, datetime.min.time())
    completed_dt = datetime.combine(req.completed_at, datetime.min.time()) if req.completed_at else None

    existing = db.query(WorkoutLog).filter(
        WorkoutLog.module == ModuleType.running,
        WorkoutLog.planned_at == planned_dt,
    ).first()

    if existing:
        existing.completed_at = completed_dt
        existing.duration_minutes = req.duration_minutes
        existing.distance_km = req.distance_km
        existing.avg_hr = req.avg_hr
        existing.notes = req.notes
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "logged": True}

    log = WorkoutLog(
        module=ModuleType.running,
        planned_at=planned_dt,
        completed_at=completed_dt,
        duration_minutes=req.duration_minutes,
        distance_km=req.distance_km,
        avg_hr=req.avg_hr,
        notes=req.notes,
        source=WorkoutSource.manual,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"id": log.id, "logged": True}


@router.delete("/log/{log_date}")
def clear_workout_log(log_date: date, db: Session = Depends(get_db)):
    planned_dt = datetime.combine(log_date, datetime.min.time())
    deleted = db.query(WorkoutLog).filter(
        WorkoutLog.module == ModuleType.running,
        WorkoutLog.planned_at == planned_dt,
    ).delete()
    db.commit()
    return {"deleted": deleted > 0}


@router.post("/recalibrate")
def recalibrate(week_start: date | None = None, db: Session = Depends(get_db)):
    if week_start is None:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())

    profile = _get_or_create_profile(db)
    try:
        claude = get_claude_service()
        plan = recalibrate_running(db, claude, profile, week_start)
        return {"plan": plan.plan_json, "recalibrated": True}
    except ClaudeUnavailableError:
        raise HTTPException(503, "AI coach unavailable. Check your ANTHROPIC_API_KEY.")
    except EnvironmentError as e:
        raise HTTPException(503, str(e))
