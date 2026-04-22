.PHONY: dev build down logs db-upgrade db-reset reset

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
