# brickhub

Personal triathlon training dashboard. Running, biking, swimming, gym, and food — all in sync.

Cross-module AI coaching: each discipline adjusts based on what's happening in the others. Leg day yesterday? Your swim intensity drops. Long ride tomorrow? Tonight's dinner changes.

## Prerequisites

- An [Anthropic API key](https://console.anthropic.com) (for AI plan generation + coach chat)
- Node 18+ and Python 3.13 — check with `python3 --version`, install with `brew install python@3.13`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — for Docker setup (optional)

## Setup (no Docker required)

```bash
git clone https://github.com/dhruvshetty/brickhub
cd brickhub
cp .env.example .env
# Open .env and add your ANTHROPIC_API_KEY
make dev-native
```

Open **http://localhost:3000**. Click **Running** in the sidebar and follow the setup wizard to generate your first plan (~5 min).

API docs: **http://localhost:8000/docs**

The native setup uses SQLite (no database to install), Python 3.13 venv, and Node — no Docker needed.

## Setup (Docker)

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY
make dev
```

## Commands

| Command | What it does |
|---------|-------------|
| `make dev-native` | Start everything natively (SQLite, no Docker) |
| `make stop-native` | Stop the background API server |
| `make dev` | Start with Docker (requires Docker Desktop) |
| `make down` | Stop Docker containers |
| `make logs` | Stream Docker logs |
| `make db-upgrade` | Run pending migrations (Docker) |
| `make db-reset` | Wipe database and restart (Docker) |
| `make reset-all` | Clear all training data for a clean state (keeps profile) |
| `make reset-module m=running` | Reset one module's onboarding and cached plan |

## Troubleshooting

**"python3.13: command not found"** — Run `brew install python@3.13`.

**"API key error" or plan generation fails** — Check `ANTHROPIC_API_KEY` in your `.env`. It should start with `sk-ant-`. The app still works without it (shows cached/empty plans).

**Backend not responding** — Check `backend/uvicorn.log` or run `make stop-native && make dev-native`.

**"Docker not found"** — Use `make dev-native` instead (no Docker needed).

**Something else is broken** — Check `backend/uvicorn.log` for the API server or the terminal where Vite is running.

## Architecture

```
frontend/    React + TypeScript (Vite), hot reload on port 3000
backend/     FastAPI (Python 3.11+), hot reload on port 8000
             └── SQLite (dev) / PostgreSQL (prod) for data storage
             └── Alembic for database migrations
             └── Claude API for plan generation + coach
```

## Contributing

Issues, ideas, and pull requests welcome: [github.com/dhruvshettty/brickhub](https://github.com/dhruvshettty/brickhub)

## Strava Sync (Milestone 3)

Register an app at [strava.com/settings/api](https://www.strava.com/settings/api) and add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` to your `.env`. Once implemented, activities will sync automatically after every upload.
