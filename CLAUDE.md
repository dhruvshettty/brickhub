# brickhub

Personal triathlon training dashboard. Five modules (running, biking, swimming, gym, food) share cross-module intelligence: gym soreness affects swim plan, long ride tomorrow affects dinner suggestion. Claude generates all plans and coaches in real time.

Single-user, self-hosted. M1 (running) is complete. M2 (biking) and M3 (training data integration via Strava) are next.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, React Router 6, lucide-react |
| Backend | FastAPI (Python 3.13), SQLAlchemy, Alembic |
| Database | SQLite (dev) / Postgres (prod) |
| AI | Anthropic claude-sonnet-4-6 (plans), claude-haiku-4-5-20251001 (coach chat + recalibration) |
| Styling | Inline styles + CSS custom properties (`frontend/src/index.css`) |

## Key Directories

```
backend/app/
  core/          database.py (engine + get_db), config.py (pydantic settings)
  models/        ORM models — one file per table
    profile.py, workout.py, plan.py, plan_edit.py, module_config.py, coach.py
  services/
    claude_service.py     ClaudeService (generate, generate_with_cache, chat) + cost logging
    cross_module.py       get_signals() + signals_to_context_string() — injected into every Claude call
    plan_generator.py     generate_running_plan(), save_plan(), _running_config_context()
    coach_service.py      chat() — builds system prompt, parses <plan_change> blocks
    workout_adjuster.py   recalibrate_running() — Haiku-based weekly recalibration
    running_ability.py    Deterministic classify(), suggest_weekly_runs() — no Claude
  api/v1/        Route handlers — one file per module
  alembic/       Migrations 001–007

frontend/src/
  lib/api.ts     All API calls + TypeScript types (single source of truth for API contracts)
  pages/         Running.tsx, RunningSetup.tsx, Dashboard.tsx, + one file per route
  components/    Card.tsx, CoachPanel.tsx
```

## Commands

```bash
make dev-native        # start everything (migrations run automatically)
make stop-native       # kill background API server

make reset-module m=running   # clear one module's onboarding + cached plan
make reset-all                # clear all training data (keeps profile)

tail -f backend/uvicorn.log   # API server logs (includes Claude token cost per call)
```

API docs auto-generated at `http://localhost:8000/docs` when running.

## Running Module — Key Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/running/plan?week_start=` | Returns cached plan + day_logs + plan_edits. Generates if missing. Past weeks return `plan: null`. |
| PUT | `/running/config` | Save onboarding config. `regenerate: true` deletes current week plan. |
| POST | `/running/log` | Mark session done or missed. |
| DELETE | `/running/log/{date}` | Clear a workout log entry. |
| POST | `/running/recalibrate` | Generate next week's plan based on this week's misses (Haiku). |
| POST | `/running/apply-plan-change` | Apply coach-proposed change to current week plan. Deletes WorkoutLog for affected dates. |
| POST | `/coach/message` | Send message to AI coach. Returns `{response, plan_change}`. |
| GET | `/coach/history` | Last 50 coach messages. |

## Adding a New Module

1. Add ORM model in `backend/app/models/`
2. Register in `backend/app/models/__init__.py`
3. Write Alembic migration in `backend/alembic/versions/`
4. Add API router in `backend/app/api/v1/`, register in `backend/app/main.py`
5. Add page in `frontend/src/pages/`, wire route in `frontend/src/App.tsx`
6. Add API functions + types in `frontend/src/lib/api.ts`
7. Check if running `is_primary_sport = true` before scheduling — plan around it

## Environment

Copy `.env.example` → `.env`. Required: `ANTHROPIC_API_KEY`. Without it the app runs but all AI features show "unavailable" banners — no crash.

## Documentation

Read these before making changes — they eliminate the need to read source files for context:

- `.claude/docs/roadmap.md` — milestone tracker, open tasks, known bugs, dev notes
- `.claude/docs/architectural_patterns.md` — plan caching, coach plan control, audit trail, week navigation, onboarding gate, JSON blob storage, workout log behavior
- `.claude/docs/training_algorithms.md` — ability classification thresholds, break-return volume formula, fatigue signal thresholds, weekly run suggestion, recalibration logic, plan day JSON schema
- `.claude/docs/claude_prompts.md` — every Claude call: which model, caching strategy, system prompt structure, plan_change delimiter format, how to add a new call
