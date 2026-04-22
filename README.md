# brickhub

Personal triathlon training dashboard. Running, biking, swimming, gym, and food — all in sync.

Cross-module AI coaching: each discipline adjusts based on what's happening in the others. Leg day yesterday? Your swim intensity drops. Long ride tomorrow? Tonight's dinner changes.

## Prerequisites

- An [Anthropic API key](https://console.anthropic.com) (for AI plan generation + coach chat)
- Node 18+ and Python 3.13 (`brew install python@3.13`) — for native setup
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — for Docker setup (optional)

## Setup (no Docker required)

```bash
git clone https://github.com/dhruvshetty/brickhub
cd brickhub
cp .env.example .env
# Open .env and add your ANTHROPIC_API_KEY
make dev-native
```

Open **http://localhost:3000**. Go to Settings and configure your race goal.

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
             └── PostgreSQL 15 for data storage
             └── Alembic for database migrations
             └── Claude API for plan generation + coach
```

## Milestones

- **M1 (current):** Dashboard + Running module + AI coach
- **M2:** Suunto sync, Biking, Swimming, Food + cross-module intelligence
- **M3:** Gym (PDF principles), recovery intelligence, race predictor

## Suunto Watch Sync (Milestone 2)

Register at [apizone.suunto.com](https://apizone.suunto.com), create an app, and add the credentials to your `.env`. The dashboard will then auto-sync after every watch sync.
