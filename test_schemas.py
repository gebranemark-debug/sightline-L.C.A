"""Unit test — proves the tightened schemas validate cleanly against what the
finance engine actually produces, and reject shapes the contract forbids.

Runs without a DB, without an API key, without a running server. It's a pure
contract test: finance.py output -> Pydantic schemas -> serialized JSON.
"""
import uuid
from datetime import datetime, timezone

from pydantic import ValidationError

from app.finance import compute_ratios, detect_flags, score_credit
from app.schemas import AnalysisResult, Decision, Factor, Flag, Ratios

# The Cascade sample — a DECLINE case that exercises negative OCF, thin
# leverage headroom, receivables outrunning revenue, and a net loss. It's the
# richest test fixture because every schema field is non-trivial.
CASCADE = dict(company="Cascade Home Retail", loanRequest=300000,
    revenueCurrent=5800000, revenuePrior=4900000, cogsCurrent=4640000,
    ebitdaCurrent=180000, ebitdaPrior=258000, netIncomeCurrent=-80000,
    interestExpenseCurrent=165000, cash=90000,
    accountsReceivableCurrent=1340000, accountsReceivablePrior=720000,
    inventory=1180000, currentAssets=2610000, currentLiabilities=2740000,
    accountsPayable=1520000, totalDebt=1350000, totalEquity=420000,
    debtService=360000, operatingCashFlow=-120000)


def _build_result_dict() -> dict:
    """Build an AnalysisResult-shaped dict from the raw finance engine output —
    exactly what routers/analyses.py hands to Pydantic via from_attributes."""
    ratios = compute_ratios(CASCADE)
    flags = detect_flags(CASCADE, ratios)
    scoring = score_credit(ratios)
    return dict(
        id=uuid.uuid4().hex,
        created_at=datetime.now(timezone.utc),
        company=CASCADE["company"],
        loan_request=CASCADE["loanRequest"],
        decision=scoring["decision"],
        score=scoring["score"],
        financials=CASCADE,
        ratios=ratios,
        flags=flags,
        factors=scoring["factors"],
        counterfactual=scoring["counterfactual"],
        memo="**Recommendation:** DECLINE (stubbed memo for schema test).",
    )


print("=== Schema validation on the Cascade sample ===")
raw = _build_result_dict()
result = AnalysisResult.model_validate(raw)

# Envelope
assert result.decision == "DECLINE", result.decision
assert result.company == "Cascade Home Retail"
assert 0 <= result.score <= 100

# Ratios — was `dict[str, Any]`, now a typed model
assert isinstance(result.ratios, Ratios)
assert result.ratios.dscr is not None and result.ratios.dscr < 1.0, \
    "Cascade DSCR should be sub-1.0x"
assert result.ratios.ocf is not None and result.ratios.ocf < 0, \
    "Cascade OCF should be negative"

# Flags — was `list[dict[str, Any]]`, now list[Flag]
assert result.flags and all(isinstance(f, Flag) for f in result.flags)
assert all(f.sev in ("high", "med") for f in result.flags)

# Factors — was `list[dict[str, Any]]`, now list[Factor]
assert result.factors and all(isinstance(f, Factor) for f in result.factors)
assert all(isinstance(f.points, int) for f in result.factors)

# Counterfactual should surface Cascade's biggest drag
assert result.counterfactual and "would add" in result.counterfactual

# JSON round-trip: what actually goes over the wire
serialized = result.model_dump(mode="json")
assert isinstance(serialized["decision"], str)
assert isinstance(serialized["ratios"], dict)
assert isinstance(serialized["flags"], list)

print(f"  decision={result.decision} score={result.score} "
      f"flags={len(result.flags)} factors={len(result.factors)}  [OK]")


print("\n=== The schemas actively reject invalid shapes ===")
# Decision literal excludes anything outside APPROVE/REVIEW/DECLINE
try:
    AnalysisResult.model_validate({**raw, "decision": "MAYBE"})
    raise AssertionError("Decision literal should reject 'MAYBE'")
except ValidationError:
    print("  decision='MAYBE' rejected                             [OK]")

# Flag severity literal excludes anything outside high/med
try:
    bad = dict(raw, flags=[{"sev": "low", "text": "not a real severity"}])
    AnalysisResult.model_validate(bad)
    raise AssertionError("FlagSeverity should reject 'low'")
except ValidationError:
    print("  flag sev='low' rejected                               [OK]")

# Factor.points must be int, not string
try:
    bad = dict(raw, factors=[{"key": "x", "label": "x", "value": "x", "points": "seven"}])
    AnalysisResult.model_validate(bad)
    raise AssertionError("Factor.points should reject non-int")
except ValidationError:
    print("  factor points='seven' rejected                        [OK]")

print("\nALL SCHEMA CHECKS PASSED ✅")
