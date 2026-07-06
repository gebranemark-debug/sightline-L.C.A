"""SQLAlchemy engine + session. Works with SQLite (local) and Postgres (deploy)
with no code change — only the DATABASE_URL differs."""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

_url = settings.normalized_db_url
_connect_args = {"check_same_thread": False} if _url.startswith("sqlite") else {}

engine = create_engine(_url, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    """FastAPI dependency: one DB session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_analyses_borrower_id_column() -> None:
    """Idempotent ALTER to add analyses.borrower_id on existing databases.

    Tables are created with `Base.metadata.create_all(engine)` at startup, which
    creates missing tables but does not add missing columns to existing ones —
    so the deployed Railway `analyses` table needs an explicit ALTER to grow
    the nullable FK. Called once from main.py after create_all; idempotent so
    subsequent boots are no-ops. Dialect-aware because SQLite does not accept
    `ADD COLUMN IF NOT EXISTS` while Postgres does.
    """
    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "sqlite":
            # SQLite: no IF NOT EXISTS on ALTER — check PRAGMA first.
            existing = {row[1] for row in conn.execute(
                text("PRAGMA table_info(analyses)")
            ).fetchall()}
            if "borrower_id" not in existing:
                conn.execute(text(
                    "ALTER TABLE analyses ADD COLUMN borrower_id VARCHAR"
                ))
        else:
            # Postgres (and anything else supporting the syntax).
            conn.execute(text(
                "ALTER TABLE analyses ADD COLUMN IF NOT EXISTS borrower_id VARCHAR"
            ))


def ensure_analyses_oversight_columns() -> None:
    """Idempotent ALTER to add the three human-oversight columns on existing
    databases: officer_action, officer_note, officer_action_at.

    Same dialect-aware pattern as ensure_analyses_borrower_id_column. Runs
    after create_all() so new deployments already have the columns; existing
    Railway rows keep the fields NULL, which the UI renders as "Awaiting
    review"."""
    columns = [
        ("officer_action", "VARCHAR"),
        ("officer_note", "TEXT"),
        ("officer_action_at", "TIMESTAMP"),
    ]
    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "sqlite":
            existing = {row[1] for row in conn.execute(
                text("PRAGMA table_info(analyses)")
            ).fetchall()}
            for name, sql_type in columns:
                if name not in existing:
                    conn.execute(text(
                        f"ALTER TABLE analyses ADD COLUMN {name} {sql_type}"
                    ))
        else:
            for name, sql_type in columns:
                conn.execute(text(
                    f"ALTER TABLE analyses ADD COLUMN IF NOT EXISTS {name} {sql_type}"
                ))
