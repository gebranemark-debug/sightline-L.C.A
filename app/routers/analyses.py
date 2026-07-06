"""API routes. The /analyze endpoint runs the full four-stage pipeline:
extract (LLM) -> compute ratios (code) -> score (code) -> draft memo (LLM),
then persists the result for the audit trail.

Two client-facing paths on the same URL, dispatched by content-type inside
the handler:
  application/json          -> {"text": "..."}     (pre-existing text flow)
  multipart/form-data       -> files[] + text?     (new PDF-upload flow)

The JSON+text branch is deliberately kept byte-identical to the previous
implementation so the deployed Vercel frontend continues to work during the
backend-first deploy window."""
from io import BytesIO
from json import JSONDecodeError

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy import desc
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from .. import models, schemas
from ..database import get_db
from ..finance import compute_ratios, detect_flags, score_credit
from ..llm import (
    LLMError,
    extract_financials,
    extract_financials_from_files,
    generate_memo,
)

router = APIRouter(prefix="/api", tags=["analyses"])

# Upload limits (see PR description for reasoning).
MAX_FILES = 10
MAX_PAGES_PER_FILE = 100
MAX_BYTES_PER_FILE = 10 * 1024 * 1024        # 10 MB
MAX_BYTES_TOTAL = 30 * 1024 * 1024           # 30 MB


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/analyze", response_model=schemas.AnalysisResult)
async def analyze(request: Request, db: Session = Depends(get_db)):
    ctype = (request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
    if ctype == "multipart/form-data":
        return await _analyze_files(request, db)
    return await _analyze_text(request, db)


# ------------------------------- JSON+text path -------------------------------
async def _analyze_text(request: Request, db: Session) -> models.Analysis:
    """Preserved byte-identical to the pre-step-7 handler: same request shape,
    same validation errors, same pipeline order, same persisted record."""
    try:
        payload = await request.json()
    except JSONDecodeError:
        raise HTTPException(status_code=422, detail="Invalid JSON body.")
    try:
        req = schemas.AnalyzeRequest.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    text = (req.text or "").strip()
    if len(text) < 40:
        raise HTTPException(
            status_code=422,
            detail="Please provide a loan file with financial statements.",
        )

    try:
        financials = extract_financials(text)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return _run_downstream(financials, source_text=text, db=db)


# --------------------------------- PDF path -----------------------------------
async def _analyze_files(request: Request, db: Session) -> models.Analysis:
    """Multi-file PDF pipeline. Validates every file (PDF magic, size, page
    count), then hands the whole batch to the LLM as one logical loan file.
    Hard-fails the entire request if any file is invalid — a partial analysis
    is worse than a clean failure, per multi-file coherence."""
    form = await request.form()
    raw_files = [v for v in form.getlist("files") if isinstance(v, UploadFile)]
    text_supplement_raw = form.get("text")
    text_supplement = None
    if isinstance(text_supplement_raw, str):
        stripped = text_supplement_raw.strip()
        if stripped:
            text_supplement = stripped

    if not raw_files:
        raise HTTPException(status_code=422, detail="Upload at least one PDF file.")
    if len(raw_files) > MAX_FILES:
        raise HTTPException(
            status_code=422,
            detail=f"Too many files — the maximum is {MAX_FILES}.",
        )

    files: list[tuple[str, bytes]] = []
    total_bytes = 0
    for uf in raw_files:
        name = uf.filename or "uploaded.pdf"

        if (uf.content_type or "").lower() != "application/pdf":
            raise HTTPException(
                status_code=415,
                detail=f"{name}: only PDF uploads are supported.",
            )

        data = await uf.read()
        if not data.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=415,
                detail=f"{name}: file does not look like a valid PDF.",
            )

        size = len(data)
        if size > MAX_BYTES_PER_FILE:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"{name}: {size / 1_048_576:.1f} MB exceeds the "
                    f"{MAX_BYTES_PER_FILE // 1_048_576} MB per-file limit."
                ),
            )
        total_bytes += size
        if total_bytes > MAX_BYTES_TOTAL:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Total upload exceeds the "
                    f"{MAX_BYTES_TOTAL // 1_048_576} MB request limit."
                ),
            )

        # Page count — Anthropic caps PDF documents at 100 pages, so we fail
        # fast with a clear message rather than burning an LLM call.
        try:
            pages = len(PdfReader(BytesIO(data)).pages)
        except PdfReadError as e:
            raise HTTPException(
                status_code=422,
                detail=f"{name}: could not read PDF ({e}).",
            )
        if pages > MAX_PAGES_PER_FILE:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{name}: {pages} pages exceeds the "
                    f"{MAX_PAGES_PER_FILE}-page-per-file limit."
                ),
            )

        files.append((name, data))

    try:
        financials = extract_financials_from_files(files, text_supplement=text_supplement)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    marker = "[uploaded files] " + ", ".join(name for name, _ in files)
    if text_supplement:
        marker += " (+ pasted-notes)"
    return _run_downstream(financials, source_text=marker, db=db)


# ---------------------- shared downstream (code + memo) -----------------------
def _run_downstream(
    financials: dict, *, source_text: str, db: Session
) -> models.Analysis:
    """Everything from `compute_ratios` onwards — identical for both paths."""
    ratios = compute_ratios(financials)
    flags = detect_flags(financials, ratios)
    scoring = score_credit(ratios)

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
        source_text=source_text,
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
