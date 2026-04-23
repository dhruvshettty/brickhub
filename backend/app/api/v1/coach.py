from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.coach import CoachMessage
from app.models.plan import WeeklyPlan
from app.services.claude_service import get_claude_service, ClaudeUnavailableError
from app.services.coach_service import chat
from app.api.v1.settings import _get_or_create_profile

router = APIRouter(prefix="/coach", tags=["coach"])


class MessageRequest(BaseModel):
    content: str


class MessageResponse(BaseModel):
    role: str
    content: str
    id: int

    class Config:
        from_attributes = True


@router.post("/message")
def send_message(req: MessageRequest, db: Session = Depends(get_db)):
    if not req.content.strip():
        raise HTTPException(400, "Message cannot be empty")

    profile = _get_or_create_profile(db)
    try:
        claude = get_claude_service()
        response, plan_change = chat(db, claude, profile, req.content)

        # Enrich each change entry with the original session from the current plan
        if plan_change and plan_change.get("changes"):
            today = date.today()
            week_start = today - timedelta(days=today.weekday())
            current_plan = db.query(WeeklyPlan).filter(
                WeeklyPlan.module == "running",
                WeeklyPlan.week_start == week_start,
            ).first()
            if current_plan:
                plan_days = {d["date"]: d for d in current_plan.plan_json.get("days", [])}
                for change in plan_change["changes"]:
                    change["original_session"] = plan_days.get(change["date"])

        return {"response": response, "ai_unavailable": False, "plan_change": plan_change}
    except ClaudeUnavailableError:
        return {
            "response": "AI coach is temporarily unavailable. Check your ANTHROPIC_API_KEY in .env.",
            "ai_unavailable": True,
            "plan_change": None,
        }
    except EnvironmentError as e:
        return {"response": str(e), "ai_unavailable": True, "plan_change": None}


@router.get("/history")
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    messages = (
        db.query(CoachMessage)
        .order_by(CoachMessage.created_at.asc())
        .limit(limit)
        .all()
    )
    return [{"id": m.id, "role": m.role.value, "content": m.content} for m in messages]
