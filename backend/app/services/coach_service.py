"""AI coach service.

Injects full cross-module context into every coach chat message
so the coach knows about the athlete's entire training picture.
"""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.profile import Profile
from app.models.plan import WeeklyPlan
from app.models.coach import CoachMessage, MessageRole
from app.services.claude_service import ClaudeService, ClaudeUnavailableError
from app.services.cross_module import get_signals, signals_to_context_string


def _build_coach_system(profile: Profile, db: Session, today: date) -> str:
    signals = get_signals(db, profile, today)
    signals_str = signals_to_context_string(signals)

    # Current running plan
    week_start = today - timedelta(days=today.weekday())
    running_plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.module == "running",
        WeeklyPlan.week_start == week_start,
    ).first()

    plan_summary = "No running plan generated yet."
    if running_plan and running_plan.plan_json:
        pj = running_plan.plan_json
        plan_summary = pj.get("summary", "Running plan exists.")
        days = pj.get("days", [])
        upcoming = [d for d in days if d.get("date", "") >= today.isoformat() and d.get("type") != "rest"]
        if upcoming:
            next_run = upcoming[0]
            plan_summary += f" Next session: {next_run.get('type')} run, {next_run.get('distance_km')}km on {next_run.get('date')}."

    race_info = ""
    if profile.race_date and profile.race_distance:
        days_to_race = (profile.race_date - today).days
        race_info = f"Race: {profile.race_distance} on {profile.race_date} ({days_to_race} days away)."

    return f"""You are brickhub, a personal AI triathlon coach. You know everything about this athlete's training.

Athlete: {profile.name or 'Athlete'}, {profile.age or '?'} years old
{race_info}
Weekly training hours available: {profile.weekly_training_hours}

Current cross-module training status:
{signals_str}

Running plan this week: {plan_summary}

Be direct and practical. Give specific recommendations. When the athlete asks about adjusting their plan,
tell them exactly what to change and why. Keep responses under 150 words unless detail is needed.
If you suggest adjusting a plan, encourage them to click "Recalibrate" in the app."""


def chat(
    db: Session,
    claude: ClaudeService,
    profile: Profile,
    user_message: str,
    today: date | None = None,
) -> str:
    if today is None:
        today = date.today()

    system = _build_coach_system(profile, db, today)

    # Load conversation history (last 20 messages for context)
    history = (
        db.query(CoachMessage)
        .order_by(CoachMessage.created_at.desc())
        .limit(20)
        .all()
    )
    history.reverse()

    messages = [
        {"role": msg.role.value, "content": msg.content}
        for msg in history
    ]
    messages.append({"role": "user", "content": user_message})

    context_snapshot = {
        "signals": get_signals(db, profile, today),
        "race_info": {
            "distance": profile.race_distance,
            "date": str(profile.race_date) if profile.race_date else None,
        },
    }

    # Save user message
    db.add(CoachMessage(role=MessageRole.user, content=user_message, context_snapshot=context_snapshot))
    db.flush()

    response = claude.chat(messages, system)

    # Save assistant response
    db.add(CoachMessage(role=MessageRole.assistant, content=response, context_snapshot=None))
    db.commit()

    return response
