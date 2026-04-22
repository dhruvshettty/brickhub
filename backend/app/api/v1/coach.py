from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.coach import CoachMessage
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
        response = chat(db, claude, profile, req.content)
        return {"response": response, "ai_unavailable": False}
    except ClaudeUnavailableError:
        return {
            "response": "AI coach is temporarily unavailable. Check your ANTHROPIC_API_KEY in .env.",
            "ai_unavailable": True,
        }
    except EnvironmentError as e:
        return {"response": str(e), "ai_unavailable": True}


@router.get("/history")
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    messages = (
        db.query(CoachMessage)
        .order_by(CoachMessage.created_at.asc())
        .limit(limit)
        .all()
    )
    return [{"id": m.id, "role": m.role.value, "content": m.content} for m in messages]
