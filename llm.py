"""The LLM layer — the only place the Anthropic API key is used.

Two responsibilities, both *language* tasks:
  extract_financials  reads a messy loan file -> clean structured JSON
  generate_memo       turns the computed numbers -> a readable credit memo

Everything numeric happens in finance.py, not here. The model is given the
already-computed figures for the memo so it can never invent numbers.
"""
import json
from typing import Any

from anthropic import Anthropic

from .config import settings
from .finance import fmt_days, fmt_eur, fmt_pct, fmt_x


class LLMError(Exception):
    """Raised when the model request itself fails (network, auth, rate limit)."""


_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if not settings.anthropic_api_key:
        raise LLMError("ANTHROPIC_API_KEY is not set on the server.")
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _text(message: Any) -> str:
    return "".join(
        b.text for b in message.content if getattr(b, "type", None) == "text"
    ).strip()


def extract_financials(doc_text: str) -> dict[str, Any]:
    """LLM call #1 — structure the document. Returns a dict matching the schema
    finance.py expects. Raises ValueError if the output can't be parsed."""
    client = _get_client()
    prompt = f"""You are a data-extraction engine for credit analysis. Read the \
loan file below and return ONLY a JSON object — no prose, no markdown fences. \
Use numbers only (no currency symbols, no commas). If a value is genuinely \
absent, use null.

Schema:
{{
  "company": string,
  "loanRequest": number,
  "revenueCurrent": number, "revenuePrior": number,
  "cogsCurrent": number,
  "ebitdaCurrent": number, "ebitdaPrior": number,
  "netIncomeCurrent": number,
  "interestExpenseCurrent": number,
  "cash": number,
  "accountsReceivableCurrent": number, "accountsReceivablePrior": number,
  "inventory": number,
  "currentAssets": number, "currentLiabilities": number,
  "accountsPayable": number,
  "totalDebt": number, "totalEquity": number,
  "debtService": number, "operatingCashFlow": number
}}

LOAN FILE:
\"\"\"
{doc_text}
\"\"\""""
    try:
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:  # noqa: BLE001 - surface any SDK/transport error cleanly
        raise LLMError(f"Extraction request failed: {e}") from e

    raw = _text(msg).replace("```json", "").replace("```", "").strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Could not read structured financials from that file.")
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError as e:
        raise ValueError(
            "The extracted financials were not valid JSON. "
            "Try a clearer statement layout."
        ) from e


def generate_memo(f: dict[str, Any], r: dict[str, Any],
                  flags: list[dict[str, str]], scoring: dict[str, Any]) -> str:
    """LLM call #2 — draft the memo, grounded strictly in the numbers we pass."""
    client = _get_client()
    flag_list = "\n".join("- " + x["text"] for x in flags) or "- None material"
    ocf_word = "positive" if (r["ocf"] or 0) >= 0 else "negative"

    prompt = f"""You are a senior SME credit analyst. Write a concise internal \
credit memo (about 280-340 words) using ONLY the figures provided. Do not \
invent numbers. Use this exact structure with bold section labels:

**Recommendation:** state {scoring['decision']} and the score {scoring['score']}/100.
**Executive summary:** 2-3 sentences on the borrower and the core of the decision.
**Cash flow & debt capacity:** discuss DSCR of {fmt_x(r['dscr'])}, operating \
cash flow ({ocf_word}), and the cash conversion cycle of {fmt_days(r['ccc'])}.
**Key risks:** address the flags below directly.
**Conditions & follow-up questions:** exactly 3 bullet questions for the credit committee.

Be direct and specific to this borrower. Plain institutional tone.

DATA
Company: {f.get('company')}
Loan requested: {fmt_eur(f.get('loanRequest'))}
DSCR: {fmt_x(r['dscr'])} | Debt/EBITDA: {fmt_x(r['debtToEbitda'])} | Debt/Equity: {fmt_x(r['debtToEquity'])}
Current ratio: {fmt_x(r['currentRatio'])} | Quick ratio: {fmt_x(r['quickRatio'])}
Net margin: {fmt_pct(r['netMargin'])} | Revenue growth: {fmt_pct(r['revenueGrowth'])} | Receivables growth: {fmt_pct(r['receivablesGrowth'])}
Cash conversion cycle: {fmt_days(r['ccc'])} (DSO {fmt_days(r['dso'])}, DIO {fmt_days(r['dio'])}, DPO {fmt_days(r['dpo'])})
Operating cash flow: {fmt_eur(r['ocf'])}
Score: {scoring['score']}/100 -> {scoring['decision']}
Red flags:
{flag_list}"""
    try:
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:  # noqa: BLE001
        raise LLMError(f"Memo request failed: {e}") from e
    return _text(msg)
