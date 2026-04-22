import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1 import settings as settings_router
from app.api.v1 import running, coach, dashboard

# Startup check — fail fast with actionable message if API key is missing
if not settings.anthropic_api_key or settings.anthropic_api_key.startswith("sk-ant-..."):
    print(
        "\n[brickhub] ERROR: ANTHROPIC_API_KEY is not set.\n"
        "  1. Open your .env file\n"
        "  2. Add: ANTHROPIC_API_KEY=sk-ant-your-key-here\n"
        "  3. Get a key at console.anthropic.com\n"
        "  4. Run: make dev\n",
        file=sys.stderr,
    )

app = FastAPI(
    title="brickhub",
    description="Personal triathlon training dashboard API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(running.router, prefix="/api/v1")
app.include_router(coach.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok", "service": "brickhub"}
