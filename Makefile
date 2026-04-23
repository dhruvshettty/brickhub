.PHONY: dev dev-native build down logs db-upgrade db-reset reset stop-native reset-module reset-all clear-plan

# ── Docker targets (requires Docker Desktop) ────────────────────────────────

dev:
	docker compose up --build
	@echo ""
	@echo "brickhub running at http://localhost:3000"
	@echo "API docs at http://localhost:8000/docs"

build:
	docker compose build

down:
	docker compose down

logs:
	docker compose logs -f

db-upgrade:
	docker compose exec backend alembic upgrade head

db-reset:
	docker compose down -v
	@echo "Database wiped. Restarting..."
	docker compose up --build

reset: db-reset

# ── Native targets (no Docker required — uses SQLite) ────────────────────────
#
# Usage:
#   make dev-native      → first-run setup + start everything
#   make stop-native     → kill the background API server
#
# Requirements: python3.13 (brew install python@3.13), Node 18+ (already installed)

VENV := backend/.venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
ALEMBIC := $(VENV)/bin/alembic

$(VENV)/bin/activate:
	python3.13 -m venv $(VENV)
	$(PIP) install --upgrade pip --quiet
	$(PIP) install -r backend/requirements-native.txt --quiet
	@echo "[brickhub] Python venv ready."

dev-native: $(VENV)/bin/activate
	@echo "[brickhub] Running database migrations (SQLite)..."
	@cd backend && DATABASE_URL="sqlite:///./brickhub.db" $(shell pwd)/$(ALEMBIC) upgrade head
	@echo "[brickhub] Starting API server on :8000 (log: backend/uvicorn.log)..."
	@cd backend && DATABASE_URL="sqlite:///./brickhub.db" $(shell pwd)/$(UVICORN) app.main:app \
		--host 0.0.0.0 --port 8000 --reload \
		> uvicorn.log 2>&1 &
	@echo "[brickhub] Starting frontend on :3000..."
	@echo ""
	@echo "  API docs → http://localhost:8000/docs"
	@echo "  App      → http://localhost:3000"
	@echo ""
	@cd frontend && npm install --silent && npm run dev

reset-all:
	@sqlite3 backend/brickhub.db "DELETE FROM module_configs; DELETE FROM weekly_plans; DELETE FROM workout_logs; DELETE FROM meal_logs; DELETE FROM coach_messages;"
	@echo "[brickhub] Full reset — all training data cleared. Profile kept."

clear-plan:
	@test -n "$(m)" || (echo "Usage: make clear-plan m=running" && exit 1)
	@sqlite3 backend/brickhub.db "DELETE FROM weekly_plans WHERE module='$(m)';"
	@echo "[brickhub] Cleared cached plan for '$(m)'. Next visit will regenerate."

reset-module:
	@test -n "$(m)" || (echo "Usage: make reset-module m=running" && exit 1)
	@sqlite3 backend/brickhub.db "DELETE FROM module_configs WHERE module='$(m)'; DELETE FROM weekly_plans WHERE module='$(m)';"
	@echo "[brickhub] Reset '$(m)' onboarding and cached plan."

stop-native:
	@pkill -f "uvicorn app.main:app" 2>/dev/null && echo "[brickhub] API server stopped." || echo "[brickhub] API server was not running."
