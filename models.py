"""The Analysis record. Persisting every decision is both a product feature
(officers review past files) and an EU AI Act requirement (audit trail)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Float, Integer, String, Text

from .database import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

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
