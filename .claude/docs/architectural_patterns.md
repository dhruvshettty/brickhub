# Architectural Patterns

## Cross-Module Signals (the core differentiator)

Every Claude call receives a snapshot of the athlete's full training state.

`backend/app/services/cross_module.py` — `get_signals(db, profile, today)` computes:

| Signal | How computed |
|---|---|
| `fatigue_level` | low / moderate / high — thresholds at 150 min and 300 min total weekly training |
| `total_training_minutes_this_week` | sum of `duration_minutes` on completed `WorkoutLog` rows this week |
| `completed_sessions` / `missed_sessions` | WorkoutLog rows with / without `completed_at` this week |
| `brick_yesterday` | bike + run both completed yesterday (by module type) |
| `race_proximity` | race_week / 2_weeks / 1_month / Nd — from `running_config.race_date` |

`signals_to_context_string(signals)` formats the dict as bullet lines for prompt injection. All plan generators, recalibration, and coach calls import and use both functions.

**Rule:** When adding a new Claude call, always inject cross-module signals. Never generate a plan without them.

---

## Claude Service

`backend/app/services/claude_service.py` — three methods:

| Method | Model | Caching | Used for |
|---|---|---|---|
| `generate_with_cache(system_parts, user, max_tokens=4096)` | Sonnet 4.6 | Yes — stable system parts get `cache_control: ephemeral` | Plan generation |
| `generate(system, user)` | Sonnet 4.6 (overrideable) | No | One-off calls |
| `chat(messages, system)` | Haiku 4.5 | No | Coach multi-turn chat |

`max_tokens` defaults to 4096. Food plan generation passes `max_tokens=16384` because a full 7-day meal plan with ingredients is ~8,000–12,000 output tokens.

`system_parts` is a list of `{"text": "...", "cache": bool}` dicts. Parts with `cache: True` are marked for Anthropic prompt caching. The first cache hit on a ≥1024-token block is a cache write; subsequent calls within the TTL are cache reads (much cheaper).

Cost logging: every call logs model, call_type, token counts, and estimated USD cost to uvicorn.error logger.

`ClaudeUnavailableError` is the single exception for any Anthropic API failure. All callers catch it and return HTTP 200 with `{"ai_unavailable": True}`. **Never let a Claude failure crash a page.**

---

## Plan Generation + Caching

Plans are generated once per week and stored in `weekly_plans` (natural key: `module` + `week_start`). The next fetch returns the cached row immediately.

`backend/app/services/plan_generator.py`:
- `generate_running_plan(db, claude, profile, week_start)` — builds prompt, calls Claude, parses JSON
- `save_plan(db, module, week_start, plan_json)` — deletes existing row first, then inserts new one

**Invalidation rules:**
- `PUT /running/config` deletes the current week's plan so the next fetch regenerates with new config
- Re-onboarding ("Save & regenerate") also deletes the plan row — `regenerate: true` flag in `RunningConfigRequest`
- Past weeks are **never regenerated** — if no plan row exists for a past week, return `{"plan": None}`
- Food follows the same invalidation pattern: `PUT /food/config` with `regenerate: true` deletes the current food plan

**Past week guard** (in `GET /running/plan` and `GET /food/plan`): if `week_start < current_week_start`, return `{"plan": None}` without touching Claude.

**`config_snapshot`** on `weekly_plans`: nullable JSON column added in migration 008. Food plans write the config snapshot at generation time. Not used for automatic invalidation yet — invalidation is explicit via `regenerate: true`.

---

## Food Plan Generation

`backend/app/services/food_plan_generator.py` — different pattern from running plan generation:

**Key difference:** nutrition context is computed in Python _before_ calling Claude. Claude receives pre-computed `nutrition_context` per day and generates meals — it does not evaluate the window algorithm itself.

**Window algorithm** (`_assign_nutrition_contexts`):
1. Race check: if `race_date` within 7 days → `carb_loading_day` (T-3, T-2), `race_morning` (T), `post_race_recovery` (T+1)
2. Tomorrow's session: `long` (≥15 km) or `interval` → `carb_loading_day`; `tempo` → `pre_workout_moderate_carb`
3. Yesterday's session: `long` (≥15 km) → `recovery_day`
4. Default: `maintenance`

Window algorithm only looks within the current week. Cross-week edge cases (e.g., Monday after a Sunday long run) fall back to maintenance.

**No cross-module signals injection.** Food plan reads the running plan directly from `weekly_plans` — it doesn't use `get_signals()`. Running plan is passed as a parameter; if unavailable, all days default to maintenance context.

**`race_date` injection:** food router reads `race_date` from the running module config and injects it into `food_config` as `_race_date` before calling the generator.

**Claude call:** `generate_with_cache(system_parts, user_prompt, max_tokens=16384)`. Sonnet 4.6. Three cached system blocks: persona, nutrition profiles, JSON schema. Dynamic user block: user profile + per-day schedule with pre-computed nutrition_context.

**Batch coherence:** Claude is instructed via the system prompt that all days sharing the same `prep_batch` must use the identical dinner recipe. Batch assignment is done in Python (`_assign_prep_batches`) before the Claude call.

**meal_logs table** (migration 008): `meal_type` enum replaced by `meal_slot` VARCHAR. New columns: `module` (default `'food'`), `prep_batch` (int nullable), `feedback` (text nullable, reserved for future "what worked" feature).

---

## AI Coach → Plan Control

Coach chat can propose plan changes via a `<plan_change>…</plan_change>` block embedded in its response.

**Flow:**
1. `POST /coach/message` calls `coach_service.chat()` which uses `claude.chat()` (Haiku)
2. `_parse_plan_change(text)` strips the delimiter block, returns `(clean_text, change_dict | None)`
3. If a change exists, `coach.py` enriches each entry with `original_session` by looking up current `WeeklyPlan`
4. Frontend `CoachPanel` renders the diff card; user confirms or dismisses
5. `POST /running/apply-plan-change` validates, mutates `WeeklyPlan.plan_json`, writes `PlanEdit` rows, **deletes any existing `WorkoutLog` for affected dates** so training signals don't count the old session

**Constraints enforced in `apply-plan-change`:**
- Only today and future dates are processed (past dates are silently skipped)
- Each applied change deletes the existing workout log for that date

**Recalibrate collision:** if `plan_edits` has entries for the current week, `Running.tsx` shows a confirmation banner before calling `POST /running/recalibrate`.

---

## Plan Edits Audit Trail

`PlanEdit` table (`backend/app/models/plan_edit.py`): one row per coach-applied change.

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `module` | str | always "running" in M1 |
| `week_start` | date | Monday of the affected week |
| `date` | date | the specific day changed |
| `changed_at` | datetime | auto-set by DB |
| `original_session` | JSON | snapshot of the day before the change |
| `new_session` | JSON | what the coach proposed |
| `reason` | str | one-sentence rationale from coach |

`_plan_edits_for_week(db, week_start)` in `running.py` returns `dict[str, dict]` keyed by date string. This is returned as `plan_edits` on every `GET /running/plan` response and displayed as "coach edit" badges with hover tooltips in `Running.tsx`.

---

## Onboarding Gate Pattern

The gate lives in the frontend, not the backend.

`Running.tsx`: `getRunningConfig() → { onboarded: false } → navigate('/running/setup')`
`Food.tsx`: `getFoodConfig() → { running_onboarded: false } → navigate('/running')` (running must be set up first)
`Food.tsx`: `getFoodConfig() → { onboarded: false } → navigate('/food/setup')`

Config stored in `module_configs` (one row per profile per module, `config_json` blob). `onboarded_at` being non-null is the flag. `Dashboard.tsx` reads `running_onboarded` and `food_onboarded` from `GET /dashboard/summary`.

**Food dependency gate:** `PUT /food/config` returns HTTP 400 if running is not configured. The frontend also redirects to `/running` if `running_onboarded` is false. Food without a running plan is not supported — nutrition contexts depend on the running schedule.

**Rule:** When adding a new module, repeat this pattern.

---

## Workout Log + Status

`WorkoutLog` table: one row per logged session. `planned_at` is the date field used for lookups (stored as datetime at midnight). `completed_at` being non-null means done; null means missed.

`_day_logs_for_week(db, week_start)` returns `dict[str, 'done' | 'missed']` keyed by date string — used in both the plan response and the coach system prompt.

**Important:** When a coach plan change is applied for a date, the existing `WorkoutLog` row for that date is deleted. This prevents stale "done" status from counting in training signals after the session is replaced.

`DELETE /running/log/{date}` is available for manual clear from the frontend.

---

## Onboarding Re-entry (Edit Config)

`RunningSetup.tsx` checks for existing config on mount (`getRunningConfig()`). If found, `isEditing = true`.

Step 6 (confirmation) renders two buttons when editing:
- "Save & keep plan" → `saveRunningConfig({..., regenerate: false})` — preserves current week's plan
- "Save & regenerate →" → `saveRunningConfig({..., regenerate: true})` — deletes current plan, forces fresh generation

---

## Week Navigation

`Running.tsx` supports navigating to past weeks (Monday-aligned). Rules:
- No forward navigation past the current week (right chevron disabled on current week)
- Past weeks return the cached `WeeklyPlan` row — never trigger regeneration
- If no plan exists for a past week, "No plan recorded for this week" card is shown
- The current week shows an explanatory note in the Week Focus card explaining why plans are week-by-week

---

## JSON Blob Storage

Four tables store flexible data as JSON blobs:

| Table | Column | Contents |
|---|---|---|
| `weekly_plans` | `plan_json` | Full 7-day Claude-generated plan (summary, days array) |
| `weekly_plans` | `config_snapshot` | Config at generation time — for invalidation tracking (nullable) |
| `module_configs` | `config_json` | Module-specific onboarding answers |
| `plan_edits` | `original_session` / `new_session` | PlanDay snapshots at time of coach change |

**Rule:** Use JSON blobs for data read/written as a unit and not filtered on. Use proper columns for anything queried or joined.

---

## Training Preference Precedence

Each module config stores `volume_preference`, `effort_preference`, `is_primary_sport`, `preferences_user_set`.

- **Auto-derived:** from ability level during onboarding (beginner → gradual/comfortable, intermediate → steady/balanced, advanced/elite → progressive/challenging). `preferences_user_set = false`.
- **User override:** if user explicitly changes a preference, `preferences_user_set = true`. Prompt note tells Claude to respect these even if signals suggest otherwise.
- **Primary sport:** when `is_primary_sport = true`, Claude is told this module's schedule takes precedence. Future module planners (biking, etc.) must plan around it.

**Rule:** Never auto-update preferences once `preferences_user_set = true`.

---

## API Contract Ownership

`frontend/src/lib/api.ts` is the single source of truth for all TypeScript types and API function signatures. When a backend endpoint changes shape, update this file first.

FastAPI auto-generates `/docs` from Pydantic models at `http://localhost:8000/docs` — use it to spot drifts between backend and frontend types.

---

## Database Session + Profile Singleton

FastAPI dependency injection: `db: Session = Depends(get_db)` on every endpoint that touches the DB. Session auto-closes via generator finally block.

No multi-user support. `_get_or_create_profile(db)` (in `settings.py`, imported by other routers) always returns the single `Profile` row. When multi-user is added: add `user_id` FKs to all tables + auth middleware.
