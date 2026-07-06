"""Request/response schemas. These define the API contract the frontend codes
against, and keep the ORM models decoupled from what we expose.

The nested shapes (Ratios, Flag, Factor, Decision) reflect what finance.py
actually produces — declaring them here means the OpenAPI spec exposes the
exact structure, so the generated TS types on the frontend are drift-checkable
instead of `Record<string, unknown>`. This is also the audit-trail contract:
every field a credit officer sees came from a named, typed source."""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict


Decision = Literal["APPROVE", "REVIEW", "DECLINE"]
FlagSeverity = Literal["high", "med"]


class Ratios(BaseModel):
    """The credit ratios computed by finance.compute_ratios. All optional
    because inputs can be missing; the frontend renders '—' for None."""
    model_config = ConfigDict(extra="ignore")

    dscr: Optional[float] = None
    debtToEbitda: Optional[float] = None
    debtToEquity: Optional[float] = None
    currentRatio: Optional[float] = None
    quickRatio: Optional[float] = None
    netMargin: Optional[float] = None
    revenueGrowth: Optional[float] = None
    receivablesGrowth: Optional[float] = None
    dso: Optional[float] = None
    dio: Optional[float] = None
    dpo: Optional[float] = None
    ccc: Optional[float] = None
    ocf: Optional[float] = None
    # Loan-to-value: totalDebt / collateralValue. None for unsecured
    # facilities (no collateral extracted) — the frontend renders "—".
    ltv: Optional[float] = None


class Flag(BaseModel):
    """A rule-based red flag from finance.detect_flags."""
    sev: FlagSeverity
    text: str


class Factor(BaseModel):
    """One contribution to the scorecard from finance.score_credit. `points`
    can be negative (drag) or positive (boost) — this is the explainability
    story: the sum of factor points plus baseline 50 = score."""
    key: str
    label: str
    value: str
    points: int


class AnalyzeRequest(BaseModel):
    text: str


class AnalysisResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    company: str
    loan_request: Optional[float] = None
    decision: Decision
    score: int
    # Raw extractor output — kept opaque intentionally (mix of company string
    # and numerics). Tightening this would double the LLM-prompt schema here,
    # and the UI treats it as an audit blob rather than rendered content.
    financials: dict[str, Any]
    ratios: Ratios
    flags: list[Flag]
    factors: list[Factor]
    counterfactual: Optional[str] = None
    memo: str


class AnalysisSummary(BaseModel):
    """Lightweight row for the history list."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    company: str
    decision: Decision
    score: int


# --------------------------- borrower + file shapes ---------------------------
# Borrower is the identity layer above analyses: a returning client's analyses
# stack under one record, uploaded PDFs persist between visits, and history
# accumulates rather than being required up front.

class BorrowerCreate(BaseModel):
    """POST /api/borrowers body."""
    name: str
    sector: Optional[str] = None
    notes: Optional[str] = None


class FileSummary(BaseModel):
    """Lightweight file metadata — never carries the raw bytes."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    page_count: int
    size_bytes: int
    uploaded_at: datetime


class BorrowerSummary(BaseModel):
    """Row on the borrower list. Rollups let the UI render 'N files · N
    analyses · latest DECLINE 42/100' without needing a second fetch."""
    id: str
    name: str
    sector: Optional[str] = None
    created_at: datetime
    file_count: int
    analysis_count: int
    latest_decision: Optional[Decision] = None
    latest_score: Optional[int] = None


class BorrowerDetail(BaseModel):
    """Full borrower page: everything the UI needs to render the profile,
    the uploaded files list, and the history of analyses."""
    id: str
    name: str
    sector: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    files: list[FileSummary]
    analyses: list[AnalysisSummary]


class BorrowerAnalyzeRequest(BaseModel):
    """POST /api/borrowers/{id}/analyze body: which stored files to feed into
    the pipeline. All file_ids must belong to this borrower."""
    file_ids: list[str]
