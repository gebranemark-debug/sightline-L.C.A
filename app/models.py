"""ORM models.

Persisting every decision is both a product feature (officers review past
files) and an EU AI Act requirement (audit trail). The borrower model layers
identity on top of that: a returning borrower's analyses stack under a single
record, uploaded files persist between visits, and rollup counts (files,
analyses, latest decision) surface on the borrower list without needing a
denormalized cache.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


def _uuid_hex() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Borrower(Base):
    __tablename__ = "borrowers"

    id = Column(String, primary_key=True, default=_uuid_hex)
    created_at = Column(DateTime, default=_utcnow, nullable=False)

    name = Column(String, nullable=False)
    sector = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    files = relationship(
        "File",
        back_populates="borrower",
        order_by="File.uploaded_at.desc()",
        # TODO: decide ondelete when delete flow lands (likely CASCADE — files
        # only exist in the context of their borrower).
    )
    analyses = relationship(
        "Analysis",
        back_populates="borrower",
        order_by="Analysis.created_at.desc()",
        # TODO: decide ondelete when delete flow lands (likely SET NULL —
        # analyses are the audit trail and outlive the borrower record).
    )


class File(Base):
    __tablename__ = "files"

    id = Column(String, primary_key=True, default=_uuid_hex)
    borrower_id = Column(
        String,
        ForeignKey("borrowers.id"),
        # TODO: decide ondelete when delete flow lands.
        nullable=False,
        index=True,
    )
    uploaded_at = Column(DateTime, default=_utcnow, nullable=False)

    filename = Column(String, nullable=False)
    content = Column(LargeBinary, nullable=False)   # raw PDF bytes → Postgres bytea
    page_count = Column(Integer, nullable=False)
    size_bytes = Column(Integer, nullable=False)

    borrower = relationship("Borrower", back_populates="files")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String, primary_key=True, default=_uuid_hex)
    created_at = Column(DateTime, default=_utcnow)

    # Nullable FK — existing rows predate the borrower feature and stay NULL.
    # TODO: decide ondelete when delete flow lands (likely SET NULL — audit
    # trail should outlive borrower deletion).
    borrower_id = Column(
        String,
        ForeignKey("borrowers.id"),
        nullable=True,
        index=True,
    )

    company = Column(String, nullable=False)
    loan_request = Column(Float, nullable=True)
    decision = Column(String, nullable=False)   # APPROVE | REVIEW | DECLINE
    score = Column(Integer, nullable=False)      # 0..100

    # The extracted + computed artefacts, stored as JSON for full auditability.
    financials = Column(JSON, nullable=False)    # what the LLM pulled from the file
    ratios = Column(JSON, nullable=False)        # what the code computed
    flags = Column(JSON, nullable=False)         # rule-based red flags
    factors = Column(JSON, nullable=False)       # scorecard contributions (the "why")
    counterfactual = Column(Text, nullable=True)

    memo = Column(Text, nullable=False)          # LLM-drafted memo
    source_text = Column(Text, nullable=False)   # the raw input, kept for the record

    # Human oversight (EU AI Act Article 14). The scorecard's decision + score
    # stay untouched — these are metadata layered on top: whether the officer
    # agreed with the model ("CONFIRMED") or disagreed and routed to
    # committee ("OVERRIDDEN"), and the reason on override.
    # All nullable so existing rows (pre-feature) stay valid with these
    # fields as None; the UI renders that as "Awaiting review".
    # TODO: When we add auth, capture officer identity here (currently
    # anonymous). Post-demo we'd also swap this single-shot record for an
    # append-only oversight_events table so the full review history is
    # queryable, not just the last action.
    officer_action = Column(String, nullable=True)   # CONFIRMED | OVERRIDDEN
    officer_note = Column(Text, nullable=True)       # required for OVERRIDDEN
    officer_action_at = Column(DateTime, nullable=True)

    borrower = relationship("Borrower", back_populates="analyses")
