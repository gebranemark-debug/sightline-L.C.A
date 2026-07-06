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

# 61 files exceeds the MAX_FILES = 60 ceiling by one, so the first bound check
# fires before any PDF is even read. Reuses _make_tiny_pdf() so this stays
# fast — each PDF is <1 KB and construction is cheap.
too_many = client.post(
    "/api/analyze",
    files=[
        ("files", (f"pdf_{i}.pdf", _make_tiny_pdf(), "application/pdf"))
        for i in range(61)
    ],
)
print(f"  POST /api/analyze (61 files)   -> {too_many.status_code} (expected 422)")
assert too_many.status_code == 422, too_many.json()
assert "60" in too_many.json()["detail"], too_many.json()


# --- Borrower endpoints (LLM stubbed) ---
print("\n=== 4. Borrower + file endpoints (LLM stubbed) ===")
from app.routers import borrowers as borrowers_mod  # noqa: E402

# Borrower analyze uses the same extract_financials_from_files as the
# multipart path — stub it on the borrowers module too.
borrowers_mod.extract_financials_from_files = fake_extract_from_files

# 4.1 create
cb = client.post("/api/borrowers", json={
    "name": "Cascade Home Retail Ltd", "sector": "Retail",
    "notes": "Existing wholesale expansion; watch receivables trend.",
})
print(f"  POST /api/borrowers -> {cb.status_code}")
assert cb.status_code == 200, cb.json()
bsum = cb.json()
assert bsum["name"] == "Cascade Home Retail Ltd"
assert bsum["file_count"] == 0 and bsum["analysis_count"] == 0
assert bsum["latest_decision"] is None
borrower_id = bsum["id"]

# 4.2 list
bl = client.get("/api/borrowers")
print(f"  GET /api/borrowers -> {bl.status_code}, {len(bl.json())} borrower(s)")
assert bl.status_code == 200 and len(bl.json()) == 1
assert bl.json()[0]["name"] == "Cascade Home Retail Ltd"

# 4.3 files: upload two PDFs — reuses validate_and_read_pdfs, must reject non-PDF
uf = client.post(
    f"/api/borrowers/{borrower_id}/files",
    files=[
        ("files", ("application.pdf", _make_tiny_pdf(), "application/pdf")),
        ("files", ("statements.pdf",  _make_tiny_pdf(), "application/pdf")),
    ],
)
print(f"  POST /api/borrowers/{{id}}/files -> {uf.status_code}, {len(uf.json())} file(s)")
assert uf.status_code == 200, uf.json()
files_meta = uf.json()
assert len(files_meta) == 2
assert files_meta[0]["filename"] == "application.pdf"
assert files_meta[0]["page_count"] == 1
assert files_meta[0]["size_bytes"] > 0
file_ids = [f["id"] for f in files_meta]

# Non-PDF still rejected on the borrower endpoint (helper is shared).
rej_b = client.post(
    f"/api/borrowers/{borrower_id}/files",
    files=[("files", ("readme.txt", b"nope", "text/plain"))],
)
print(f"  POST /api/borrowers/{{id}}/files (non-PDF) -> {rej_b.status_code} (expected 415)")
assert rej_b.status_code == 415, rej_b.json()

# Missing borrower on /files gets an explicit 404 BEFORE the validation loop.
uf_missing = client.post(
    "/api/borrowers/does-not-exist/files",
    files=[("files", ("x.pdf", _make_tiny_pdf(), "application/pdf"))],
)
print(f"  POST /api/borrowers/missing/files -> {uf_missing.status_code} (expected 404)")
assert uf_missing.status_code == 404, uf_missing.json()
assert uf_missing.json()["detail"] == "Borrower not found."

# 4.4 analyze the borrower using the stored file_ids
ab = client.post(
    f"/api/borrowers/{borrower_id}/analyze",
    json={"file_ids": file_ids},
)
print(f"  POST /api/borrowers/{{id}}/analyze -> {ab.status_code}")
assert ab.status_code == 200, ab.json()
a_data = ab.json()
assert a_data["decision"] == "DECLINE"
assert a_data["score"] == 0
assert a_data["counterfactual"]

# Missing borrower on /analyze gets an explicit 404 BEFORE the file_ids lookup.
ab_missing = client.post(
    "/api/borrowers/does-not-exist/analyze",
    json={"file_ids": file_ids},
)
print(f"  POST /api/borrowers/missing/analyze -> {ab_missing.status_code} (expected 404)")
assert ab_missing.status_code == 404, ab_missing.json()
assert ab_missing.json()["detail"] == "Borrower not found."

# file_ids that don't belong to this borrower → 404 with a helpful message.
ab_bad_files = client.post(
    f"/api/borrowers/{borrower_id}/analyze",
    json={"file_ids": ["not-a-real-file"]},
)
print(f"  POST /api/borrowers/{{id}}/analyze (bad file_ids) -> {ab_bad_files.status_code} (expected 404)")
assert ab_bad_files.status_code == 404, ab_bad_files.json()
assert "not found" in ab_bad_files.json()["detail"]

# 4.5 detail: borrower page now surfaces the files + the analysis, newest-first
bd = client.get(f"/api/borrowers/{borrower_id}")
print(f"  GET /api/borrowers/{{id}} -> {bd.status_code}")
assert bd.status_code == 200
detail = bd.json()
assert detail["name"] == "Cascade Home Retail Ltd"
assert len(detail["files"]) == 2
assert len(detail["analyses"]) == 1
assert detail["analyses"][0]["decision"] == "DECLINE"

# Rollups on the list reflect the new files + analysis.
bl2 = client.get("/api/borrowers")
row = bl2.json()[0]
print(f"     rollups: files={row['file_count']} analyses={row['analysis_count']} "
      f"latest={row['latest_decision']} {row['latest_score']}/100")
assert row["file_count"] == 2 and row["analysis_count"] == 1
assert row["latest_decision"] == "DECLINE" and row["latest_score"] == 0

# GET /api/borrowers on an unknown id → 404
missing_b = client.get("/api/borrowers/does-not-exist")
print(f"  GET /api/borrowers/does-not-exist -> {missing_b.status_code} (expected 404)")
assert missing_b.status_code == 404


# --- Auto-attach on APPROVE + list_analyses filters ---
print("\n=== 5. Auto-attach on APPROVE (LLM stubbed) ===")


def _stub_returning(financials):
    """Replace extract_financials with one that always returns the given dict.
    Lets each sub-test drive the auto-attach rule via a specific `company`."""
    def _fn(_text):
        return financials
    return _fn


# 5.1 APPROVE + real company → borrower auto-created, analysis attached
before = client.get("/api/borrowers").json()
before_names = {b["name"] for b in before}
assert "Meridian Freight & Logistics" not in before_names, "test precondition"

router_mod.extract_financials = _stub_returning(MERIDIAN)
r = client.post("/api/analyze", json={"text": "LOAN APPLICATION — Meridian one line, more than forty characters."})
assert r.status_code == 200, r.json()
assert r.json()["decision"] == "APPROVE", r.json()
mer_analysis_id = r.json()["id"]

after = client.get("/api/borrowers").json()
assert len(after) == len(before) + 1
meridian_row = next(b for b in after if b["name"] == "Meridian Freight & Logistics")
assert meridian_row["analysis_count"] == 1
assert meridian_row["latest_decision"] == "APPROVE"
assert meridian_row["latest_score"] == 100
meridian_id = meridian_row["id"]

detail = client.get(f"/api/borrowers/{meridian_id}").json()
assert any(a["id"] == mer_analysis_id for a in detail["analyses"])
print(f"  APPROVE + Meridian → auto-created borrower {meridian_id[:8]}… "
      f"rollup analysis_count=1                    [OK]")

# 5.2 Same-name dedupe: second APPROVE with exact same company
router_mod.extract_financials = _stub_returning(MERIDIAN)
r2 = client.post("/api/analyze", json={"text": "SECOND analysis for Meridian, more than forty characters here."})
assert r2.status_code == 200 and r2.json()["decision"] == "APPROVE"
after2 = client.get("/api/borrowers").json()
assert len(after2) == len(after), "same name should NOT create a new borrower"
meridian_row2 = next(b for b in after2 if b["name"] == "Meridian Freight & Logistics")
assert meridian_row2["analysis_count"] == 2
print(f"  same-name APPROVE → attached to existing, analysis_count=2                  [OK]")

# 5.3 Case-insensitive dedupe
router_mod.extract_financials = _stub_returning(
    dict(MERIDIAN, company="MERIDIAN FREIGHT & LOGISTICS")
)
r3 = client.post("/api/analyze", json={"text": "UPPERCASE variant of Meridian, more than forty characters here."})
assert r3.status_code == 200 and r3.json()["decision"] == "APPROVE"
after3 = client.get("/api/borrowers").json()
assert len(after3) == len(after)
meridian_row3 = next(b for b in after3 if b["name"] == "Meridian Freight & Logistics")
assert meridian_row3["analysis_count"] == 3
print(f"  case-insensitive dedupe → attached, analysis_count=3                        [OK]")

# 5.4 Trim dedupe: leading/trailing whitespace
router_mod.extract_financials = _stub_returning(
    dict(MERIDIAN, company="  Meridian Freight & Logistics  ")
)
r4 = client.post("/api/analyze", json={"text": "PADDED variant of Meridian, more than forty characters here yes."})
assert r4.status_code == 200 and r4.json()["decision"] == "APPROVE"
after4 = client.get("/api/borrowers").json()
assert len(after4) == len(after)
meridian_row4 = next(b for b in after4 if b["name"] == "Meridian Freight & Logistics")
assert meridian_row4["analysis_count"] == 4
print(f"  trimmed dedupe → attached, analysis_count=4                                 [OK]")

# 5.5 REVIEW → no auto-attach (even with a real company)
router_mod.extract_financials = _stub_returning(AURORA)
r5 = client.post("/api/analyze", json={"text": "Aurora REVIEW case, more than forty characters here for sure."})
assert r5.status_code == 200 and r5.json()["decision"] == "REVIEW"
after5 = client.get("/api/borrowers").json()
assert len(after5) == len(after), "REVIEW must NOT create a borrower"
print(f"  REVIEW → borrower list unchanged                                            [OK]")

# 5.6 DECLINE → no auto-attach, existing Cascade borrower unchanged
cascade_before = next(b for b in after5 if b["name"] == "Cascade Home Retail Ltd")
router_mod.extract_financials = _stub_returning(CASCADE)
r6 = client.post("/api/analyze", json={"text": "Cascade DECLINE case, more than forty characters here for sure."})
assert r6.status_code == 200 and r6.json()["decision"] == "DECLINE"
after6 = client.get("/api/borrowers").json()
assert len(after6) == len(after5)
cascade_after = next(b for b in after6 if b["name"] == "Cascade Home Retail Ltd")
assert cascade_after["analysis_count"] == cascade_before["analysis_count"], (
    "DECLINE must not attach to any borrower, even one that already exists"
)
print(f"  DECLINE → Cascade borrower's analysis_count unchanged                       [OK]")

# 5.7 APPROVE + "Unknown borrower" placeholder → no auto-attach
router_mod.extract_financials = _stub_returning(dict(MERIDIAN, company="Unknown borrower"))
r7 = client.post("/api/analyze", json={"text": "Unknown-borrower APPROVE, more than forty characters here yes."})
assert r7.status_code == 200 and r7.json()["decision"] == "APPROVE"
after7 = client.get("/api/borrowers").json()
assert len(after7) == len(after6), "Unknown borrower placeholder must not create a row"
print(f'  APPROVE + company="Unknown borrower" → no attach                            [OK]')

# 5.8 APPROVE + empty company → no auto-attach
router_mod.extract_financials = _stub_returning(dict(MERIDIAN, company=""))
r8 = client.post("/api/analyze", json={"text": "Empty-company APPROVE, more than forty characters here for real."})
assert r8.status_code == 200 and r8.json()["decision"] == "APPROVE"
after8 = client.get("/api/borrowers").json()
assert len(after8) == len(after6)
print(f"  APPROVE + company=\"\" → no attach                                           [OK]")

# Restore the routing stub so subsequent tests behave sensibly if extended.
router_mod.extract_financials = fake_extract

# 5.9 Filter params on /api/analyses
review_unattached = client.get("/api/analyses?decision=REVIEW&unattached=true").json()
assert review_unattached and all(a["decision"] == "REVIEW" for a in review_unattached), (
    review_unattached
)
decline_unattached = client.get("/api/analyses?decision=DECLINE&unattached=true").json()
assert decline_unattached and all(a["decision"] == "DECLINE" for a in decline_unattached), (
    decline_unattached
)
# unattached=false should surface at least one APPROVE (the ones attached to Meridian)
attached_only = client.get("/api/analyses?unattached=false&limit=100").json()
assert attached_only, "expected the attached Meridian APPROVEs to surface here"
attached_ids = {a["id"] for a in attached_only}
assert mer_analysis_id in attached_ids, "auto-attached analysis missing from unattached=false"
print(f"  ?decision=REVIEW&unattached=true → {len(review_unattached)} row(s)                                  [OK]")
print(f"  ?decision=DECLINE&unattached=true → {len(decline_unattached)} row(s)                                 [OK]")
print(f"  ?unattached=false → attached APPROVEs surface here                          [OK]")


# --- Human oversight (EU AI Act Article 14) ---
print("\n=== 6. Human oversight persistence (LLM stubbed) ===")

# Fresh analysis for oversight tests — use Aurora so the decision is REVIEW
# (the state where oversight actually matters day-to-day).
router_mod.extract_financials = _stub_returning(AURORA)
o1 = client.post("/api/analyze", json={"text": "Aurora REVIEW pre-oversight, more than forty characters here for sure."})
assert o1.status_code == 200 and o1.json()["decision"] == "REVIEW"
aid1 = o1.json()["id"]

# Baseline: fresh analysis has all oversight fields None.
baseline = client.get(f"/api/analyses/{aid1}").json()
assert baseline["officer_action"] is None
assert baseline["officer_note"] is None
assert baseline["officer_action_at"] is None
print("  fresh analysis → officer_action=None (Awaiting review)                       [OK]")

# CONFIRMED without a note → 200. Response echoes the persisted state.
c1 = client.post(f"/api/analyses/{aid1}/oversight", json={"action": "CONFIRMED"})
assert c1.status_code == 200, c1.json()
c1_data = c1.json()
assert c1_data["officer_action"] == "CONFIRMED"
assert c1_data["officer_note"] is None
assert c1_data["officer_action_at"] is not None
# Round-trip via GET to be sure the DB commit stuck.
persisted = client.get(f"/api/analyses/{aid1}").json()
assert persisted["officer_action"] == "CONFIRMED"
assert persisted["officer_action_at"] is not None
# Model's decision + score untouched — the whole point of the design.
assert persisted["decision"] == "REVIEW"
assert persisted["score"] == baseline["score"]
print("  CONFIRMED → persisted; decision + score unchanged                            [OK]")

# Second oversight on the same analysis → 409 (one-shot per demo).
c2 = client.post(f"/api/analyses/{aid1}/oversight", json={"action": "CONFIRMED"})
assert c2.status_code == 409, c2.json()
assert "already been reviewed" in c2.json()["detail"]
print("  second oversight on same analysis → 409                                     [OK]")

# Fresh analysis for the OVERRIDDEN path.
router_mod.extract_financials = _stub_returning(AURORA)
o2 = client.post("/api/analyze", json={"text": "Second Aurora for override path, more than forty characters here yes."})
assert o2.status_code == 200
aid2 = o2.json()["id"]

# OVERRIDDEN without a note → 422 with a specific message.
bad = client.post(f"/api/analyses/{aid2}/oversight", json={"action": "OVERRIDDEN"})
assert bad.status_code == 422, bad.json()
assert bad.json()["detail"] == "An override requires a reason."
print("  OVERRIDDEN with no note → 422 with specific reason message                  [OK]")

# OVERRIDDEN with whitespace-only note → 422 too (the trim catches it).
whitespace = client.post(f"/api/analyses/{aid2}/oversight", json={"action": "OVERRIDDEN", "note": "   \n\t  "})
assert whitespace.status_code == 422
print("  OVERRIDDEN with whitespace-only note → 422                                  [OK]")

# OVERRIDDEN with a real note → 200.
ok = client.post(
    f"/api/analyses/{aid2}/oversight",
    json={"action": "OVERRIDDEN", "note": "Concentration concern outweighs the DSCR — routing to committee."},
)
assert ok.status_code == 200, ok.json()
persisted2 = client.get(f"/api/analyses/{aid2}").json()
assert persisted2["officer_action"] == "OVERRIDDEN"
assert persisted2["officer_note"] == "Concentration concern outweighs the DSCR — routing to committee."
assert persisted2["officer_action_at"] is not None
assert persisted2["decision"] == "REVIEW"  # untouched
print("  OVERRIDDEN + note → persisted; decision + score unchanged                    [OK]")

# Unknown analysis id → 404.
missing = client.post("/api/analyses/does-not-exist/oversight", json={"action": "CONFIRMED"})
assert missing.status_code == 404
print("  unknown analysis id → 404                                                    [OK]")

# Restore the original stub.
router_mod.extract_financials = fake_extract


# --- Knockout gates ---
print("\n=== 7. Knockout gates ===")

# Baseline: Meridian input → no knockouts → decision unchanged
r_mer = compute_ratios(MERIDIAN)
s_mer = score_credit(r_mer, MERIDIAN)
assert s_mer["knockout"] is None
assert s_mer["decision"] == "APPROVE"
print(f"  Meridian     → no knockouts, APPROVE {s_mer['score']}/100                                 [OK]")

# Regression: Aurora composite REVIEW, no knockouts
r_aur = compute_ratios(AURORA)
s_aur = score_credit(r_aur, AURORA)
assert s_aur["knockout"] is None, s_aur["knockout"]
assert s_aur["decision"] == "REVIEW"
print(f"  Aurora       → no knockouts, REVIEW {s_aur['score']}/100                                  [OK]")

# Regression: Cascade — DSCR 0.5 hard knockout fires (matches composite DECLINE)
r_cas = compute_ratios(CASCADE)
s_cas = score_credit(r_cas, CASCADE)
assert s_cas["knockout"] == {"type": "hard", "reason": "DSCR below 1.0× — cannot service debt"}
assert s_cas["decision"] == "DECLINE"
print(f"  Cascade      → DSCR hard knockout, DECLINE {s_cas['score']}/100 (unchanged)               [OK]")

# Factor rows now expose their weight ranges
dscr_factor = next(f for f in s_mer["factors"] if f["key"] == "dscr")
assert dscr_factor["max_positive"] == 20 and dscr_factor["max_negative"] == -25
ltv_factor = next(f for f in s_mer["factors"] if f["key"] == "ltv")
assert ltv_factor["max_positive"] == 6 and ltv_factor["max_negative"] == -15
conc_factor = next(f for f in s_mer["factors"] if f["key"] == "concentration")
assert conc_factor["max_positive"] == 0 and conc_factor["max_negative"] == -15
print("  Factor.max_positive / max_negative exposed for DSCR / LTV / concentration    [OK]")

# Hard: DSCR < 1.0
s = score_credit(dict(r_mer, dscr=0.5), MERIDIAN)
assert s["knockout"] == {"type": "hard", "reason": "DSCR below 1.0× — cannot service debt"}
assert s["decision"] == "DECLINE"
print("  Forced DSCR 0.5           → DECLINE, hard knockout                            [OK]")

# Hard: Debt/EBITDA > 6.0
s = score_credit(dict(r_mer, debtToEbitda=8.0), MERIDIAN)
assert s["knockout"] == {"type": "hard", "reason": "Leverage above 6× EBITDA — excessive"}
assert s["decision"] == "DECLINE"
print("  Forced Debt/EBITDA 8      → DECLINE, hard knockout                            [OK]")

# Hard: LTV > 1.0
s = score_credit(dict(r_mer, ltv=1.2), MERIDIAN)
assert s["knockout"] == {"type": "hard", "reason": "Loan-to-value above 100% — undercollateralized"}
assert s["decision"] == "DECLINE"
print("  Forced LTV 1.2            → DECLINE, hard knockout                            [OK]")

# Hard: OCF < 0
s = score_credit(dict(r_mer, ocf=-50000), MERIDIAN)
assert s["knockout"] == {"type": "hard", "reason": "Operating cash flow negative"}
assert s["decision"] == "DECLINE"
print("  Forced OCF negative       → DECLINE, hard knockout                            [OK]")

# Soft: concentration > 0.5 with composite APPROVE → REVIEW
s = score_credit(dict(r_mer, topCustomerShare=0.6), MERIDIAN)
assert s["knockout"] == {"type": "soft", "reason": "Single customer > 50% of revenue"}
assert s["decision"] == "REVIEW"
print("  Concentration 0.6 + APPROVE composite → REVIEW, soft knockout                [OK]")

# Soft: concentration > 0.5 with composite DECLINE → stays DECLINE, knockout still populated
manual = {
    "dscr": 1.05, "debtToEbitda": 5.5, "debtToEquity": None,
    "currentRatio": 0.5, "quickRatio": 0.3,
    "netMargin": 0.02, "revenueGrowth": 0.1, "receivablesGrowth": 0.5,
    "dso": 60, "dio": 60, "dpo": 30, "ccc": 150,
    "ocf": 10000, "ltv": 0.95, "topCustomerShare": 0.6,
}
s = score_credit(manual, {})
assert s["decision"] == "DECLINE", (s["decision"], s["score"])
assert s["knockout"] == {"type": "soft", "reason": "Single customer > 50% of revenue"}
print("  Concentration 0.6 + DECLINE composite → stays DECLINE, knockout in audit     [OK]")

# Multiple hard knockouts fire → first-encountered (DSCR) wins
s = score_credit(
    dict(r_mer, dscr=0.5, debtToEbitda=8.0, ltv=1.2, ocf=-100),
    MERIDIAN,
)
assert s["knockout"] == {"type": "hard", "reason": "DSCR below 1.0× — cannot service debt"}
print("  Multiple hard triggers    → DSCR fires first-wins                            [OK]")

# LTV=None (unsecured facility) → LTV knockout does NOT fire
s = score_credit(dict(r_mer, ltv=None), MERIDIAN)
assert s["knockout"] is None, s["knockout"]
assert s["decision"] == "APPROVE"
print("  LTV=None (unsecured)      → no LTV knockout, decision unchanged              [OK]")

# HTTP round-trip: response includes knockout + factor max fields
router_mod.extract_financials = _stub_returning(CASCADE)
r_ko = client.post("/api/analyze", json={"text": "Cascade knockout HTTP round-trip, more than forty chars."})
assert r_ko.status_code == 200
http_data = r_ko.json()
assert http_data["knockout"] == {"type": "hard", "reason": "DSCR below 1.0× — cannot service debt"}
http_dscr = next(f for f in http_data["factors"] if f["key"] == "dscr")
assert http_dscr["max_positive"] == 20 and http_dscr["max_negative"] == -25
print("  POST /api/analyze response includes knockout + factor max fields             [OK]")

# GET /api/analyses/{id} → knockout is hydrated at read time from persisted ratios
persisted = client.get(f"/api/analyses/{http_data['id']}").json()
assert persisted["knockout"] == {"type": "hard", "reason": "DSCR below 1.0× — cannot service debt"}
persisted_dscr = next(f for f in persisted["factors"] if f["key"] == "dscr")
assert persisted_dscr["max_positive"] == 20
print("  GET /api/analyses/{id}  → knockout re-hydrated at read time                  [OK]")

router_mod.extract_financials = fake_extract


print("\nALL CHECKS PASSED ✅")
