"""Borrower + file endpoints — the identity layer above analyses.

Flow:
  POST /borrowers                 -> create the record
  POST /borrowers/{id}/files      -> upload one or more PDFs, stored in files.content
  POST /borrowers/{id}/analyze    -> body {file_ids: [...]}, feeds the LLM with the
                                     stored bytes, persists a new Analysis with the
                                     borrower_id FK set
  GET  /borrowers                 -> list + rollups (file/analysis count, latest verdict)
  GET  /borrowers/{id}            -> full detail (files + analyses history, newest-first)

History is accumulated, never required: a fresh borrower can go straight to
analyze on their first visit; returning borrowers stack subsequent analyses
under the same record."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import desc, func
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from .. import models, schemas
from ..database import get_db
from ..llm import LLMError, extract_financials_from_files
from .analyses import _run_downstream, validate_and_read_pdfs

router = APIRouter(prefix="/api", tags=["borrowers"])


def _summarize(
    borrower: models.Borrower,
    file_count: int,
    analysis_count: int,
    latest: models.Analysis | None,
) -> schemas.BorrowerSummary:
    return schemas.BorrowerSummary(
        id=borrower.id,
        name=borrower.name,
        sector=borrower.sector,
        created_at=borrower.created_at,
        file_count=file_count,
        analysis_count=analysis_count,
        latest_decision=latest.decision if latest else None,
        latest_score=latest.score if latest else None,
    )


@router.post("/borrowers", response_model=schemas.BorrowerSummary)
def create_borrower(
    payload: schemas.BorrowerCreate,
    db: Session = Depends(get_db),
):
    borrower = models.Borrower(
        name=payload.name,
        sector=payload.sector,
        notes=payload.notes,
    )
    db.add(borrower)
    db.commit()
    db.refresh(borrower)
    # A newly-created borrower has no files and no analyses — rollups are zero.
    return _summarize(borrower, file_count=0, analysis_count=0, latest=None)


@router.get("/borrowers", response_model=list[schemas.BorrowerSummary])
def list_borrowers(db: Session = Depends(get_db), limit: int = 50):
    """List borrowers with rollup counts + latest verdict. Two subqueries for
    the counts, one per-borrower lookup for the latest analysis — good enough
    for demo/dev volumes; we can move to a single windowed query when this
    starts to matter."""
    files_sub = (
        db.query(models.File.borrower_id, func.count().label("n"))
        .group_by(models.File.borrower_id)
        .subquery()
    )
    analyses_sub = (
        db.query(models.Analysis.borrower_id, func.count().label("n"))
        .filter(models.Analysis.borrower_id.isnot(None))
        .group_by(models.Analysis.borrower_id)
        .subquery()
    )

    rows = (
        db.query(
            models.Borrower,
            func.coalesce(files_sub.c.n, 0),
            func.coalesce(analyses_sub.c.n, 0),
        )
        .outerjoin(files_sub, files_sub.c.borrower_id == models.Borrower.id)
        .outerjoin(analyses_sub, analyses_sub.c.borrower_id == models.Borrower.id)
        .order_by(desc(models.Borrower.created_at))
        .limit(limit)
        .all()
    )

    summaries: list[schemas.BorrowerSummary] = []
    for borrower, fcount, acount in rows:
        latest = (
            db.query(models.Analysis)
            .filter(models.Analysis.borrower_id == borrower.id)
            .order_by(desc(models.Analysis.created_at))
            .first()
        )
        summaries.append(_summarize(borrower, int(fcount), int(acount), latest))
    return summaries


@router.get("/borrowers/{borrower_id}", response_model=schemas.BorrowerDetail)
def get_borrower(borrower_id: str, db: Session = Depends(get_db)):
    borrower = db.get(models.Borrower, borrower_id)
    if borrower is None:
        raise HTTPException(status_code=404, detail="Borrower not found.")
    return schemas.BorrowerDetail(
        id=borrower.id,
        name=borrower.name,
        sector=borrower.sector,
        notes=borrower.notes,
        created_at=borrower.created_at,
        files=[schemas.FileSummary.model_validate(f) for f in borrower.files],
        analyses=[schemas.AnalysisSummary.model_validate(a) for a in borrower.analyses],
    )


@router.post(
    "/borrowers/{borrower_id}/files",
    response_model=list[schemas.FileSummary],
)
async def upload_borrower_files(
    borrower_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    # Explicit 404 BEFORE validation: with no borrower check, a missing id
    # would surface as "no matching files" from validate_and_read_pdfs — right
    # status code, wrong problem, and the caller would waste time debugging
    # their file payload.
    borrower = db.get(models.Borrower, borrower_id)
    if borrower is None:
        raise HTTPException(status_code=404, detail="Borrower not found.")

    form = await request.form()
    raw_files = [v for v in form.getlist("files") if isinstance(v, UploadFile)]
    validated = await validate_and_read_pdfs(raw_files)

    stored: list[models.File] = []
    for name, data, pages in validated:
        row = models.File(
            borrower_id=borrower.id,
            filename=name,
            content=data,
            page_count=pages,
            size_bytes=len(data),
        )
        db.add(row)
        stored.append(row)

    db.commit()
    for row in stored:
        db.refresh(row)
    return [schemas.FileSummary.model_validate(row) for row in stored]


@router.post(
    "/borrowers/{borrower_id}/analyze",
    response_model=schemas.AnalysisResult,
)
def analyze_borrower(
    borrower_id: str,
    payload: schemas.BorrowerAnalyzeRequest,
    db: Session = Depends(get_db),
):
    # Same rule as the files endpoint: borrower existence is a distinct
    # failure mode from file_id ownership, and gets its own 404.
    borrower = db.get(models.Borrower, borrower_id)
    if borrower is None:
        raise HTTPException(status_code=404, detail="Borrower not found.")

    if not payload.file_ids:
        raise HTTPException(
            status_code=422,
            detail="file_ids must include at least one file id.",
        )

    rows = (
        db.query(models.File)
        .filter(
            models.File.id.in_(payload.file_ids),
            models.File.borrower_id == borrower.id,
        )
        .all()
    )
    found = {r.id for r in rows}
    missing = [fid for fid in payload.file_ids if fid not in found]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"file_ids not found on this borrower: {', '.join(missing)}",
        )

    # Preserve the caller's ordering so the extraction prompt lists filenames
    # in the order the officer specified — matches the ↑↓ intuition of "read
    # the application first, then the statements, then the tax return."
    by_id = {r.id: r for r in rows}
    files = [(by_id[fid].filename, by_id[fid].content) for fid in payload.file_ids]

    try:
        financials = extract_financials_from_files(files, text_supplement=None)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    marker = "[borrower files] " + ", ".join(name for name, _ in files)
    return _run_downstream(
        financials,
        source_text=marker,
        db=db,
        borrower_id=borrower.id,
    )
