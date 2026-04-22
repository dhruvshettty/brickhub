# brickhub

Personal triathlon training dashboard. Five modules (running, biking, swimming, gym, food) share cross-module intelligence: gym soreness affects swim plan, long ride tomorrow affects dinner suggestion. Claude generates all plans and coaches in real time.

Single-user, self-hosted. M1 (running) is complete. M2 (biking, swimming, food, Suunto sync) and M3 (gym, recovery) are next.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, React Router 6, lucide-react |
| Backend | FastAPI (Python 3.13), SQLAlchemy, Alembic |
| Database | SQLite (dev) / Postgres (prod) |
| AI | Anthropic claude-sonnet-4-6 (plans), claude-haiku-4-5-20251001 (coach chat) |
| Styling | Inline styles + CSS custom properties (`frontend/src/index.css`) |

## Key Directories

```
backend/app/
  core/          database.py (engine + get_db), config.py (pydantic settings)
  models/        ORM models — one file per table
  services/      Business logic: claude_service, cross_module, plan_generator, coach_service, running_ability
  api/v1/        Route handlers — one file per module
  alembic/       Migrations (001_initial_schema, 002_module_configs)

frontend/src/
  lib/api.ts     All API calls + TypeScript types (single source of truth for API contracts)
  pages/         One file per route
  components/    Card.tsx, CoachPanel.tsx
```

## Commands

```bash
make dev-native        # start everything (migrations run automatically)
make stop-native       # kill background API server

make reset-module m=running   # clear one module's onboarding + cached plan
make reset-all                # clear all training data (keeps profile)

tail -f backend/uvicorn.log   # API server logs
```

API docs auto-generated at `http://localhost:8000/docs` when running.

## Adding a New Module

1. Add ORM model in `backend/app/models/`
2. Register in `backend/app/models/__init__.py`
3. Write Alembic migration in `backend/alembic/versions/`
4. Add API router in `backend/app/api/v1/`, register in `backend/app/main.py`
5. Add page in `frontend/src/pages/`, wire route in `frontend/src/App.tsx`
6. Add API functions + types in `frontend/src/lib/api.ts`

## Environment

Copy `.env.example` → `.env`. Required: `ANTHROPIC_API_KEY`. Without it the app runs but all AI features show "unavailable" banners — no crash.

## Additional Documentation

- `.claude/docs/roadmap.md` — milestone tracker, open tasks, known bugs, dev notes (check this before starting new features)
- `.claude/docs/architectural_patterns.md` — cross-module signals, Claude prompt structure, plan caching, onboarding gate, JSON blob storage, error handling
