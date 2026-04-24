# Training Algorithms

All algorithms in this file are **deterministic** — no Claude involved. They live in `backend/app/services/running_ability.py` and related helpers. When modifying thresholds or formulas, update this doc and the source together.

---

## Ability Classification

`running_ability.py` — `classify(distance, time_seconds, effort_score) → dict`

### Step 1: Pace-based level (classify_from_pace)

Computes `pace = time_seconds / distance_km`, then looks up against thresholds:

| Distance | Elite (s/km) | Advanced | Intermediate | → Beginner |
|---|---|---|---|---|
| 5k | ≤ 210 (~3:30/km) | ≤ 255 (~4:15) | ≤ 330 (~5:30) | > 330 |
| 10k | ≤ 222 | ≤ 270 | ≤ 348 | > 348 |
| 10 mile | ≤ 234 | ≤ 285 | ≤ 366 | > 366 |
| Half | ≤ 240 | ≤ 294 | ≤ 378 | > 378 |
| Marathon | ≤ 258 | ≤ 318 | ≤ 408 | > 408 |
| 50k | ≤ 300 | ≤ 372 | ≤ 480 | > 480 |

### Step 2: Effort adjustment (apply_effort_adjustment)

`effort_score` is the user's perceived effort on the classified race (1–10 scale).

- **effort_score ≥ 8:** aerobic base is the primary limiter → drop one level (e.g. intermediate → beginner), set `aerobic_base_priority = true`
- **effort_score < 8:** keep base level, `aerobic_base_priority = false`

Level order for the drop: `beginner → intermediate → advanced → elite`

### Output

```python
{
    "base_level": "intermediate",      # from pace alone
    "adjusted_level": "beginner",      # after effort adjustment
    "aerobic_base_priority": True,
    "explanation": "..."               # human-readable for wizard display
}
```

---

## Weekly Run Suggestion

`suggest_weekly_runs(recent_runs_4_weeks, ability_level) → int`

```
avg_runs_per_week = recent_runs_4_weeks / 4
suggested = max(2, round(avg * 0.80))     # 80% of recent average, floor 2
return min(suggested, cap[ability_level]) # cap by level
```

Caps: beginner → 4, intermediate → 5, advanced → 6, elite → 7

The 0.80 factor adds conservatism — better to under-schedule and build up.

When `recent_runs_4_weeks == 0`: slider auto-resets `current_weekly_km` to 0; km > 0 with 0 runs blocks Step 4 progression with an error message (inconsistency guard).

---

## Return-from-Break Volume Algorithm

`RunningSetup.tsx` — `computeEffectiveKm()` (also mirrored in `plan_generator.py` for prompt injection)

```
effective_km = prior_baseline_km × ability_factor × duration_factor × injury_cap
effective_km = max(effective_km, current_weekly_km)  # never go below current
```

### Factors

**ability_factor** (how much fitness the athlete retains per their base level):
| Level | Factor |
|---|---|
| Beginner | 0.40 |
| Intermediate | 0.60 |
| Advanced | 0.75 |
| Elite | 0.85 |

**duration_factor** (how much fitness decays with break length):
| Duration | Factor |
|---|---|
| < 1 month | 0.90 |
| 1–3 months | 0.70 |
| 3–6 months | 0.50 |
| 6+ months | 0.30 |

**injury_cap** (additional cap for injury/illness returns):
- `injury` or `illness` reason → cap multiplier = 0.50
- All other reasons (vacation, life, other) → cap = 1.0 (no extra cap)

### Example

Intermediate runner, prior 50 km/week, 3-month illness break, currently at 10 km/week:
```
effective_km = 50 × 0.60 × 0.70 × 0.50 = 10.5 km/week
effective_km = max(10.5, 10) = 10.5 km/week
```

### Proactive trigger

The returning-from-break UI in wizard Step 4 appears when `0 < recentRuns4Weeks < 4`. At ≥ 4 runs the trigger resets automatically. At 0 runs the slider resets to 0 km and no break context is collected.

---

## Fatigue Signals

`cross_module.py` — `get_signals()`:

Total weekly training minutes (all modules combined) → fatigue level:
- ≤ 150 min → `low`
- 151–300 min → `moderate`
- > 300 min → `high`

These thresholds are intentionally simple. They exist to give Claude a rough signal, not to be medically precise. The athlete's logged `duration_minutes` per session is the input — not distance or pace.

---

## Recalibration

`workout_adjuster.py` — `recalibrate_running(db, claude, profile, current_week_start)`

Recalibration is Claude-driven (not deterministic) but follows a fixed data-gathering pattern:
1. Query missed + completed `WorkoutLog` rows for the current week
2. Compute cross-module signals
3. Pass missed session summary (day names + notes), completion count, and signals to Haiku
4. Haiku returns a new 7-day plan for **next week** with a `recalibration_note` field
5. `save_plan()` writes it for next week (does not overwrite current week)

Model used: `claude-haiku-4-5-20251001` (faster, cheaper for recalibration — no prompt caching).

Recalibrate is blocked by a confirmation dialog when coach edits exist on the current week (checked via `Object.keys(planData?.plan_edits ?? {}).length > 0` in `Running.tsx`).

---

## Food Nutrition Window Algorithm

`food_plan_generator.py` — `_assign_nutrition_contexts(days, race_date) → list[dict]`

Priority-ordered rules evaluated **per day**. First match wins.

| Priority | Condition | `nutrition_context` assigned |
|---|---|---|
| 1 | `race_date` set, `delta == 2 or 3` (T-3, T-2) | `carb_loading_day` |
| 1 | `race_date` set, `delta == 0` (race day) | `race_morning` |
| 1 | `race_date` set, `delta == -1` (day after race) | `post_race_recovery` |
| 2 | tomorrow = `long` and distance ≥ 15 km | `carb_loading_day` |
| 2 | tomorrow = `interval` | `carb_loading_day` |
| 2 | tomorrow = `tempo` | `pre_workout_moderate_carb` |
| 3 | yesterday = `long` and distance ≥ 15 km | `recovery_day` |
| 4 | all other days | `maintenance` |

`pre_workout_light` is reserved in the schema but not assigned by the algorithm in M2 (requires `session_time` field on running plan, not yet implemented).

**Cross-week edge cases:** algorithm only looks within the current week's `days` array. Monday's "yesterday" (Sunday of prior week) and Sunday's "tomorrow" (Monday of next week) are not looked up — they fall back to `maintenance`. Acceptable for M2.

**Race date source:** `race_date` comes from the running module's `config_json`, not from food config. Food router reads it and injects as `food_config["_race_date"]` before calling the generator.

---

## Food Calorie Baseline Estimation

`PUT /food/config` — if `weight_kg` provided and `calorie_baseline_kcal` was not explicitly overridden from the default (2200):

```
calorie_baseline_kcal = round(weight_kg × 35)
```

Factor 35 kcal/kg approximates total daily energy expenditure for an active adult (~TDEE at moderate activity). The frontend shows the auto-estimated value as editable; user can override before saving.

Default when weight is skipped: 2200 kcal/day.

---

## Food Prep Batch Assignment

`food_plan_generator.py` — `_assign_prep_batches(days, prep_frequency) → list[dict]`

| prep_frequency | Batch assignment |
|---|---|
| `daily` | Each day is its own batch (batch 1 through 7) |
| `every_2_days` | Days 0–1 → batch 1, days 2–3 → batch 2, days 4–5 → batch 3, day 6 → batch 4 |
| `every_3_days` | Days 0–2 (Mon–Wed) → batch 1, days 3–6 (Thu–Sun) → batch 2 |

`every_3_days` default: batch 2 covers 4 days (Thu–Sun) instead of 3. Acceptable — Sunday is typically rest or long run with simpler needs.

**Batch coherence rule** (in Claude prompt): all days sharing the same `prep_batch` must have the **identical dinner** name and recipe. Breakfast and lunch can vary within a batch. This is enforced via prompt instruction, then overridden post-generation: `_parse_and_validate` overwrites each day's `prep_batch` with the Python-computed value to ensure prompt compliance.

---

## Food Plan Day JSON Schema

Produced by `food_plan_generator.py`, stored in `weekly_plans.plan_json` with `module = 'food'`.

```json
{
  "week_start": "YYYY-MM-DD",
  "module": "food",
  "prep_frequency": "every_3_days",
  "race_week": false,
  "days": [
    {
      "date": "YYYY-MM-DD",
      "session_type": "easy | tempo | interval | long | race_pace | recovery | rest",
      "session_distance_km": 0,
      "nutrition_context": "carb_loading_day | pre_workout_moderate_carb | recovery_day | maintenance | race_morning | post_race_recovery",
      "prep_batch": 1,
      "targets": {
        "calories": 2800,
        "carbs_g": 380,
        "protein_g": 140,
        "fat_g": 80
      },
      "meals": {
        "breakfast": {
          "name": "string",
          "description": "string",
          "calories": 0,
          "macros": { "carbs_g": 0, "protein_g": 0, "fat_g": 0 },
          "ingredients": [
            { "name": "string", "quantity": "string", "unit": "string", "category": "produce | proteins | grains | dairy | pantry | other" }
          ]
        },
        "pre_workout": { "name": "...", "timing": "60-90 min before", "calories": 0, "macros": {}, "ingredients": [] },
        "post_workout": { "name": "...", "timing": "within 30 min after", "calories": 0, "macros": {}, "ingredients": [] },
        "lunch": { ... },
        "dinner": { ... },
        "snacks": []
      },
      "note": "Brief note about this day's nutrition strategy"
    }
  ]
}
```

**Meal slot rules:**
- Rest days: `pre_workout` and `post_workout` are **omitted** (not null — key absent)
- Training days: `pre_workout` and `post_workout` are present
- `snacks` is an array of meal objects (0–2 per day; more on high-load days)
- `targets` macros: `carbs_g × 4 + protein_g × 4 + fat_g × 9 ≈ calories` (within 10%)

---

## Plan Day JSON Schema

All plan generators and the coach both produce / consume this shape:

```json
{
  "date": "YYYY-MM-DD",
  "type": "easy | tempo | interval | long | race_pace | recovery | rest",
  "distance_km": 0,
  "duration_minutes": 0,
  "pace_zone": "zone1 | zone2 | zone3 | zone4 | zone5 | null",
  "description": "Brief instruction: what to do and how",
  "rationale": "1-2 sentences: why this session given ability, goal, race timeline, fatigue"
}
```

`rationale` is displayed in the plan detail view. Rest days have `distance_km: 0`, `duration_minutes: 0`, `description: ""`.

Valid `type` values by distance target (from `RUN_TYPES` in `plan_generator.py`):
- sprint: easy, tempo, long
- olympic: easy, tempo, interval, long
- 70.3: easy, tempo, interval, long, race_pace
- ironman: easy, tempo, interval, long, race_pace, recovery
