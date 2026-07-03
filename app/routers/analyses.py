"""API routes. The /analyze endpoint runs the full four-stage pipeline:
extract (LLM) -> compute ratios (code) -> score (code) -> draft memo (LLM),
then persists the result for the audit trail."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..finance import compute_ratios, detect_flags, score_credit
from ..llm import LLMError, extract_financials, generate_memo

router = APIRouter(prefix="/api", tags=["analyses"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/analyze", response_model=schemas.AnalysisResult)
def analyze(req: schemas.AnalyzeRequest, db: Session = Depends(get_db)):
    text = (req.text or "").strip()
    if len(text) < 40:
        raise HTTPException(
            status_code=422,
            detail="Please provide a loan file with financial statements.",
        )

    # 1. LLM: document -> structured financials
    try:
        financials = extract_financials(text)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # 2 + 3. Code: ratios, flags, and the scored decision
    ratios = compute_ratios(financials)
    flags = detect_flags(financials, ratios)
    scoring = score_credit(ratios)

    # 4. LLM: the memo, grounded in the computed numbers
    try:
        memo = generate_memo(financials, ratios, flags, scoring)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    record = models.Analysis(
        company=financials.get("company") or "Unknown borrower",
        loan_request=financials.get("loanRequest"),
        decision=scoring["decision"],
        score=scoring["score"],
        financials=financials,
        ratios=ratios,
        flags=flags,
        factors=scoring["factors"],
        counterfactual=scoring["counterfactual"],
        memo=memo,
        source_text=text,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/analyses", response_model=list[schemas.AnalysisSummary])
def list_analyses(db: Session = Depends(get_db), limit: int = 25):
    return (
        db.query(models.Analysis)
        .order_by(desc(models.Analysis.created_at))
        .limit(limit)
        .all()
    )


@router.get("/analyses/{analysis_id}", response_model=schemas.AnalysisResult)
def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    record = db.get(models.Analysis, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return record
