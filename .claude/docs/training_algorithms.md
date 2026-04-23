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
