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


def score_credit(r: dict[str, Any]) -> dict[str, Any]:
    factors = [
        {"key": "dscr", "label": "Debt service coverage (DSCR)",
         "value": fmt_x(r["dscr"]), "points": _score_dscr(r["dscr"])},
        {"key": "lev", "label": "Leverage (Debt/EBITDA)",
         "value": fmt_x(r["debtToEbitda"]), "points": _score_leverage(r["debtToEbitda"])},
        {"key": "liq", "label": "Liquidity (current ratio)",
         "value": fmt_x(r["currentRatio"]), "points": _score_current(r["currentRatio"])},
        {"key": "ccc", "label": "Cash conversion cycle",
         "value": fmt_days(r["ccc"]), "points": _score_ccc(r["ccc"])},
        {"key": "margin", "label": "Net margin",
         "value": fmt_pct(r["netMargin"]), "points": _score_margin(r["netMargin"])},
        {"key": "growth", "label": "Growth quality (AR vs revenue)",
         "value": f'{fmt_pct(r["receivablesGrowth"])} / {fmt_pct(r["revenueGrowth"])}',
         "points": _score_growth(r["receivablesGrowth"], r["revenueGrowth"])},
        {"key": "ocf", "label": "Operating cash flow",
         "value": ("Positive" if (r["ocf"] or 0) >= 0 else "Negative"),
         "points": _score_ocf(r["ocf"])},
    ]

    score = max(0, min(100, 50 + sum(f["points"] for f in factors)))
    decision = "APPROVE" if score >= 65 else "REVIEW" if score >= 45 else "DECLINE"

    # Counterfactual on the single biggest drag — the actionable "what if".
    targets = {
        "dscr": ("raising DSCR above 1.25\u00d7", 12),
        "lev": ("cutting leverage below 3\u00d7 Debt/EBITDA", 5),
        "liq": ("lifting the current ratio above 1.5\u00d7", 5),
        "ccc": ("shortening the cash conversion cycle under 60 days", 4),
        "margin": ("restoring net margin above 5%", 4),
        "growth": ("bringing receivables growth back in line with revenue", 6),
        "ocf": ("turning operating cash flow positive", 6),
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
            "factors": factors, "counterfactual": counterfactual}
