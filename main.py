"""FastAPI entrypoint. Creates tables on boot (fine for a small deploy — swap to
Alembic migrations when the schema starts changing), wires CORS for the Vercel
frontend, and mounts the API router."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from . import models  # noqa: F401 - ensure models are registered before create_all
from .routers import analyses

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sightline — SME Credit Copilot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyses.router)


@app.get("/")
def root():
    return {"name": "Sightline API", "docs": "/docs", "health": "/api/health"}
