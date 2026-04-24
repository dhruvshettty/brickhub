from __future__ import annotations

import threading
from datetime import datetime, timedelta, date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.food import MealLog
from app.models.module_config import ModuleConfig
from app.models.plan import WeeklyPlan
from app.models.profile import Profile
from app.services.claude_service import ClaudeUnavailableError, get_claude_service
from app.services.food_plan_generator import generate_food_plan, get_or_generate_food_plan
from app.api.v1.settings import _get_or_create_profile

router = APIRouter(prefix="/food", tags=["food"])

_plan_generation_lock = threading.Lock()


# ── Pydantic models ──────────────────────────────────────────────────────────

class FoodConfigRequest(BaseModel):
    dietary_preference: str  # omnivore / vegetarian / vegan / other
    intolerances: str | None = None
    prep_frequency: str  # daily / every_2_days / every_3_days
    weight_kg: float | None = None
    calorie_baseline_kcal: int = 2200
    cuisine_preference: str | None = None  # mediterranean / asian / western / mix
    regenerate: bool = True


class MealLogRequest(BaseModel):
    date: date
    meal_slot: str  # breakfast / pre_workout / post_workout / lunch / dinner / snack
    meal_name: str | None = None
    calories: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    notes: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_food_config(db: Session, profile_id: int) -> ModuleConfig | None:
    return db.query(ModuleConfig).filter(
        ModuleConfig.profile_id == profile_id,
        ModuleConfig.module == "food",
    ).first()


def _get_running_config(db: Session, profile_id: int) -> dict:
    row = db.query(ModuleConfig).filter(
        ModuleConfig.profile_id == profile_id,
        ModuleConfig.module == "running",
    ).first()
    return row.config_json if row else {}


def _get_running_plan_for_week(db: Session, week_start: date) -> dict | None:
    plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.module == "running",
        WeeklyPlan.week_start == week_start,
    ).first()
    return plan.plan_json if plan else None


def _meal_logs_for_week(db: Session, week_start: date) -> list[dict]:
    week_end = week_start + timedelta(days=6)
    logs = db.query(MealLog).filter(
        MealLog.date >= week_start,
        MealLog.date <= week_end,
    ).all()
    return [
        {
            "id": log.id,
            "date": log.date.isoformat(),
            "meal_slot": log.meal_slot,
            "meal_name": log.meal_name,
            "calories": log.calories,
            "protein_g": log.protein_g,
            "carbs_g": log.carbs_g,
            "fat_g": log.fat_g,
            "notes": log.notes,
        }
        for log in logs
    ]


def _config_snapshot(food_config: dict) -> dict:
    keys = ["dietary_preference", "intolerances", "prep_frequency", "calorie_baseline_kcal", "weight_kg", "cuisine_preference"]
    return {k: food_config.get(k) for k in keys}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/config")
def get_food_config(db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)
    running_config = _get_running_config(db, profile.id)
    running_onboarded = bool(running_config.get("onboarded_at"))

    config = _get_food_config(db, profile.id)
    if config is None:
        return {"config": None, "onboarded": False, "running_onboarded": running_onboarded}
    return {
        "config": config.config_json,
        "onboarded": bool(config.config_json.get("onboarded_at")),
        "running_onboarded": running_onboarded,
    }


@router.put("/config")
def save_food_config(req: FoodConfigRequest, db: Session = Depends(get_db)):
    profile = _get_or_create_profile(db)

    # Gate: running must be configured first
    running_config = _get_running_config(db, profile.id)
    if not running_config.get("onboarded_at"):
        raise HTTPException(400, "Running module must be configured before Food.")

    config_data: dict[str, Any] = req.model_dump(exclude={"regenerate"})

    # Calorie baseline estimation: weight_kg × 35 if weight provided and baseline not overridden
    if req.weight_kg and req.calorie_baseline_kcal == 2200:
        config_data["calorie_baseline_kcal"] = round(req.weight_kg * 35)

    config_data["onboarded_at"] = datetime.utcnow().isoformat() + "Z"

    config = _get_food_config(db, profile.id)
    if config is None:
        config = ModuleConfig(profile_id=profile.id, module="food", config_json=config_data)
        db.add(config)
    else:
        config.config_json = config_data
        config.updated_at = datetime.utcnow()

    if req.regenerate:
        today = date.today()
        current_week_start = today - timedelta(days=today.weekday())
        db.query(WeeklyPlan).filter(
            WeeklyPlan.module == "food",
            WeeklyPlan.week_start == current_week_start,
        ).delete()

    db.commit()
    db.refresh(config)
    return {"config": config.config_json, "saved": True}


@router.get("/plan")
def get_food_plan(week_start: date | None = None, db: Session = Depends(get_db)):
    if week_start is None:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())

    meal_logs = _meal_logs_for_week(db, week_start)

    plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.module == "food",
        WeeklyPlan.week_start == week_start,
    ).first()

    if plan:
        return {"plan": plan.plan_json, "ai_unavailable": False, "meal_logs": meal_logs}

    today = date.today()
    current_week_start = today - timedelta(days=today.weekday())
    if week_start < current_week_start:
        return {"plan": None, "ai_unavailable": False, "meal_logs": meal_logs}

    profile = _get_or_create_profile(db)
    food_config_row = _get_food_config(db, profile.id)
    if not food_config_row or not food_config_row.config_json.get("onboarded_at"):
        return {"plan": None, "ai_unavailable": False, "message": "Food module not configured.", "meal_logs": []}

    food_config = dict(food_config_row.config_json)

    # Inject race_date from running config for race week detection
    running_config = _get_running_config(db, profile.id)
    if running_config.get("race_date"):
        food_config["_race_date"] = running_config["race_date"]

    running_plan = _get_running_plan_for_week(db, week_start)

    try:
        claude = get_claude_service()
        with _plan_generation_lock:
            # Re-check inside lock — concurrent request may have generated while we waited
            plan = db.query(WeeklyPlan).filter(
                WeeklyPlan.module == "food",
                WeeklyPlan.week_start == week_start,
            ).first()
            if plan:
                return {"plan": plan.plan_json, "ai_unavailable": False, "meal_logs": meal_logs}

            plan_json = generate_food_plan(db, claude, week_start, food_config, running_plan)
            new_plan = WeeklyPlan(
                module="food",
                week_start=week_start,
                plan_json=plan_json,
                config_snapshot=_config_snapshot(food_config),
            )
            db.add(new_plan)
            db.commit()
            db.refresh(new_plan)
        return {"plan": plan_json, "ai_unavailable": False, "meal_logs": meal_logs}
    except ClaudeUnavailableError:
        return {
            "plan": None,
            "ai_unavailable": True,
            "message": "AI coach unavailable. Set your ANTHROPIC_API_KEY in .env and restart.",
            "meal_logs": [],
        }
    except EnvironmentError as e:
        return {"plan": None, "ai_unavailable": True, "message": str(e), "meal_logs": []}


@router.post("/log")
def log_meal(req: MealLogRequest, db: Session = Depends(get_db)):
    log = MealLog(
        date=req.date,
        module="food",
        meal_slot=req.meal_slot,
        meal_name=req.meal_name,
        calories=req.calories,
        protein_g=req.protein_g,
        carbs_g=req.carbs_g,
        fat_g=req.fat_g,
        notes=req.notes,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"id": log.id, "logged": True}


@router.delete("/log/{log_id}")
def delete_meal_log(log_id: int, db: Session = Depends(get_db)):
    log = db.query(MealLog).filter(MealLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "Log entry not found.")
    db.delete(log)
    db.commit()
    return {"deleted": True}
