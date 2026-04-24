# Claude Prompts Reference

How every Claude call in brickhub is structured. Use this before reading source files.

---

## Models in Use

| Use case | Model | Method | max_tokens | Why |
|---|---|---|---|---|
| Running plan generation | `claude-sonnet-4-6` | `generate_with_cache` | 4096 | Needs strong reasoning; stable system context is cached |
| Food plan generation | `claude-sonnet-4-6` | `generate_with_cache` | 16384 | 7 days × 5 meals × ingredients ≈ 8,000–12,000 output tokens |
| Recalibration | `claude-haiku-4-5-20251001` | `generate_with_cache` | 4096 | Faster, cheaper; simpler reasoning |
| Coach chat | `claude-haiku-4-5-20251001` | `chat` | 1024 | Low-latency multi-turn; no caching |

---

## Plan Generation (`plan_generator.py`)

**Entry point:** `generate_running_plan(db, claude, profile, week_start)`

### System prompt (3 parts, all cached)

```
Part 1 (cached): Persona
  "You are a triathlon running coach. Generate adaptive, evidence-based training plans.
   Always return valid JSON only — no markdown, no explanations outside the JSON."

Part 2 (cached): Athlete profile
  Weekly training hours, age, weight (from Profile model)

Part 3 (cached): JSON output schema
  The full plan_json structure (see training_algorithms.md for schema)
```

### User prompt (not cached — changes every request)

```
Cross-module signals:
{signals_to_context_string(signals)}

Running configuration:
{_running_config_context(config, today)}

Recent running completion rate (last 4 weeks): X%

Generate a 7-day running plan for the week starting YYYY-MM-DD.
IMPORTANT: Do not schedule any training sessions before EARLIEST_DATE.
```

### `_running_config_context` injects

In order, as a plain-text block:
- Running goal (target_distance)
- Ability level
- Aerobic base priority flag
- Current weekly km, runs per week, preferred days, long run day
- Weeks to race, race terrain, training terrain
- Volume preference + description (gradual / steady / progressive)
- Effort preference + description (comfortable / balanced / challenging)
- Training goal (finish / beat_time / fitness)
- Target finish time (if beat_time)

Then appended as notes (not in the list):
- **Aerobic base note:** if `aerobic_base_priority`, strong instruction to keep 80%+ Zone 1–2, no tempo until week 4+
- **Terrain mismatch note:** if race terrain ≠ training terrain, include terrain-specific prep
- **Primary sport note:** if `is_primary_sport`, tell Claude this schedule takes precedence
- **Preferences note:** if `preferences_user_set`, tell Claude to respect explicit preferences over signals
- **Break return block:** if `returning_from_break`, inject reason/duration/prior km/effective km with hard cap instruction; injury/illness adds extra note about avoiding intensity in week 1

### JSON parsing

Claude is instructed to return valid JSON only. Fallback: `re.search(r"\{.*\}", raw, re.DOTALL)` to strip any accidental prose wrapper.

---

## Food Plan Generation (`food_plan_generator.py`)

**Entry point:** `generate_food_plan(db, claude, week_start, food_config, running_plan)`

**Critical difference from running plan:** nutrition context is computed in Python _before_ the Claude call. Claude receives `nutrition_context` as input, not a reasoning task.

### System prompt (3 parts, all cached)

```
Part 1 (cached): Persona
  "You are an expert sports nutritionist specialising in triathlon and endurance training.
   You understand carbohydrate periodisation, protein timing, and recovery nutrition.
   Always return valid JSON only — no markdown fences, no explanations outside the JSON."

Part 2 (cached): Nutrition context profiles
  Detailed macro guidance per context: carb_loading_day / pre_workout_moderate_carb /
  recovery_day / maintenance / race_morning / post_race_recovery
  (calorie multipliers, macro ratios, example foods)

Part 3 (cached): JSON output schema
  Full FoodDay schema with meal slots, macros, ingredients structure, batch coherence rules
```

### User prompt (not cached)

```
Athlete profile:
  dietary_preference, intolerances, calorie_baseline_kcal, weight_kg, cuisine_preference

Meal prep frequency: every_3_days | every_2_days | daily (with batch semantics explained)

Training schedule and pre-computed nutrition context for each day:
  YYYY-MM-DD: session=long, distance=18km, nutrition_context=carb_loading_day, prep_batch=1
  YYYY-MM-DD: session=rest, distance=0km, nutrition_context=recovery_day, prep_batch=1
  ... (all 7 days)

Instructions:
  - Use nutrition_context for macros/meal focus (see profiles above)
  - All days with the same prep_batch MUST share the IDENTICAL dinner recipe
  - Honour dietary_preference and intolerances strictly
  - Omit pre_workout/post_workout on rest days
```

### Output validation

`_parse_and_validate()`:
1. Try `json.loads(raw)`
2. On failure, try `re.search(r"\{.*\}", raw, re.DOTALL)` to strip prose wrapper
3. Check `days` array present with ≥ 7 entries
4. Merge pre-computed `nutrition_context` and `prep_batch` from Python into each day (overrides Claude's values to ensure window algorithm is authoritative)
5. On failure, raise `ValueError` — caller returns `{"ai_unavailable": True}` response

Note: streaming deferred. Single synchronous call with `max_tokens=16384`. Expected latency: 30–60 seconds.

---

## Coach Chat (`coach_service.py`)

**Entry point:** `chat(db, claude, profile, user_message)`

### System prompt (single string, rebuilt per request — not cached)

Structure:
```
Persona + athlete basics:
  "You are brickhub, a personal AI running coach..."
  Athlete name, age, race info (distance + days away), weekly training hours

Current training signals:
  {signals_to_context_string(signals)}

This week's running plan (from _format_plan_for_coach):
  Week summary: <plan summary>
  YYYY-MM-DD (type) Xkm [DONE | MISSED | upcoming | rest | not logged]
  (one line per day)

--- HOW TO HANDLE PLAN CHANGE REQUESTS ---
  - Only propose changes when athlete gives an explicit reason
  - Push back on minor fatigue, low motivation, busy schedule
  - Accept illness, injury, significant life events, accumulated overload
  - Propose minimum adjustment; only affect today or future dates
  - If change warranted: append <plan_change> JSON block (see below)
  - If pushing back: do NOT include <plan_change>
  - Keep responses under 150 words
```

### plan_change block format

Appended at the END of the assistant response when a change is proposed:

```
<plan_change>
{
  "reason": "One sentence: why this change is appropriate",
  "changes": [
    {
      "date": "YYYY-MM-DD",
      "new_session": {
        "date": "YYYY-MM-DD",
        "type": "easy|tempo|interval|long|race_pace|recovery|rest",
        "distance_km": 0,
        "duration_minutes": 0,
        "pace_zone": null,
        "description": "What to do"
      }
    }
  ]
}
</plan_change>
```

### Parsing

`_parse_plan_change(text)` uses `re.compile(r"<plan_change>(.*?)</plan_change>", re.DOTALL)`:
- Returns `(clean_text, change_dict)` — the delimiter block is stripped from the visible response
- Invalid JSON inside the block → returns `(clean_text, None)` silently

### original_session enrichment

`coach.py` (not `coach_service.py`) adds `original_session` to each change entry by looking up `WeeklyPlan.plan_json.days` after `chat()` returns. The coach service itself only knows new_session.

### Message history

Last 10 messages from `CoachMessage` table (ordered ascending) are passed as the `messages` list. The current user message is appended before the API call. Both user and assistant messages are persisted after the call.

---

## Recalibration (`workout_adjuster.py`)

**Entry point:** `recalibrate_running(db, claude, profile, current_week_start)`

### System prompt (cached)

```
"You are a triathlon running coach. A week has just ended.
 Recalibrate next week's plan based on what was missed.
 Don't just reschedule missed sessions — adjust intensity and volume sensibly.
 Return valid JSON only."
```

### User prompt (not cached)

```
Athlete profile: {_profile_context(profile)}

This week summary:
- Missed sessions: Monday (no notes), Wednesday (sore legs), ...
- 2 sessions completed

Cross-module signals: {signals_to_context_string(signals)}

Generate a recalibrated 7-day running plan for next week starting YYYY-MM-DD.
Use the same JSON structure as always:
{
  "week_start": "...",
  "module": "running",
  "summary": "...",
  "recalibration_note": "One sentence explaining the adjustments",
  "days": [...]
}
```

The output plan goes to **next week**, not the current week. Uses Haiku (faster, cheaper).

---

## Prompt Caching Strategy

Parts that rarely change → `cache: True` (stable context, gets `cache_control: ephemeral`):
- Coach persona string
- Athlete profile (name, age, weight, hours)
- JSON output schema / format instructions

Parts that change per-request → `cache: False` (dynamic context):
- Cross-module signals (change as sessions are logged)
- Running config context (changes if user edits config)
- Completion rate (changes as workouts are logged)
- Week start date
- Coach system prompt (rebuilt entirely per message — no caching)

**Cost implication:** Anthropic caches at the token boundary of the last cached block. The running plan 3-part system prompt caches ~600–800 tokens, saving ~$0.002 per generation. Food plan 3-part system prompt caches ~1,500–2,000 tokens (nutrition profiles + schema are verbose), saving ~$0.003–0.004 per generation. Coach chat has no caching — each message pays full input cost for the system prompt.

---

## Adding a New Claude Call

1. Decide: plan-quality reasoning (Sonnet) or fast/cheap (Haiku)?
2. Split system prompt into stable (cache=True) + dynamic (cache=False) parts
3. Always inject cross-module signals in the user prompt
4. Catch `ClaudeUnavailableError`, return `{"ai_unavailable": True}` with HTTP 200
5. Log the `call_type` string so cost attribution works in `uvicorn.log`
