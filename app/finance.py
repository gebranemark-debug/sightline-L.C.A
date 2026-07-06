"""Deterministic finance engine.

This module is the whole reason the product is trustworthy and auditable: the
LLM never does arithmetic and never makes the lending call. It hands us clean
numbers; everything below is plain, testable Python that a credit officer (or a
regulator) can read line by line.

Three stages:
  compute_ratios  -> the standard credit ratios
  detect_flags    -> rule-based red flags
  score_credit    -> a transparent points scorecard + the decision + a
                     counterfactual ("what would change the outcome")
"""
from typing import Any, Optional

# ---------------------------------- types -------------------------------------

Number = Optional[float]


# ----------------------------- formatting helpers -----------------------------
def fmt_x(n: Number) -> str:
    return "—" if n is None else f"{n:.2f}\u00d7"


def fmt_pct(n: Number) -> str:
    return "—" if n is None else f"{n * 100:.1f}%"


def fmt_days(n: Number) -> str:
    return "—" if n is None else f"{round(n)}d"


def fmt_eur(n: Number) -> str:
    return "—" if n is None else "\u20ac" + f"{round(n):,}"


def _div(a: Number, b: Number) -> Number:
    """Safe division: returns None instead of raising on missing/zero inputs."""
    if a is None or b in (None, 0):
        return None
    return a / b


def _growth(cur: Number, prior: Number) -> Number:
    if cur is None or prior in (None, 0):
        return None
    return (cur - prior) / prior


# --------------------------------- ratios ------------------------------------
def compute_ratios(f: dict[str, Any]) -> dict[str, Any]:
    g = f.get
    dso = _div(g("accountsReceivableCurrent"), g("revenueCurrent"))
    dio = _div(g("inventory"), g("cogsCurrent"))
    dpo = _div(g("accountsPayable"), g("cogsCurrent"))
    dso = None if dso is None else dso * 365
    dio = None if dio is None else dio * 365
    dpo = None if dpo is None else dpo * 365
    ccc = None if None in (dso, dio, dpo) else dso + dio - dpo

    return {
        "dscr": _div(g("ebitdaCurrent"), g("debtService")),
        "debtToEbitda": _div(g("totalDebt"), g("ebitdaCurrent")),
        "debtToEquity": _div(g("totalDebt"), g("totalEquity")),
        "currentRatio": _div(g("currentAssets"), g("currentLiabilities")),
        "quickRatio": _div(
            (None if g("currentAssets") is None or g("inventory") is None
             else g("currentAssets") - g("inventory")),
            g("currentLiabilities"),
        ),
        "netMargin": _div(g("netIncomeCurrent"), g("revenueCurrent")),
        "revenueGrowth": _growth(g("revenueCurrent"), g("revenuePrior")),
        "receivablesGrowth": _growth(
            g("accountsReceivableCurrent"), g("accountsReceivablePrior")
        ),
        "dso": dso, "dio": dio, "dpo": dpo, "ccc": ccc,
        "ocf": g("operatingCashFlow"),
        # Loan-to-value against the whole book, not just this facility —
        # matches how debtToEbitda / debtToEquity are scoped, and captures
        # aggregate leverage against pledged collateral.
        "ltv": _div(g("totalDebt"), g("collateralValue")),
        # topCustomerShare is a raw extract, not a computed ratio, but we
        # carry it through the ratios dict for score_credit (same pattern as
        # ocf). Ratios schema has extra="ignore" so it's dropped on
        # serialization and stays only in the opaque `financials` blob.
        "topCustomerShare": g("topCustomerShare"),
    }


# --------------------------------- red flags ---------------------------------
def detect_flags(f: dict[str, Any], r: dict[str, Any]) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []

    def add(sev: str, text: str) -> None:
        flags.append({"sev": sev, "text": text})

    dscr = r["dscr"]
    if dscr is not None:
        if dscr < 1.0:
            add("high", f"DSCR of {fmt_x(dscr)} — cash flow does not cover debt service")
        elif dscr < 1.25:
            add("med", f"DSCR of {fmt_x(dscr)} sits below the 1.25\u00d7 comfort threshold")

    if r["ocf"] is not None and r["ocf"] < 0:
        add("high", "Operating cash flow is negative")

    ni = f.get("netIncomeCurrent")
    if ni is not None and ni < 0:
        add("high", "Net loss for the year")

    lev = r["debtToEbitda"]
    if lev is not None:
        if lev >= 5:
            add("high", f"Leverage of {fmt_x(lev)} Debt/EBITDA is very high")
        elif lev >= 4:
            add("med", f"Leverage of {fmt_x(lev)} Debt/EBITDA is elevated")

    cr = r["currentRatio"]
    if cr is not None and cr < 1.0:
        add("med", f"Current ratio of {fmt_x(cr)} — short-term liabilities exceed current assets")

    rg, vg = r["receivablesGrowth"], r["revenueGrowth"]
    if rg is not None and vg is not None:
        spread = rg - vg
        if spread > 0.30:
            add("high", f"Receivables up {fmt_pct(rg)} vs revenue {fmt_pct(vg)} — "
                        "possible collection issue or channel stuffing")
        elif spread > 0.10:
            add("med", f"Receivables growing faster than revenue "
                       f"({fmt_pct(rg)} vs {fmt_pct(vg)})")

    nm = r["netMargin"]
    if nm is not None and ni is not None and ni >= 0 and nm < 0.03:
        add("med", f"Thin net margin of {fmt_pct(nm)}")

    share = r.get("topCustomerShare")
    if share is not None:
        if share > 0.5:
            add("high", f"Top customer represents {fmt_pct(share)} of revenue "
                        "— severe concentration risk")
        elif share >= 0.3:
            add("med", f"Top customer represents {fmt_pct(share)} of revenue "
                       "— concentration risk")

    ltv = r.get("ltv")
    if ltv is not None and ltv > 1.0:
        add("high", f"LTV of {fmt_pct(ltv)} — debt exceeds pledged collateral")

    return flags


# -------------------------------- scorecard ----------------------------------
# Transparent, explainable-by-design. Baseline 50; each factor moves the score
# up or down by a fixed number of points depending on which band it falls in.
# Because the contribution of every factor is explicit, the decision can always
# be explained (EU AI Act, Art. 86) — no black box.

def _score_dscr(v: Number) -> int:
    if v is None: return 0
    if v >= 1.5: return 20
    if v >= 1.25: return 12
    if v >= 1.0: return 0
    if v >= 0.8: return -15
    return -25


def _score_leverage(v: Number) -> int:
    if v is None: return 0
    if v < 2: return 10
    if v < 3: return 5
    if v < 4: return -5
    if v < 5: return -12
    return -20


def _score_current(v: Number) -> int:
    if v is None: return 0
    if v >= 2: return 8
    if v >= 1.5: return 5
    if v >= 1.0: return 0
    return -12


def _score_ccc(v: Number) -> int:
    if v is None: return 0
    if v < 30: return 8
    if v < 60: return 4
    if v < 90: return 0
    if v < 120: return -6
    return -12


def _score_margin(v: Number) -> int:
    if v is None: return 0
    if v >= 0.10: return 8
    if v >= 0.05: return 4
    if v >= 0.0: return 0
    return -18


def _score_growth(rg: Number, vg: Number) -> int:
    if rg is None or vg is None: return 0
    spread = rg - vg
    if spread > 0.30: return -15
    if spread > 0.10: return -6
    return 6


def _score_ocf(v: Number) -> int:
    if v is None: return 0
    return 6 if v >= 0 else -18


def _score_concentration(share: Number) -> int:
    # Fixed discrete bands to match the scorecard pattern. Unknown = 0 so
    # missing data never manufactures either a boost or a drag.
    if share is None: return 0
    if share > 0.5: return -15
    if share >= 0.3: return -8
    return 0


def _score_ltv(v: Number) -> int:
    # LTV = totalDebt / collateralValue. Unsecured (no collateral) -> None -> 0
    # points, treated as neutral rather than penalized: many facilities are
    # deliberately unsecured (revolvers, RCFs), and the DSCR / leverage
    # factors already capture the cash-flow view of that risk.
    if v is None: return 0
    if v < 0.7: return 6
    if v < 0.9: return 0
    if v <= 1.0: return -8
    return -15


# ------------------------------ factor weights --------------------------------
# The maximum positive / negative points each _score_* function can return.
# Static — not computed from the scoring bodies. Exposed on Factor so the
# implicit weighting is visible in the API contract; the frontend can render
# each bar's scale against its own range rather than a shared ±25.
MAX_POINTS: dict[str, tuple[int, int]] = {
    "dscr":          (20, -25),
    "lev":           (10, -20),
    "liq":           (8,  -12),
    "ccc":           (8,  -12),
    "margin":        (8,  -18),
    "growth":        (6,  -15),
    "ocf":           (6,  -18),
    "concentration": (0,  -15),
    "ltv":           (6,  -15),
}


def _factor(key: str, label: str, value: str, points: int) -> dict[str, Any]:
    """Build one factor row with the static weight range attached. Keeps the
    factors list literal readable while ensuring max_positive / max_negative
    stay in sync with MAX_POINTS."""
    max_pos, max_neg = MAX_POINTS[key]
    return {
        "key": key, "label": label, "value": value, "points": points,
        "max_positive": max_pos, "max_negative": max_neg,
    }


# ------------------------------- knockout gates -------------------------------
# The composite score already weights factors implicitly, but a weighted sum
# can average away a fatal flaw. Knockouts are hard/soft override gates that
# fire on specific conditions regardless of the composite. Same pattern as
# the EU reference scorecards.
#
# Hard knockouts force the decision to DECLINE. Soft caps the decision at
# REVIEW: it only downgrades from APPROVE; a composite that was already
# DECLINE stays DECLINE, but the knockout is still surfaced in the audit
# trail. Score value is NEVER modified by a knockout — only the decision.
def detect_knockouts(
    r: dict[str, Any], f: dict[str, Any] | None = None,
) -> Optional[dict[str, str]]:
    """Return the first-fires-wins knockout dict, or None. Hard checks
    come before the soft check so a scenario that trips both surfaces the
    harder verdict. `f` (raw financials) is accepted for future checks
    that reference fields not carried through the ratios dict; today all
    checks work off `r`."""
    del f  # unused today, reserved for future non-ratio checks

    # Hard knockouts — order matters (first-fires-wins).
    if r.get("dscr") is not None and r["dscr"] < 1.0:
        return {"type": "hard",
                "reason": "DSCR below 1.0× — cannot service debt"}
    if r.get("debtToEbitda") is not None and r["debtToEbitda"] > 6.0:
        return {"type": "hard",
                "reason": "Leverage above 6× EBITDA — excessive"}
    if r.get("ltv") is not None and r["ltv"] > 1.0:
        return {"type": "hard",
                "reason": "Loan-to-value above 100% — undercollateralized"}
    if r.get("ocf") is not None and r["ocf"] < 0:
        return {"type": "hard",
                "reason": "Operating cash flow negative"}

    # Soft knockout (concentration).
    share = r.get("topCustomerShare")
    if share is not None and share > 0.5:
        return {"type": "soft",
                "reason": "Single customer > 50% of revenue"}

    return None


def score_credit(
    r: dict[str, Any], f: dict[str, Any] | None = None,
) -> dict[str, Any]:
    factors = [
        _factor("dscr", "Debt service coverage (DSCR)",
                fmt_x(r["dscr"]), _score_dscr(r["dscr"])),
        _factor("lev", "Leverage (Debt/EBITDA)",
                fmt_x(r["debtToEbitda"]), _score_leverage(r["debtToEbitda"])),
        _factor("liq", "Liquidity (current ratio)",
                fmt_x(r["currentRatio"]), _score_current(r["currentRatio"])),
        _factor("ccc", "Cash conversion cycle",
                fmt_days(r["ccc"]), _score_ccc(r["ccc"])),
        _factor("margin", "Net margin",
                fmt_pct(r["netMargin"]), _score_margin(r["netMargin"])),
        _factor("growth", "Growth quality (AR vs revenue)",
                f'{fmt_pct(r["receivablesGrowth"])} / {fmt_pct(r["revenueGrowth"])}',
                _score_growth(r["receivablesGrowth"], r["revenueGrowth"])),
        _factor("ocf", "Operating cash flow",
                "Positive" if (r["ocf"] or 0) >= 0 else "Negative",
                _score_ocf(r["ocf"])),
        _factor("concentration", "Customer concentration",
                fmt_pct(r.get("topCustomerShare")),
                _score_concentration(r.get("topCustomerShare"))),
        _factor("ltv", "Loan-to-value (Debt/Collateral)",
                fmt_pct(r.get("ltv")),
                _score_ltv(r.get("ltv"))),
    ]

    score = max(0, min(100, 50 + sum(fac["points"] for fac in factors)))
    composite_decision = (
        "APPROVE" if score >= 65 else "REVIEW" if score >= 45 else "DECLINE"
    )

    # Knockout gates override the composite decision (but never the score).
    # A hard knockout forces DECLINE; a soft knockout caps at REVIEW so a
    # composite that would have approved lands at REVIEW, but a composite
    # that was already DECLINE stays DECLINE (the knockout is still
    # surfaced for the audit trail).
    knockout = detect_knockouts(r, f or {})
    if knockout is not None and knockout["type"] == "hard":
        decision = "DECLINE"
    elif knockout is not None and knockout["type"] == "soft" and composite_decision == "APPROVE":
        decision = "REVIEW"
    else:
        decision = composite_decision

    # Counterfactual on the single biggest drag — the actionable "what if".
    targets = {
        "dscr": ("raising DSCR above 1.25\u00d7", 12),
        "lev": ("cutting leverage below 3\u00d7 Debt/EBITDA", 5),
        "liq": ("lifting the current ratio above 1.5\u00d7", 5),
        "ccc": ("shortening the cash conversion cycle under 60 days", 4),
        "margin": ("restoring net margin above 5%", 4),
        "growth": ("bringing receivables growth back in line with revenue", 6),
        "ocf": ("turning operating cash flow positive", 6),
        "concentration": ("diversifying revenue below 30% top-customer share", 0),
        "ltv": ("reducing LTV below 90%", 0),
    }
    counterfactual = None
    worst = min(factors, key=lambda f: f["points"])
    if worst["points"] < 0 and worst["key"] in targets:
        phrase, target = targets[worst["key"]]
        delta = target - worst["points"]
        counterfactual = (
            f"Largest drag: {worst['label'].lower()}. "
            f"{phrase[0].upper() + phrase[1:]} would add roughly +{delta} points "
            f"(to about {min(100, score + delta)}/100)."
        )

    return {"score": score, "decision": decision,
            "factors": factors, "counterfactual": counterfactual,
            "knockout": knockout}
