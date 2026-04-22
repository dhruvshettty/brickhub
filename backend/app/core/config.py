from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    anthropic_api_key: str
    secret_key: str = "dev-secret-not-for-production"

    suunto_client_id: str = ""
    suunto_client_secret: str = ""
    suunto_redirect_uri: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
