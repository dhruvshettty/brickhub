from pathlib import Path

from pydantic_settings import BaseSettings


def _find_env_file() -> str:
    """Walk up from cwd to find the nearest .env file."""
    here = Path.cwd()
    for directory in [here, here.parent, here.parent.parent]:
        candidate = directory / ".env"
        if candidate.exists():
            return str(candidate)
    return ".env"


class Settings(BaseSettings):
    database_url: str = "sqlite:///./brickhub.db"
    anthropic_api_key: str = "sk-ant-..."
    secret_key: str = "dev-secret-not-for-production"

    suunto_client_id: str = ""
    suunto_client_secret: str = ""
    suunto_redirect_uri: str = ""

    class Config:
        env_file = _find_env_file()
        extra = "ignore"


settings = Settings()
