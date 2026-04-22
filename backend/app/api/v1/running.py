from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.plan import WeeklyPlan
from app.models.workout import WorkoutLog, ModuleType, WorkoutSource
from app.models.profile import Profile
from app.services.claude_service import get_claude_service, ClaudeUnavailableError
from app.services.plan_generator import generate_running_plan, save_plan
from app.services.workout_adjuster import recalibrate_running
from app.api.v1.settings import _get_or_create_profile

router = APIRouter(prefix="/running", tags=["running"])


class WorkoutLogRequest(BaseModel):
    planned_at: date
    completed_at: date | None = None  # null = missed
    duration_minutes: float | None = None
    distance_km: float | None = None
    avg_hr: int | None = None
    notes: str | None = None


@router.get("/plan")
def get_running_plan(week_start: date | None = None, db: Session = Depends(get_db)):
    if week_start is None:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())

    plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.module == "running",
        WeeklyPlan.week_start == week_start,
    ).first()

    if plan:
        return {"plan": plan.plan_json, "ai_unavailable": False}

    # No plan yet — generate one
    profile = _get_or_create_profile(db)
    try:
        claude = get_claude_service()
        plan_json = generate_running_plan(db, claude, profile, week_start)
        save_plan(db, "running", week_start, plan_json)
        return {"plan": plan_json, "ai_unavailable": False}
    except ClaudeUnavailableError:
        return {
            "plan": None,
            "ai_unavailable": True,
            "message": "AI coach unavailable. Set your ANTHROPIC_API_KEY in .env and restart.",
        }
    except EnvironmentError as e:
        return {"plan": None, "ai_unavailable": True, "message": str(e)}


@router.post("/log")
def log_workout(req: WorkoutLogRequest, db: Session = Depends(get_db)):
    from datetime import datetime
    log = WorkoutLog(
        module=ModuleType.running,
        planned_at=datetime.combine(req.planned_at, datetime.min.time()),
        completed_at=datetime.combine(req.completed_at, datetime.min.time()) if req.completed_at else None,
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
