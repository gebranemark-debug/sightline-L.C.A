"""Request/response schemas. These define the API contract the frontend codes
against, and keep the ORM models decoupled from what we expose."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AnalyzeRequest(BaseModel):
    text: str


class AnalysisResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    company: str
    loan_request: Optional[float] = None
    decision: str
    score: int
    financials: dict[str, Any]
    ratios: dict[str, Any]
    flags: list[dict[str, Any]]
    factors: list[dict[str, Any]]
    counterfactual: Optional[str] = None
    memo: str


class AnalysisSummary(BaseModel):
    """Lightweight row for the history list."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    company: str
    decision: str
    score: int
