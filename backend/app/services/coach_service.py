"""AI coach service.

Injects the current week's running plan into every message so the coach
can reason about specific sessions by date. Returns a parsed plan_change
block when Claude proposes a plan modification.
"""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models.module_config import ModuleConfig
from app.models.profile import Profile
from app.models.plan import WeeklyPlan
from app.models.coach import CoachMessage, MessageRole
from app.services.claude_service import ClaudeService, ClaudeUnavailableError
from app.services.cross_module import get_signals, signals_to_context_string

_PLAN_CHANGE_RE = re.compile(r"<plan_change>(.*?)</plan_change>", re.DOTALL)


def _parse_plan_change(text: str) -> tuple[str, dict | None]:
    """Strip <plan_change>…</plan_change> from response, return (clean_text, change_or_None)."""
    match = _PLAN_CHANGE_RE.search(text)
    if not match:
        return text, None
    clean = _PLAN_CHANGE_RE.sub("", text).strip()
    try:
        change = json.loads(match.group(1).strip())
        return clean, change
    except json.JSONDecodeError:
        return clean, None


def _format_plan_for_coach(plan_json: dict, day_logs: dict[str, str], today: date) -> str:
    days = plan_json.get("days", [])
    lines = [f"Week summary: {plan_json.get('summary', '')}"]
    lines.append("")
    for d in days:
        d_date = d.get("date", "")
        status = day_logs.get(d_date, "")
        if d.get("type") == "rest":
            status_str = "rest"
        elif status == "done":
            status_str = "DONE"
        elif status == "missed":
            status_str = "MISSED"
        elif d_date < today.isoformat():
            status_str = "not logged"
        else:
            status_str = "upcoming"
        dist = f"  {d.get('distance_km')}km" if d.get("distance_km") else ""
        lines.append(f"  {d_date} ({d.get('type','?')}){dist} [{status_str}]")
    return "\n".join(lines)


def _build_coach_system(profile: Profile, db: Session, today: date) -> str:
    signals = get_signals(db, profile, today)
    signals_str = signals_to_context_string(signals)

    week_start = today - timedelta(days=today.weekday())
    running_plan = db.query(WeeklyPlan).filter(
        WeeklyPlan.module == "running",
        WeeklyPlan.week_start == week_start,
    ).first()

    from app.api.v1.running import _day_logs_for_week
    day_logs = _day_logs_for_week(db, week_start) if running_plan else {}

    plan_section = "No running plan generated yet for this week."
    if running_plan and running_plan.plan_json:
        plan_section = _format_plan_for_coach(running_plan.plan_json, day_logs, today)

    race_info = ""
    running_config = db.query(ModuleConfig).filter(
        ModuleConfig.profile_id == profile.id,
        ModuleConfig.module == "running",
    ).first()
    if running_config:
        cfg = running_config.config_json
        race_date_str = cfg.get("race_date")
        target_distance = cfg.get("target_distance")
        if race_date_str and target_distance:
            try:
                race_date = date.fromisoformat(race_date_str)
                days_to_race = (race_date - today).days
                race_info = f"Race: {target_distance} on {race_date} ({days_to_race} days away).\n"
            except ValueError:
                pass

    return f"""You are brickhub, a personal AI running coach. You know this athlete's current week in detail.

Athlete: {profile.name or 'Athlete'}, {profile.age or '?'} years old
{race_info}Weekly training hours available: {profile.weekly_training_hours}

Current training signals:
{signals_str}

This week's running plan (week of {week_start}):
{plan_section}

--- HOW TO HANDLE PLAN CHANGE REQUESTS ---

The athlete must explicitly give you a reason to change their plan. Do not offer to change it unprompted.

When they do give a reason, think carefully: is this genuinely worth changing the plan, or should you encourage them to push through? Minor fatigue, low motivation, and busy days are usually not reasons to change a plan — a good coach pushes back. Illness, injury, significant life events, or accumulated overload are valid reasons.

If a change IS warranted, propose ONLY the minimum adjustment needed. Only affect sessions from today onward (never past days). Add a <plan_change> block at the END of your response in this exact format:

<plan_change>
{{
  "reason": "One sentence: why this change is appropriate",
  "changes": [
    {{
      "date": "YYYY-MM-DD",
      "new_session": {{
        "date": "YYYY-MM-DD",
        "type": "easy|tempo|interval|long|race_pace|recovery|rest",
        "distance_km": 0,
        "duration_minutes": 0,
        "pace_zone": null,
        "description": "What to do"
      }}
    }}
  ]
}}
</plan_change>

If you push back, do NOT include a <plan_change> block. Keep responses under 150 words unless detail is needed. Be direct."""


def chat(
    db: Session,
    claude: ClaudeService,
    profile: Profile,
    user_message: str,
    today: date | None = None,
) -> tuple[str, dict[str, Any] | None]:
    """Returns (response_text, plan_change_or_None)."""
    if today is None:
        today = date.today()

    system = _build_coach_system(profile, db, today)

    history = (
        db.query(CoachMessage)
        .order_by(CoachMessage.created_at.desc())
        .limit(10)
        .all()
    )
    history.reverse()

    messages = [
        {"role": msg.role.value, "content": msg.content}
        for msg in history
    ]
    messages.append({"role": "user", "content": user_message})

    context_snapshot = {"signals": get_signals(db, profile, today)}

    db.add(CoachMessage(role=MessageRole.user, content=user_message, context_snapshot=context_snapshot))
    db.flush()

    raw = claude.chat(messages, system)
    response_text, plan_change = _parse_plan_change(raw)

    db.add(CoachMessage(role=MessageRole.assistant, content=response_text, context_snapshot=None))
    db.commit()

    return response_text, plan_change
