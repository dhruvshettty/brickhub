# brickhub

Personal triathlon training dashboard. Running, biking, swimming, gym, and food — all in sync.

Cross-module AI coaching: each discipline adjusts based on what's happening in the others. Leg day yesterday? Your swim intensity drops. Long ride tomorrow? Tonight's dinner changes.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- An [Anthropic API key](https://console.anthropic.com) (for AI plan generation + coach chat)

## Setup

```bash
git clone https://github.com/dhruvshetty/brickhub
cd brickhub
cp .env.example .env
# Open .env and add your ANTHROPIC_API_KEY
make dev
```

Open **http://localhost:3000**. Go to Settings and configure your race goal.

API docs: **http://localhost:8000/docs**

## Commands

| Command | What it does |
|---------|-------------|
| `make dev` | Start everything with hot reload |
| `make down` | Stop all containers |
| `make logs` | Stream all logs |
| `make db-upgrade` | Run pending database migrations |
| `make db-reset` | Wipe the database and restart fresh |

## Troubleshooting

**"Docker not found"** — Install Docker Desktop first, then try again.

**"API key error" or plan generation fails** — Check `ANTHROPIC_API_KEY` in your `.env` file. It should start with `sk-ant-`.

**"DB connection failed"** — Run `make db-reset`. This wipes and restarts the database.

**Something else is broken** — Run `make logs` to see what's failing.

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
