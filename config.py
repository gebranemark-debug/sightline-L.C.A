"""Application configuration, loaded from environment variables.

On Railway you set DATABASE_URL, ANTHROPIC_API_KEY, and CORS_ORIGINS in the
service variables. Locally, a .env file (see .env.example) is picked up.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Postgres on Railway; falls back to a local SQLite file for first run.
    database_url: str = "sqlite:///./sightline.db"

    # Server-side key — the frontend never sees this.
    anthropic_api_key: str = ""
    # Configurable so you can trade cost/quality without touching code.
    anthropic_model: str = "claude-sonnet-5"

    # Comma-separated list of allowed frontend origins.
    cors_origins: str = "http://localhost:5173"
    app_env: str = "development"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def normalized_db_url(self) -> str:
        """Railway/Heroku hand out postgres:// URLs; SQLAlchemy + psycopg v3
        wants postgresql+psycopg://. Normalise so either form works."""
        url = self.database_url
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg://", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


settings = Settings()
