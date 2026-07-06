"""The LLM layer — the only place the Anthropic API key is used.

Three responsibilities, all *language* tasks:
  extract_financials             read a text loan file  -> clean structured JSON
  extract_financials_from_files  read PDFs (+ optional  -> clean structured JSON
                                 pasted-notes supplement)
  generate_memo                  turn computed numbers  -> readable credit memo

Everything numeric happens in finance.py, not here. The model is given the
already-computed figures for the memo so it can never invent numbers.

Model routing (see app.config):
  extract_financials             uses settings.text_model  (Opus by default)
  extract_financials_from_files  uses settings.pdf_model   (Sonnet 4.5 by default)
  generate_memo                  uses settings.text_model  (prose, no PDFs)
"""
import base64
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


# --------------------------- shared extraction prompt --------------------------
_EXTRACT_SCHEMA_BLOCK = """Return ONLY a JSON object — no prose, no markdown \
fences. Use numbers only (no currency symbols, no commas). If a value is \
genuinely absent, use null.

Schema:
{
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
  "debtService": number, "operatingCashFlow": number,
  "topCustomerShare": number,
  "collateralValue": number
}

Notes on the last two fields:
- topCustomerShare is a DECIMAL (0.38 for 38%). If the file says something \
like "one client represents 38% of revenue" or "top customer accounts for \
40%", extract that as a decimal. If concentration is not mentioned at all, \
use null.
- collateralValue is total pledged collateral in EUR (equipment appraisal, \
fleet valuation, real estate, etc.). Use null for unsecured facilities such \
as working-capital revolvers."""


def _parse_json_response(raw_text: str) -> dict[str, Any]:
    """Strip any accidental markdown fences, then load. Shared by both
    extract functions so JSON parsing quirks are handled in one place."""
    raw = raw_text.replace("```json", "").replace("```", "").strip()
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


# ------------------------------- text pipeline --------------------------------
def extract_financials(doc_text: str) -> dict[str, Any]:
    """LLM call #1 for the text pipeline. Returns a dict matching the schema
    finance.py expects. Raises ValueError if the output can't be parsed."""
    client = _get_client()
    prompt = (
        "You are a data-extraction engine for credit analysis. Read the loan "
        f"file below and return the JSON described.\n\n{_EXTRACT_SCHEMA_BLOCK}\n\n"
        f'LOAN FILE:\n"""\n{doc_text}\n"""'
    )
    try:
        msg = client.messages.create(
            model=settings.text_model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:  # noqa: BLE001 - surface any SDK/transport error cleanly
        raise LLMError(f"Extraction request failed: {e}") from e
    return _parse_json_response(_text(msg))


# ------------------------------- PDF pipeline ---------------------------------
def extract_financials_from_files(
    files: list[tuple[str, bytes]],
    text_supplement: str | None = None,
) -> dict[str, Any]:
    """LLM call #1 for the PDF pipeline. `files` is a list of (filename, bytes)
    tuples. `text_supplement` is optional pasted-notes text sent alongside.

    Each PDF becomes a `document` content block sent to Claude with a title
    that matches the filename listed in the prompt, so Claude can reason about
    which figures came from which file. The pasted-notes supplement, if any,
    is wrapped with the same `--- FILE: pasted-notes ---` marker to keep the
    file-separator convention uniform across the whole extraction prompt.
    """
    if not files:
        raise ValueError("No PDF files provided.")

    client = _get_client()

    filenames = [name for name, _ in files]
    listed = "\n".join(f"--- FILE: {name} ---" for name in filenames)
    if text_supplement:
        listed += "\n--- FILE: pasted-notes ---"

    prompt_text = (
        "You are a data-extraction engine for credit analysis. You are given "
        f"the following loan files, which together describe one borrower:\n\n"
        f"{listed}\n\n"
        f"Read them together as a single logical loan file. {_EXTRACT_SCHEMA_BLOCK}"
    )

    content: list[dict[str, Any]] = [{"type": "text", "text": prompt_text}]
    for name, data in files:
        content.append({
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": base64.standard_b64encode(data).decode("ascii"),
            },
            "title": name,
        })
    if text_supplement:
        content.append({
            "type": "text",
            "text": f"--- FILE: pasted-notes ---\n{text_supplement}",
        })

    try:
        msg = client.messages.create(
            model=settings.pdf_model,
            max_tokens=1024,
            messages=[{"role": "user", "content": content}],
        )
    except Exception as e:  # noqa: BLE001
        raise LLMError(f"Extraction request failed: {e}") from e
    return _parse_json_response(_text(msg))


# --------------------------------- memo ---------------------------------------
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
Customer concentration: {fmt_pct(f.get('topCustomerShare'))}
Loan-to-value (Debt/Collateral): {fmt_pct(r.get('ltv'))} (collateral {fmt_eur(f.get('collateralValue'))})
Score: {scoring['score']}/100 -> {scoring['decision']}
Red flags:
{flag_list}"""
    try:
        msg = client.messages.create(
            model=settings.text_model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:  # noqa: BLE001
        raise LLMError(f"Memo request failed: {e}") from e
    return _text(msg)
