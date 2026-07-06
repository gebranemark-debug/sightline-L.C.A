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
    debtService=360000, operatingCashFlow=-120000,
    # Cascade is an unsecured revolver with no concentration mentioned — both
    # new fields extract as None. Exercises the null path of ltv / concentration.
    topCustomerShare=None, collateralValue=None)


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

# The two new factors are ALWAYS present in the factors list, even when their
# underlying data is missing (points = 0 in that case). This keeps the
# frontend rendering stable across analyses regardless of what the LLM pulled.
factor_keys = {f.key for f in result.factors}
assert "concentration" in factor_keys, "concentration factor should always be present"
assert "ltv" in factor_keys, "ltv factor should always be present"

# Cascade has no collateral extracted, so LTV is None on Ratios and the LTV
# factor scores 0. Concentration is also None (not mentioned in file) → 0.
assert result.ratios.ltv is None, "Cascade has no collateral so LTV should be null"
ltv_factor = next(f for f in result.factors if f.key == "ltv")
conc_factor = next(f for f in result.factors if f.key == "concentration")
assert ltv_factor.points == 0 and conc_factor.points == 0, (
    f"missing-data factors should be neutral, got ltv={ltv_factor.points} "
    f"concentration={conc_factor.points}"
)

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

print("\n=== The new factors bite when the underlying data is present ===")
# Same fixture, now WITH collateral 1.6M (LTV = 1.35M / 1.6M ≈ 0.84 → 70-90%
# band → 0 pts) and top-customer share 0.40 (30-50% band → -8 pts).
secured = dict(CASCADE, collateralValue=1_600_000, topCustomerShare=0.40)
r2 = compute_ratios(secured)
assert r2["ltv"] is not None
assert abs(r2["ltv"] - (1_350_000 / 1_600_000)) < 1e-6, r2["ltv"]
print(f"  LTV computed as totalDebt/collateralValue: {r2['ltv']:.4f}     [OK]")

scoring2 = score_credit(r2)
conc2 = next(f for f in scoring2["factors"] if f["key"] == "concentration")
ltv2 = next(f for f in scoring2["factors"] if f["key"] == "ltv")
assert conc2["points"] == -8, f"expected -8 for 40% concentration, got {conc2['points']}"
assert ltv2["points"] == 0, f"expected 0 for 84% LTV, got {ltv2['points']}"
print(f"  concentration@0.40 → {conc2['points']} pts (30-50% band)         [OK]")
print(f"  LTV@0.84 → {ltv2['points']} pts (70-90% band)                    [OK]")

# And the tightening extremes: >50% concentration → -15; >100% LTV → -15 + flag.
distressed = dict(CASCADE, collateralValue=1_000_000, topCustomerShare=0.65)
r3 = compute_ratios(distressed)
scoring3 = score_credit(r3)
flags3 = detect_flags(distressed, r3)
conc3 = next(f for f in scoring3["factors"] if f["key"] == "concentration")
ltv3 = next(f for f in scoring3["factors"] if f["key"] == "ltv")
assert conc3["points"] == -15 and ltv3["points"] == -15
assert any(f["sev"] == "high" and "LTV" in f["text"] for f in flags3), \
    "LTV > 100% should raise a high-severity flag"
assert any("concentration risk" in f["text"] and f["sev"] == "high" for f in flags3), \
    "concentration > 50% should raise a high-severity flag"
print("  concentration@0.65 + LTV@1.35 → both -15 + high-sev flags       [OK]")

print("\nALL SCHEMA CHECKS PASSED ✅")
