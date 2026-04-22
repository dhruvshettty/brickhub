# Architectural Patterns

## Cross-Module Signals (the core differentiator)

Every Claude call receives a snapshot of the athlete's full training state. This is what makes brickhub different from siloed apps.

`backend/app/services/cross_module.py` — `get_signals()` computes:
- Fatigue level (low/moderate/high) from weekly training minutes
- Completed + missed session counts
- Brick detection (bike + run same day)
- Race proximity (race_week / 2_weeks / 1_month / Nd)

`signals_to_context_string()` formats it for prompt injection. Every plan generator, recalibrator, and coach call imports and uses both functions.

**Rule:** When adding a new Claude call, always inject cross-module signals. Never generate a plan without them.

---

## Claude Prompt Structure

All Claude calls follow the same shape: stable context (cacheable) → dynamic context (not cached) → task instruction.

`backend/app/services/claude_service.py`:
- `generate_with_cache(system_parts, user_prompt)` — `system_parts` is a list of `{"text": ..., "cache": bool}`. Parts with `cache: True` get `cache_control: ephemeral` for Anthropic prompt caching.
- `generate(system_prompt, user_prompt)` — no caching, used for one-off recalibration.
- `chat(system_prompt, messages)` — multi-turn, uses `claude-haiku-4-5-20251001`.

**Stable (cached):** persona instruction, athlete profile
**Dynamic (not cached):** cross-module signals, recent completion rates, week-specific instructions

See `plan_generator.py:64–77` for the canonical example.

---

## Plan Caching + Invalidation

Plans are generated once and stored in `weekly_plans` (module + week_start as natural key). On request, the cached row is returned immediately without calling Claude again.

`backend/app/services/plan_generator.py` — `save_plan()` deletes any existing row for that week/module before inserting.

Invalidation is explicit: `PUT /running/config` deletes the current week's plan so the next fetch regenerates with the new config (`backend/app/api/v1/running.py:75–80`).

**Rule:** When any config that affects plan generation changes, delete the affected `WeeklyPlan` row.

---

## Onboarding Gate Pattern

Modules require completing a setup wizard before the main view loads. The gate lives in the frontend page, not the backend.

`frontend/src/pages/Running.tsx:36–42`:
```
getRunningConfig() → { onboarded: false } → navigate('/running/setup')
```

Config is stored in `module_configs` (one row per profile per module, `config_json` blob). `onboarded_at` being non-null is the flag.

**Rule:** When adding a new module, repeat this pattern — check config on page load, redirect to `/modulename/setup` if not onboarded.

---

## Database Session Injection

FastAPI dependency injection via `Depends(get_db)` on every endpoint. Session is a generator that auto-closes.

`backend/app/core/database.py` — `get_db()` yields `SessionLocal()`, finally-closes it.

All endpoints that touch the DB declare: `db: Session = Depends(get_db)`.

---

## JSON Blob Storage

Three tables store flexible data as JSON rather than normalised columns:
- `weekly_plans.plan_json` — full 7-day Claude-generated plan
- `module_configs.config_json` — module-specific onboarding answers
- `coach_messages.context_json` — snapshot of signals at message time

**Rule:** Use JSON blobs for data that is read/written as a unit and not queried field-by-field. Use proper columns for anything filtered or joined on.

---

## AI Unavailability Handling

`ClaudeUnavailableError` is the single exception type for any Anthropic API failure (`claude_service.py`).

Endpoints catch it and return `{"ai_unavailable": True, "message": "..."}` with HTTP 200 — never a 5xx. The frontend renders an orange warning banner and stays functional for logging and viewing cached plans.

**Rule:** Never let a Claude failure crash a page. Always catch `ClaudeUnavailableError`, return graceful JSON, render a banner.

---

## API Contract Ownership

`frontend/src/lib/api.ts` is the single file that owns all TypeScript types and API functions. When a backend endpoint changes shape, update the types here first.

Pydantic models in `backend/app/api/v1/*.py` mirror these types. FastAPI auto-generates `/docs` from them — use `/docs` to spot drifts.

---

## Profile Singleton

There is no multi-user support. `_get_or_create_profile(db)` (defined in `backend/app/api/v1/settings.py`, imported by other routers) always returns the single `Profile` row, creating it if missing.

When multi-user support is added: add `user_id` FKs to all tables + auth middleware.
