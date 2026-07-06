"""Smoke test — proves the backend works end to end without needing a real API
key. The LLM calls are stubbed so we exercise routing, the finance engine, and
DB persistence. Run: python test_local.py
"""
import os
import tempfile

# Use a throwaway SQLite file so the test never touches a real DB.
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["ANTHROPIC_API_KEY"] = "test-key-not-used"

from app.finance import compute_ratios, detect_flags, score_credit  # noqa: E402

# Structured financials matching the three demo borrowers (what extraction would return).
MERIDIAN = dict(company="Meridian Freight & Logistics", loanRequest=250000,
    revenueCurrent=4200000, revenuePrior=3600000, cogsCurrent=2940000,
    ebitdaCurrent=620000, ebitdaPrior=480000, netIncomeCurrent=290000,
    interestExpenseCurrent=85000, cash=380000,
    accountsReceivableCurrent=620000, accountsReceivablePrior=540000,
    inventory=210000, currentAssets=1210000, currentLiabilities=640000,
    accountsPayable=410000, totalDebt=1150000, totalEquity=1480000,
    debtService=330000, operatingCashFlow=450000,
    # Secured on the existing fleet (see loan file). No customer concentration.
    topCustomerShare=None, collateralValue=1800000)

CASCADE = dict(company="Cascade Home Retail", loanRequest=300000,
    revenueCurrent=5800000, revenuePrior=4900000, cogsCurrent=4640000,
    ebitdaCurrent=180000, ebitdaPrior=258000, netIncomeCurrent=-80000,
    interestExpenseCurrent=165000, cash=90000,
    accountsReceivableCurrent=1340000, accountsReceivablePrior=720000,
    inventory=1180000, currentAssets=2610000, currentLiabilities=2740000,
    accountsPayable=1520000, totalDebt=1350000, totalEquity=420000,
    debtService=360000, operatingCashFlow=-120000,
    # Unsecured working-capital revolver — LTV renders "—" downstream.
    topCustomerShare=None, collateralValue=None)

AURORA = dict(company="Aurora Precision Manufacturing", loanRequest=200000,
    revenueCurrent=3100000, revenuePrior=2950000, cogsCurrent=2170000,
    ebitdaCurrent=370000, ebitdaPrior=345000, netIncomeCurrent=110000,
    interestExpenseCurrent=95000, cash=150000,
    accountsReceivableCurrent=540000, accountsReceivablePrior=500000,
    inventory=480000, currentAssets=1170000, currentLiabilities=890000,
    accountsPayable=420000, totalDebt=1280000, totalEquity=940000,
    debtService=310000, operatingCashFlow=230000,
    # Automotive anchor is 38% of revenue (in-band concentration drag),
    # secured against machinery — LTV = 1.28M / 1.6M = 80% (neutral band).
    topCustomerShare=0.38, collateralValue=1600000)

print("=== 1. Finance engine (deterministic) ===")
expected = {"Meridian": "APPROVE", "Cascade": "DECLINE", "Aurora": "REVIEW"}
by_name = {"Meridian": MERIDIAN, "Cascade": CASCADE, "Aurora": AURORA}
for name, f in by_name.items():
    r = compute_ratios(f)
    s = score_credit(r)
    flags = detect_flags(f, r)
    ok = "OK" if s["decision"] == expected[name] else "MISMATCH"
    print(f"  {name:9} score={s['score']:>3}  decision={s['decision']:<8} "
          f"(expected {expected[name]:<8}) flags={len(flags)}  [{ok}]")
    assert s["decision"] == expected[name], f"{name} expected {expected[name]}"

# --- API test with the LLM stubbed ---
print("\n=== 2. API pipeline (LLM stubbed) ===")
from app.routers import analyses as router_mod  # noqa: E402

def fake_extract(text):
    if "Cascade" in text: return CASCADE
    if "Aurora" in text: return AURORA
    return MERIDIAN

def fake_memo(f, r, flags, scoring):
    return (f"**Recommendation:** {scoring['decision']} ({scoring['score']}/100).\n"
            f"**Executive summary:** {f['company']} reviewed. (stubbed memo)")

router_mod.extract_financials = fake_extract
router_mod.generate_memo = fake_memo

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)

h = client.get("/api/health")
print(f"  GET /api/health -> {h.status_code} {h.json()}")
assert h.status_code == 200

resp = client.post("/api/analyze", json={"text":
    "LOAN APPLICATION — Cascade Home Retail Ltd. Financial statements attached, "
    "revenue 5,800,000, EBITDA 180,000, net income -80,000."})
print(f"  POST /api/analyze (Cascade) -> {resp.status_code}")
data = resp.json()
assert resp.status_code == 200, data
print(f"     decision={data['decision']} score={data['score']} "
      f"flags={len(data['flags'])} factors={len(data['factors'])}")
assert data["decision"] == "DECLINE"
assert data["counterfactual"]  # should surface the biggest drag
aid = data["id"]

lst = client.get("/api/analyses")
print(f"  GET /api/analyses -> {lst.status_code}, {len(lst.json())} record(s) persisted")
assert lst.status_code == 200 and len(lst.json()) == 1

one = client.get(f"/api/analyses/{aid}")
print(f"  GET /api/analyses/{{id}} -> {one.status_code}, company={one.json()['company']}")
assert one.status_code == 200

missing = client.get("/api/analyses/does-not-exist")
print(f"  GET /api/analyses/does-not-exist -> {missing.status_code} (expected 404)")
assert missing.status_code == 404


# --- PDF multipart smoke test (LLM stubbed) ---
print("\n=== 3. API pipeline — PDF upload (LLM stubbed) ===")
from io import BytesIO  # noqa: E402
from pypdf import PdfWriter  # noqa: E402


def _make_tiny_pdf() -> bytes:
    """One-page blank PDF, enough to satisfy magic-byte + page-count checks."""
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def fake_extract_from_files(files, text_supplement=None):
    # Regardless of PDF content, pretend the LLM read Cascade — proves the
    # multipart path plumbs the downstream pipeline correctly.
    assert len(files) >= 1
    for name, data in files:
        assert isinstance(name, str) and isinstance(data, (bytes, bytearray))
    return CASCADE


router_mod.extract_financials_from_files = fake_extract_from_files

pdf1, pdf2 = _make_tiny_pdf(), _make_tiny_pdf()
resp = client.post(
    "/api/analyze",
    files=[
        ("files", ("statements.pdf", pdf1, "application/pdf")),
        ("files", ("tax_return.pdf", pdf2, "application/pdf")),
    ],
    data={"text": "focus on FY2024"},
)
print(f"  POST /api/analyze (multipart, 2 files + text) -> {resp.status_code}")
pdf_data = resp.json()
assert resp.status_code == 200, pdf_data
print(f"     decision={pdf_data['decision']} score={pdf_data['score']} "
      f"factors={len(pdf_data['factors'])}")
assert pdf_data["decision"] == "DECLINE"
assert pdf_data["counterfactual"]

# The audit trail records that this came from an upload — the source column
# stores the filenames plus the pasted-notes marker, not the extracted text.
pdf_record = client.get(f"/api/analyses/{pdf_data['id']}").json()
assert pdf_record["company"] == "Cascade Home Retail"

# Non-PDF content-types get rejected at 415 before any LLM call.
rej = client.post(
    "/api/analyze",
    files=[("files", ("readme.txt", b"not a pdf", "text/plain"))],
)
print(f"  POST /api/analyze (non-PDF)  -> {rej.status_code} (expected 415)")
assert rej.status_code == 415, rej.json()

# Empty multipart (no files) gets 422.
empty = client.post(
    "/api/analyze",
    files=[("files", ("bogus.pdf", b"", "application/pdf"))],
)
print(f"  POST /api/analyze (empty PDF) -> {empty.status_code} (expected 415)")
assert empty.status_code == 415, empty.json()  # empty file fails magic-byte check


print("\nALL CHECKS PASSED ✅")
