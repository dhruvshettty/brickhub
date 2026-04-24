"""Food plan generation via Claude Sonnet.

Forward-looking nutrition: meal plan is generated from the training calendar.
Each day's nutrition context is computed in Python (window algorithm) before
calling Claude — Claude receives the pre-computed context and generates meals.
"""

import json
import re
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.plan import WeeklyPlan
from app.services.claude_service import ClaudeService, ClaudeUnavailableError
from app.services.plan_generator import save_plan


_NUTRITION_PROFILES = """\
## Nutrition Context Profiles

**carb_loading_day** — tomorrow is a long run (≥15 km) or intervals:
- Calories: baseline × 1.15–1.20
- Carbs: 7–10 g/kg body weight, 60–70% of total calories
- Protein: moderate (1.4–1.6 g/kg)
- Fat: reduced; favour easy-to-digest, low-fibre carbs
- Examples: pasta, white rice, oats, banana, bread. Avoid high-fibre veg or high-fat meals.

**pre_workout_moderate_carb** — tomorrow is a tempo run:
- Calories: baseline × 1.05–1.10
- Carbs: 5–7 g/kg (55–65% of calories)
- Protein: moderate; Fat: moderate
- Emphasis: quality carbs + lean protein.

**recovery_day** — yesterday was a long run (≥15 km):
- Calories: at or slightly above baseline
- Protein: HIGH (1.8–2.2 g/kg) — muscle repair priority
- Carbs: moderate (replenish glycogen, not aggressive)
- Fat: moderate; include anti-inflammatory sources (salmon, avocado, nuts)

**maintenance** — easy run, rest, or no significant adjacent session:
- Calories: at baseline; macros: balanced (50% carbs, 25% protein, 25% fat)

**race_morning** — race day:
- Calories: 600–900 kcal, 2–3 h before start
- Carbs: easily digestible, familiar foods ONLY
- Fat and fibre: very low (no GI risk)
- Examples: white toast, banana, rice, sports drink. No new foods.

**post_race_recovery** — day after race:
- Calories: baseline × 1.20–1.25
- Protein: VERY HIGH (2.0–2.4 g/kg); Carbs: high
- Anti-inflammatory: berries, leafy greens, omega-3s
"""

_JSON_SCHEMA = """\
## Output Format

Return ONLY a valid JSON object. No markdown fences, no explanation.

{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "session_type": "easy|tempo|interval|long|race_pace|recovery|rest",
      "session_distance_km": 0,
      "nutrition_context": "carb_loading_day|pre_workout_moderate_carb|recovery_day|maintenance|race_morning|post_race_recovery",
      "prep_batch": 1,
      "targets": {
        "calories": 2500,
        "carbs_g": 320,
        "protein_g": 150,
        "fat_g": 70
      },
      "meals": {
        "breakfast": {
          "name": "string",
          "calories": 0,
          "macros": { "carbs_g": 0, "protein_g": 0, "fat_g": 0 },
          "ingredients": [
            { "name": "string", "quantity": "string", "unit": "string", "category": "produce|proteins|grains|dairy|pantry|other" }
          ],
          "instructions": ["Step 1", "Step 2"]
        },
        "pre_workout": { "name": "...", "timing": "60-90 min before", "calories": 0, "macros": {...}, "ingredients": [...], "instructions": ["Step 1"] },
        "post_workout": { "name": "...", "timing": "within 30 min after", "calories": 0, "macros": {...}, "ingredients": [...], "instructions": ["Step 1"] },
        "lunch": { "name": "...", "calories": 0, "macros": {...}, "ingredients": [...], "instructions": ["Step 1", "Step 2"] },
        "dinner": { "name": "...", "calories": 0, "macros": {...}, "ingredients": [...], "instructions": ["Step 1", "Step 2"] },
        "snacks": []
      },
      "note": "≤10 words: why this day's nutrition context"
    }
  ]
}

Rules:
- Include all 7 days in the exact order provided.
- On rest days (no session), OMIT the pre_workout and post_workout keys entirely.
- On training days, include pre_workout and post_workout.
- All days sharing the same prep_batch MUST have the IDENTICAL dinner name and recipe.
- Be terse everywhere: short meal names, short ingredient names, no filler prose.
- Include 3–5 ingredients per meal with quantities and units.
- Include 2–3 short imperative instructions per meal (e.g. "Cook oats in 300ml water 5 min"). No-cook items need only 1 step.
- snacks is an array of meal objects (0–2 items; more on high-load days).
- Macro math: carbs_g×4 + protein_g×4 + fat_g×9 ≈ calories (within 10%).
- Honour dietary_preference and intolerances strictly — no exceptions.
"""


def _assign_nutrition_contexts(days: list[dict], race_date: date | None) -> list[dict]:
    """Apply forward-looking window algorithm to assign nutrition_context per day.

    Priority order:
    1. Race check (race within 7 days)
    2. Tomorrow's session type/distance
    3. Yesterday's session type/distance
    4. Default: maintenance
    """
    date_to_session: dict[str, dict] = {d["date"]: d for d in days}
    result = []

    for day in days:
        d = date.fromisoformat(day["date"])
        tomorrow_key = (d + timedelta(days=1)).isoformat()
        yesterday_key = (d - timedelta(days=1)).isoformat()

        context = "maintenance"

        # Priority 1: race check
        if race_date:
            delta = (race_date - d).days
            if delta in (2, 3):
                context = "carb_loading_day"
            elif delta == 0:
                context = "race_morning"
            elif delta == -1:
                context = "post_race_recovery"

        # Priority 2: tomorrow's session (only within this week)
        if context == "maintenance":
            tomorrow = date_to_session.get(tomorrow_key)
            if tomorrow:
                t_type = tomorrow.get("type", "rest")
                t_dist = float(tomorrow.get("distance_km", 0) or 0)
                if t_type == "long" and t_dist >= 15:
                    context = "carb_loading_day"
                elif t_type == "interval":
                    context = "carb_loading_day"
                elif t_type == "tempo":
                    context = "pre_workout_moderate_carb"

        # Priority 3: yesterday's session (only within this week)
        if context == "maintenance":
            yesterday = date_to_session.get(yesterday_key)
            if yesterday:
                y_type = yesterday.get("type", "rest")
                y_dist = float(yesterday.get("distance_km", 0) or 0)
                if y_type == "long" and y_dist >= 15:
                    context = "recovery_day"

        result.append({**day, "nutrition_context": context})

    return result


def _assign_prep_batches(days: list[dict], prep_frequency: str) -> list[dict]:
    """Assign prep_batch integer to each day based on prep frequency."""
    result = []
    for i, day in enumerate(days):
        if prep_frequency == "daily":
            batch = i + 1
        elif prep_frequency == "every_2_days":
            batch = (i // 2) + 1
        else:  # every_3_days (default)
            # Mon-Wed = batch 1, Thu-Sun = batch 2
            batch = 1 if i < 3 else 2
        result.append({**day, "prep_batch": batch})
    return result


def _race_date_from_config(running_config: dict) -> date | None:
    race_date_str = running_config.get("race_date")
    if not race_date_str:
        return None
    try:
        return date.fromisoformat(race_date_str)
    except ValueError:
        return None


def _stub_past_day(day: dict, calorie_baseline: int) -> dict:
    """Return a minimal day entry for a past day (no meals, targets only)."""
    context = day.get("nutrition_context", "maintenance")
    multipliers = {
        "carb_loading_day": 1.175,
        "pre_workout_moderate_carb": 1.075,
        "recovery_day": 1.05,
        "race_morning": 0.45,
        "post_race_recovery": 1.225,
        "maintenance": 1.0,
    }
    cal = round(calorie_baseline * multipliers.get(context, 1.0))
    return {
        "date": day["date"],
        "session_type": day.get("type", "rest"),
        "session_distance_km": day.get("distance_km", 0),
        "nutrition_context": context,
        "prep_batch": day.get("prep_batch", 1),
        "targets": {
            "calories": cal,
            "carbs_g": round(cal * 0.50 / 4),
            "protein_g": round(cal * 0.25 / 4),
            "fat_g": round(cal * 0.25 / 9),
        },
        "meals": {},
        "note": "Past day — no meal plan generated.",
    }


def generate_food_plan(
    db: Session,
    claude: ClaudeService,
    week_start: date,
    food_config: dict,
    running_plan: dict | None,
) -> dict:
    """Generate a food plan for today and future days in the week. Past days get stubs."""
    today = date.today()

    # Build the 7 days skeleton from running plan or empty fallback
    days_base: list[dict] = []
    if running_plan and running_plan.get("days"):
        for d in running_plan["days"]:
            days_base.append({
                "date": d["date"],
                "type": d.get("type", "rest"),
                "distance_km": d.get("distance_km", 0),
            })
    else:
        for i in range(7):
            days_base.append({
                "date": (week_start + timedelta(days=i)).isoformat(),
                "type": "rest",
                "distance_km": 0,
            })

    race_date: date | None = None
    if running_plan:
        race_date_str = food_config.get("_race_date")
        if race_date_str:
            try:
                race_date = date.fromisoformat(race_date_str)
            except ValueError:
                pass

    days_with_context = _assign_nutrition_contexts(days_base, race_date)
    days_with_batches = _assign_prep_batches(days_with_context, food_config.get("prep_frequency", "every_3_days"))

    calorie_baseline = food_config.get("calorie_baseline_kcal", 2200)
    prep_frequency = food_config.get("prep_frequency", "every_3_days")

    # Split: past days get stubs, today+future go to Claude
    past_days = [d for d in days_with_batches if date.fromisoformat(d["date"]) < today]
    future_days = [d for d in days_with_batches if date.fromisoformat(d["date"]) >= today]

    past_stubs = [_stub_past_day(d, calorie_baseline) for d in past_days]

    is_race_week = any(d["nutrition_context"] in ("race_morning", "post_race_recovery")
                       for d in days_with_batches)

    # If all days are in the past (shouldn't happen mid-week, but guard it)
    if not future_days:
        return {
            "week_start": week_start.isoformat(),
            "module": "food",
            "prep_frequency": prep_frequency,
            "race_week": is_race_week,
            "days": past_stubs,
        }

    # System prompt: cached blocks (persona + profiles + schema)
    system_parts = [
        {
            "text": (
                "You are an expert sports nutritionist specialising in triathlon and endurance training. "
                "You generate weekly meal plans that adapt to the athlete's training load. "
                "You understand carbohydrate periodisation, protein timing, and recovery nutrition. "
                "Always return valid JSON only — no markdown fences, no explanations outside the JSON."
            ),
            "cache": True,
        },
        {
            "text": _NUTRITION_PROFILES,
            "cache": True,
        },
        {
            "text": _JSON_SCHEMA,
            "cache": True,
        },
    ]

    dietary_pref = food_config.get("dietary_preference", "omnivore")
    intolerances = food_config.get("intolerances", "") or "none"
    weight_kg = food_config.get("weight_kg")
    cuisine_pref = food_config.get("cuisine_preference", "mix")

    prep_label = {
        "daily": "daily (every meal is unique)",
        "every_2_days": "every 2 days (same dinner for 2-day batches)",
        "every_3_days": "every 3 days (same dinner for batch 1: Mon-Wed, batch 2: Thu-Sun)",
    }.get(prep_frequency, prep_frequency)

    days_summary = [
        f"  {d['date']}: session={d['type']}, distance={d['distance_km']}km, "
        f"nutrition_context={d['nutrition_context']}, prep_batch={d['prep_batch']}"
        for d in future_days
    ]

    n_days = len(future_days)
    user_prompt = f"""Generate a {n_days}-day food plan starting {future_days[0]['date']}.

Athlete profile:
- Dietary preference: {dietary_pref}
- Food intolerances / allergies: {intolerances}
- Daily calorie baseline: {calorie_baseline} kcal
- Body weight: {f'{weight_kg} kg' if weight_kg else 'not provided'}
- Cuisine preference: {cuisine_pref}
- Meal prep frequency: {prep_label}

Training schedule and pre-computed nutrition context for each day:
{chr(10).join(days_summary)}

Instructions:
- Use the nutrition_context for each day to determine macros and meal focus (see profiles above).
- Respect meal prep batching: all days with the same prep_batch must share the SAME dinner recipe.
- Cuisine style: lean toward {cuisine_pref} flavours where appropriate, but practical meals are preferred.
- All meals must respect the dietary preference ({dietary_pref}) and intolerances ({intolerances}).
- Calorie targets should reflect the nutrition_context relative to the {calorie_baseline} kcal baseline.
- For rest days: omit pre_workout and post_workout; include breakfast, lunch, dinner, snacks only.
- For training days: include pre_workout and post_workout slots.

Return the full JSON object with all {n_days} days."""

    raw = claude.generate_with_cache(
        system_parts,
        user_prompt,
        model="claude-haiku-4-5-20251001",
        call_type="food_plan_generation",
        max_tokens=16384,
    )

    plan_data = _parse_and_validate(raw, week_start, future_days, calorie_baseline)

    return {
        "week_start": week_start.isoformat(),
        "module": "food",
        "prep_frequency": prep_frequency,
        "race_week": is_race_week,
        "days": past_stubs + plan_data["days"],
    }


def _parse_and_validate(raw: str, week_start: date, days_with_meta: list[dict], calorie_baseline: int) -> dict:
    """Parse Claude's JSON response, retry once on failure."""
    def _try_parse(text: str) -> dict:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                return json.loads(match.group())
            raise

    try:
        data = _try_parse(raw)
    except (json.JSONDecodeError, ValueError) as first_err:
        raise ValueError(
            f"Food plan JSON parse failed after retry: {first_err}. "
            f"Response start: {raw[:300]}"
        )

    if "days" not in data or not isinstance(data["days"], list):
        raise ValueError(f"Food plan missing 'days' array. Response: {raw[:300]}")

    # Fill in metadata that Claude might have omitted or gotten wrong
    expected_dates = {d["date"] for d in days_with_meta}
    returned_dates = {d.get("date") for d in data["days"] if d.get("date")}

    if not returned_dates.issuperset(expected_dates) and len(data["days"]) < len(days_with_meta):
        raise ValueError(
            f"Food plan missing days. Expected {sorted(expected_dates)}, got {sorted(returned_dates)}"
        )

    # Merge pre-computed metadata into each day (overwrite context/batch with Python-computed values)
    meta_by_date = {d["date"]: d for d in days_with_meta}
    merged_days = []
    for day in data["days"]:
        d_str = day.get("date", "")
        meta = meta_by_date.get(d_str, {})
        day["nutrition_context"] = meta.get("nutrition_context", day.get("nutrition_context", "maintenance"))
        day["prep_batch"] = meta.get("prep_batch", day.get("prep_batch", 1))
        merged_days.append(day)

    data["days"] = merged_days
    return data


def get_or_generate_food_plan(
    db: Session,
    claude: ClaudeService,
    week_start: date,
    food_config: dict,
    running_plan: dict | None,
    config_snapshot: dict,
) -> WeeklyPlan:
    """Return cached food plan or generate and cache a new one."""
    existing = db.query(WeeklyPlan).filter(
        WeeklyPlan.module == "food",
        WeeklyPlan.week_start == week_start,
    ).first()
    if existing:
        return existing

    plan_json = generate_food_plan(db, claude, week_start, food_config, running_plan)
    plan = save_plan(db, "food", week_start, plan_json)

    # Store config snapshot for invalidation tracking
    plan.config_snapshot = config_snapshot
    db.commit()
    db.refresh(plan)
    return plan
