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

    # ---- Model routing per input type ----
    # ANTHROPIC_MODEL_TEXT drives the JSON+text pipeline; ANTHROPIC_MODEL_PDF
    # drives the multipart PDF-upload pipeline. Split because PDF page tokens
    # run ~30x higher per analysis than plain text, and Sonnet 4.5 handles the
    # structured-extraction load cleanly at that scale — both stay configurable
    # so we can flip either side if quality drops.
    #
    # anthropic_model (unprefixed) is the legacy variable — kept as a fallback
    # for the text flow so existing Railway deployments with ANTHROPIC_MODEL
    # set keep working without a service-vars edit.
    anthropic_model: str = "claude-opus-4-7"
    anthropic_model_text: str | None = None
    anthropic_model_pdf: str = "claude-sonnet-4-5-20250929"

    # Comma-separated list of allowed frontend origins.
    cors_origins: str = "http://localhost:5173"
    app_env: str = "development"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def text_model(self) -> str:
        """Model for the JSON+text /api/analyze pipeline. Prefers the explicit
        ANTHROPIC_MODEL_TEXT if set, else the legacy ANTHROPIC_MODEL."""
        return self.anthropic_model_text or self.anthropic_model

    @property
    def pdf_model(self) -> str:
        return self.anthropic_model_pdf

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
