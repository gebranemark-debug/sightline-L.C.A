import React, { useState } from "react";
import {
  ScrollText, FileText, Calculator, ShieldCheck, AlertTriangle,
  CheckCircle2, XCircle, CircleDot, Loader2, ArrowRight, Sparkles,
} from "lucide-react";

/* =========================================================================
   Sightline — Reference Artifact (v2, tuned to real backend)
   Purpose: this file is the visual North Star for the multi-file frontend
     implementation. Palette, layout, composition, motion — all here.
     DO NOT port this file literally. It's a single-file mock with inline
     styles; the real app should use CONTRACT.md tokens via Tailwind 4
     @theme utilities and split into components.
   Panels shown, in vertical order in the results column:
     1. Decision header card (colored border, big serif, mono score)
     2. Explainability panel — factor bars with signed points + counterfactual
     3. Ratios grid (2x3, DSCR emphasized in gold)
     4. Red flags list (severity dots)
     5. Credit memo (serif prose, bold section labels)
     6. Human oversight checkpoint (confirm / override)
   The left column: sample borrower tabs, textarea, Analyze button,
     four-step pipeline indicator.
   ========================================================================= */

const C = {
  canvas: "#0A2E30", panel: "#0F3B3F", panel2: "#123F44", raised: "#15474C",
  line: "#1E5257", ink: "#EAF2F1", sub: "#A8C6C6", muted: "#7FA3A3",
  gold: "#E0A83A", goldSoft: "#F0D9A8",
  green: "#43B581", amber: "#E0A83A", red: "#E5674E",
};
const serif = "Georgia, 'Times New Roman', serif";
const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const eur = (n) => (n == null ? "—" : "\u20AC" + Math.round(n).toLocaleString("en-US"));
const x1 = (n) => (n == null || !isFinite(n) ? "—" : n.toFixed(2) + "\u00D7");
const pct = (n) => (n == null || !isFinite(n) ? "—" : (n * 100).toFixed(1) + "%");
const days = (n) => (n == null || !isFinite(n) ? "—" : Math.round(n) + "d");

/* ---- sample borrower loan files (three deliberately hitting DECLINE/REVIEW/APPROVE) ---- */
const SAMPLES = {
  meridian: {
    tag: "Healthy", tagColor: C.green,
    label: "Meridian",
    text: `LOAN APPLICATION — Meridian Freight & Logistics SARL
Requested facility: EUR 250,000 (fleet expansion, 5-year amortising)
Sector: Road freight & 3PL logistics. Founded 2016. 34 employees.

INCOME STATEMENT (EUR)
Revenue FY2024: 4,200,000 | FY2023: 3,600,000
COGS FY2024: 2,940,000
EBITDA FY2024: 620,000 | FY2023: 480,000
Net income FY2024: 290,000
Interest expense: 85,000

BALANCE SHEET (EUR, FY2024)
Cash: 380,000
AR FY2024: 620,000 | FY2023: 540,000
Inventory: 210,000
Current assets: 1,210,000
Current liabilities: 640,000
AP: 410,000
Total debt: 1,150,000 | Equity: 1,480,000

Annual debt service: 330,000
Operating cash flow: 450,000`,
  },
  cascade: {
    tag: "Distressed", tagColor: C.red,
    label: "Cascade",
    text: `LOAN APPLICATION — Cascade Home Retail Ltd
Requested facility: EUR 300,000 (working capital revolver)
Sector: Home furnishings retail. Founded 2011. 61 employees.

INCOME STATEMENT (EUR)
Revenue FY2024: 5,800,000 | FY2023: 4,900,000
COGS FY2024: 4,640,000
EBITDA FY2024: 180,000 | FY2023: 258,000
Net income FY2024: -80,000
Interest expense: 165,000

BALANCE SHEET (EUR, FY2024)
Cash: 90,000
AR FY2024: 1,340,000 | FY2023: 720,000
Inventory: 1,180,000
Current assets: 2,610,000
Current liabilities: 2,740,000
AP: 1,520,000
Total debt: 1,350,000 | Equity: 420,000

Annual debt service: 360,000
Operating cash flow: -120,000

Receivables and inventory both rose sharply; management cites a wholesale push into new B2B accounts.`,
  },
  aurora: {
    tag: "Borderline", tagColor: C.amber,
    label: "Aurora",
    text: `LOAN APPLICATION — Aurora Precision Manufacturing GmbH
Requested facility: EUR 200,000 (CNC equipment upgrade, 4-year term)
Sector: Precision metal components. Founded 2008. 28 employees.

INCOME STATEMENT (EUR)
Revenue FY2024: 3,100,000 | FY2023: 2,950,000
COGS FY2024: 2,170,000
EBITDA FY2024: 370,000 | FY2023: 345,000
Net income FY2024: 110,000
Interest expense: 95,000

BALANCE SHEET (EUR, FY2024)
Cash: 150,000
AR FY2024: 540,000 | FY2023: 500,000
Inventory: 480,000
Current assets: 1,170,000
Current liabilities: 890,000
AP: 420,000
Total debt: 1,280,000 | Equity: 940,000

Annual debt service: 310,000
Operating cash flow: 230,000

Order book steady; one automotive client represents 38% of revenue (concentration risk).`,
  },
};

/* ------ mocked results per borrower, so the artifact renders each realistically ------
   Real Sightline hits the backend and produces real analyses; these are display
   stand-ins so the design reference can show APPROVE, REVIEW, and DECLINE panels.
------------------------------------------------------------------------------------ */
const MOCKS = {
  meridian: {
    id: "mock-meridian",
    created_at: "2026-07-04T09:12:03.000000",
    company: "Meridian Freight & Logistics SARL",
    loan_request: 250000,
    decision: "APPROVE",
    score: 82,
    financials: {},
    ratios: {
      dscr: 1.88, debtToEbitda: 1.85, debtToEquity: 0.78,
      currentRatio: 1.89, quickRatio: 1.56,
      netMargin: 0.069, revenueGrowth: 0.167, receivablesGrowth: 0.148,
      dso: 53.9, dio: 26.1, dpo: 50.9, ccc: 29.1, ocf: 450000,
    },
    flags: [],
    factors: [
      { key: "dscr",   label: "Debt service coverage (DSCR)",   value: "1.88\u00D7",   points:  20 },
      { key: "lev",    label: "Leverage (Debt/EBITDA)",         value: "1.85\u00D7",   points:  10 },
      { key: "liq",    label: "Liquidity (current ratio)",      value: "1.89\u00D7",   points:   5 },
      { key: "ccc",    label: "Cash conversion cycle",          value: "29d",          points:   8 },
      { key: "margin", label: "Net margin",                     value: "6.9%",         points:   4 },
      { key: "growth", label: "Growth quality (AR vs revenue)", value: "14.8% / 16.7%", points:  6 },
      { key: "ocf",    label: "Operating cash flow",            value: "Positive",     points:   6 },
    ],
    counterfactual: null,
    memo:
      "**Recommendation:** APPROVE. Credit score 82/100.\n\n" +
      "**Executive summary:** Meridian Freight & Logistics SARL is a well-run road freight and 3PL business with strong revenue growth (+16.7%), healthy profitability, and comfortable debt capacity. All quantitative indicators support the requested \u20AC250,000 fleet expansion facility.\n\n" +
      "**Cash flow & debt capacity:** DSCR of 1.88\u00D7 comfortably exceeds the 1.25\u00D7 threshold. Operating cash flow of \u20AC450,000 is materially positive and covers debt service with meaningful headroom. The 29-day cash conversion cycle is tight — DSO 54d, DIO 26d, DPO 51d — reflecting efficient collections and disciplined working capital.\n\n" +
      "**Key risks:** No material flags. Leverage of 1.85\u00D7 Debt/EBITDA is well-contained, and the current ratio of 1.89\u00D7 leaves a comfortable liquidity cushion. Receivables growth (14.8%) is in line with revenue growth (16.7%), suggesting reported growth is being converted into cash.\n\n" +
      "**Conditions & follow-up questions:**\n" +
      "- Confirm the fleet expansion capex plan aligns with the 5-year amortising structure and residual value assumptions.\n" +
      "- What is the concentration on the two anchor 3-year contracts referenced in the file?\n" +
      "- Standard covenants: minimum DSCR 1.35\u00D7, maximum Debt/EBITDA 3.0\u00D7 — acceptable?",
  },

  cascade: {
    id: "215e943274ce496aa3e356a58d1ed927",
    created_at: "2026-07-04T08:46:17.012113",
    company: "Cascade Home Retail Ltd.",
    loan_request: 300000,
    decision: "DECLINE",
    score: 0,
    financials: {},
    ratios: {
      dscr: 0.5, debtToEbitda: 7.5, debtToEquity: 3.21,
      currentRatio: 0.95, quickRatio: 0.52,
      netMargin: -0.0138, revenueGrowth: 0.1837, receivablesGrowth: 0.8611,
      dso: 84.3, dio: 92.8, dpo: 119.6, ccc: 57.6, ocf: -120000,
    },
    flags: [
      { sev: "high", text: "DSCR of 0.50\u00D7 — cash flow does not cover debt service" },
      { sev: "high", text: "Operating cash flow is negative" },
      { sev: "high", text: "Net loss for the year" },
      { sev: "high", text: "Leverage of 7.50\u00D7 Debt/EBITDA is very high" },
      { sev: "med",  text: "Current ratio of 0.95\u00D7 — short-term liabilities exceed current assets" },
      { sev: "high", text: "Receivables up 86.1% vs revenue 18.4% — possible collection issue or channel stuffing" },
    ],
    factors: [
      { key: "dscr",   label: "Debt service coverage (DSCR)",   value: "0.50\u00D7",   points: -25 },
      { key: "lev",    label: "Leverage (Debt/EBITDA)",         value: "7.50\u00D7",   points: -20 },
      { key: "liq",    label: "Liquidity (current ratio)",      value: "0.95\u00D7",   points: -12 },
      { key: "ccc",    label: "Cash conversion cycle",          value: "58d",          points:   4 },
      { key: "margin", label: "Net margin",                     value: "-1.4%",        points: -18 },
      { key: "growth", label: "Growth quality (AR vs revenue)", value: "86.1% / 18.4%", points: -15 },
      { key: "ocf",    label: "Operating cash flow",            value: "Negative",     points: -18 },
    ],
    counterfactual:
      "Largest drag: debt service coverage (DSCR). Raising DSCR above 1.25\u00D7 would add roughly +37 points (to about 37/100).",
    memo:
      "**Recommendation:** DECLINE. Credit score 0/100.\n\n" +
      "**Executive summary:** Cascade Home Retail Ltd. is a growing home retail business posting 18.4% revenue growth but operating at a net loss with negative operating cash flow and severe leverage. Despite topline momentum, the company cannot service existing debt from operations, and the quality of that growth is questionable. On the metrics presented, the application does not meet minimum credit standards.\n\n" +
      "**Cash flow & debt capacity:** DSCR of 0.50\u00D7 is the decisive constraint. Operating cash flow of \u20AC-120,000 means the business consumes cash rather than generating it. The 58-day cash conversion cycle (DSO 84d, DIO 93d, DPO 120d) shows the company is reliant on stretching suppliers to 120 days.\n\n" +
      "**Key risks:** Leverage of 7.50\u00D7 Debt/EBITDA and Debt/Equity of 3.21\u00D7 indicate over-gearing. Liquidity is inadequate. Most concerning, receivables grew 86.1% against 18.4% revenue growth — consistent with deteriorating collections or channel stuffing.\n\n" +
      "**Conditions & follow-up questions:**\n" +
      "- What explains receivables growing 86.1% against 18.4% revenue growth, and can management provide an aged receivables ledger?\n" +
      "- Are 120-day supplier terms contractual and sustainable?\n" +
      "- What concrete equity injection or restructuring plan exists to bring DSCR above 1.0\u00D7?",
  },

  aurora: {
    id: "mock-aurora",
    created_at: "2026-07-04T09:15:44.000000",
    company: "Aurora Precision Manufacturing GmbH",
    loan_request: 200000,
    decision: "REVIEW",
    score: 55,
    financials: {},
    ratios: {
      dscr: 1.19, debtToEbitda: 3.46, debtToEquity: 1.36,
      currentRatio: 1.31, quickRatio: 0.78,
      netMargin: 0.0355, revenueGrowth: 0.051, receivablesGrowth: 0.08,
      dso: 63.6, dio: 80.7, dpo: 70.6, ccc: 73.7, ocf: 230000,
    },
    flags: [
      { sev: "med", text: "DSCR of 1.19\u00D7 sits just below the 1.25\u00D7 comfort threshold" },
      { sev: "med", text: "Customer concentration: one client represents 38% of revenue" },
    ],
    factors: [
      { key: "dscr",   label: "Debt service coverage (DSCR)",   value: "1.19\u00D7",  points:   0 },
      { key: "lev",    label: "Leverage (Debt/EBITDA)",         value: "3.46\u00D7",  points:  -5 },
      { key: "liq",    label: "Liquidity (current ratio)",      value: "1.31\u00D7",  points:   0 },
      { key: "ccc",    label: "Cash conversion cycle",          value: "74d",         points:   0 },
      { key: "margin", label: "Net margin",                     value: "3.5%",        points:   0 },
      { key: "growth", label: "Growth quality (AR vs revenue)", value: "8.0% / 5.1%", points:   6 },
      { key: "ocf",    label: "Operating cash flow",            value: "Positive",    points:   6 },
    ],
    counterfactual:
      "Closest lever: raising DSCR above 1.25\u00D7 would add roughly +12 points (to about 67/100 — approve).",
    memo:
      "**Recommendation:** REVIEW. Credit score 55/100.\n\n" +
      "**Executive summary:** Aurora Precision Manufacturing GmbH is a stable but modestly-performing precision components business. Fundamentals are borderline: profitability and cash flow are positive, but DSCR sits just below comfort, leverage is elevated, and a single automotive client represents 38% of revenue. Recommend REVIEW rather than direct approval — the deal is defensible with the right structure.\n\n" +
      "**Cash flow & debt capacity:** DSCR of 1.19\u00D7 covers debt service but with no cushion. Operating cash flow of \u20AC230,000 is positive but the 74-day cash conversion cycle is longer than we'd like given the working-capital-heavy nature of precision manufacturing.\n\n" +
      "**Key risks:** Leverage of 3.46\u00D7 Debt/EBITDA is elevated; adding a further \u20AC200,000 facility pushes total exposure to a level that leaves little room for margin compression. The 38% customer concentration is the most material qualitative risk — loss of that anchor client would immediately impair debt service.\n\n" +
      "**Conditions & follow-up questions:**\n" +
      "- Length and structure of the automotive anchor contract, and any diversification plan.\n" +
      "- Can the facility be structured with a personal guarantee from ownership and a DSCR covenant of 1.25\u00D7?\n" +
      "- Latest management accounts (interim) to confirm the trend is holding.",
  },
};

/* --------------------- UI primitives (inline-styled, mock only) ------------ */
const decisionColor = (d) => (d === "APPROVE" ? C.green : d === "REVIEW" ? C.amber : C.red);
const DecisionIcon = ({ d, size = 24 }) =>
  d === "APPROVE" ? <CheckCircle2 size={size} /> :
  d === "DECLINE" ? <XCircle size={size} /> : <AlertTriangle size={size} />;

function Panel({ title, icon, accent, children, id }) {
  return (
    <div id={id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14 }} className="p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: accent || C.gold }}>{icon}</span>
        <h3 style={{ fontFamily: serif, color: C.ink, fontSize: 16, letterSpacing: 0.2 }} className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function FactorBar({ points }) {
  const mag = Math.min(Math.abs(points) / 25, 1) * 50;
  const positive = points >= 0;
  return (
    <div className="relative rounded" style={{ height: 22, background: C.canvas, border: `1px solid ${C.line}` }}>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.line }} />
      <div style={{
        position: "absolute", top: 3, bottom: 3,
        left: positive ? "50%" : `${50 - mag}%`, width: `${mag}%`,
        background: positive ? C.green : C.red, opacity: 0.85, borderRadius: 3,
      }} />
      <span style={{
        position: "absolute", top: 2, right: positive ? 8 : "auto", left: positive ? "auto" : 8,
        fontFamily: mono, fontSize: 12, color: C.ink,
      }}>{points >= 0 ? "+" + points : points}</span>
    </div>
  );
}

function Ratio({ label, value, hint, emphasize }) {
  return (
    <div className="rounded-lg p-3" style={{
      background: emphasize ? C.raised : C.panel2,
      border: `1px solid ${emphasize ? C.gold : C.line}`,
    }}>
      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontFamily: mono, color: emphasize ? C.goldSoft : C.ink, fontSize: 20 }} className="mt-1">{value}</div>
      {hint && <div style={{ color: C.muted, fontSize: 11 }} className="mt-1">{hint}</div>}
    </div>
  );
}

// Render **bold** segments as gold-serif <strong>, everything else as plain text.
// Bold segments are safe inside bullets — we strip the leading "- " on the raw
// line first, then parse, so no React element ever gets String()-coerced.
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, j) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={j} style={{ color: C.goldSoft, fontFamily: serif }}>{p.slice(2, -2)}</strong>
      : <span key={j}>{p}</span>
  );
}

function Memo({ text }) {
  const render = (line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} style={{ height: 8 }} />;

    const isBullet = trimmed.startsWith("-");
    const body = isBullet ? trimmed.replace(/^-\s*/, "") : line;

    return (
      <p key={i} style={{
        color: C.sub, fontSize: 13.5, lineHeight: 1.65,
        paddingLeft: isBullet ? 14 : 0,
      }} className="mb-1">
        {isBullet && <span style={{ color: C.gold, marginLeft: -14, marginRight: 6 }}>›</span>}
        {renderInline(body)}
      </p>
    );
  };
  return <div>{text.split("\n").map(render)}</div>;
}

const StepRow = ({ state, label }) => (
  <div className="flex items-center gap-2" style={{ opacity: state === "wait" ? 0.4 : 1 }}>
    {state === "done" ? <CheckCircle2 size={15} style={{ color: C.green }} />
      : state === "run" ? <Loader2 size={15} style={{ color: C.gold }} className="animate-spin" />
      : <CircleDot size={15} style={{ color: C.muted }} />}
    <span style={{ color: state === "done" ? C.sub : C.muted, fontSize: 12.5 }}>{label}</span>
  </div>
);

/* -------------------------------- main ------------------------------------ */
export default function App() {
  const [sampleKey, setSampleKey] = useState("cascade");
  const [docText, setDocText] = useState(SAMPLES.cascade.text);
  const [phase, setPhase] = useState("done"); // idle | running | done
  const [steps, setSteps] = useState({ extract: "done", compute: "done", decide: "done", memo: "done" });
  const [result, setResult] = useState(MOCKS.cascade);
  const [officer, setOfficer] = useState(null);

  const pickSample = (k) => {
    setSampleKey(k);
    setDocText(SAMPLES[k].text);
    setResult(null);
    setPhase("idle");
    setOfficer(null);
    setSteps({ extract: "wait", compute: "wait", decide: "wait", memo: "wait" });
  };

  const run = () => {
    setPhase("running"); setResult(null); setOfficer(null);
    const seq = ["extract", "compute", "decide", "memo"];
    seq.forEach((s, i) => {
      setTimeout(() => setSteps((prev) => ({ ...prev, [s]: "run" })), i * 400);
      setTimeout(() => setSteps((prev) => ({ ...prev, [s]: "done" })), (i + 1) * 400);
    });
    // Load the mock that matches the currently-selected borrower.
    setTimeout(() => { setResult(MOCKS[sampleKey]); setPhase("done"); }, seq.length * 400 + 100);
  };

  return (
    <div style={{ background: C.canvas, minHeight: 700, fontFamily: sans, color: C.ink }} className="p-4 sm:p-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ScrollText size={22} color={C.canvas} />
          </div>
          <div>
            <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, letterSpacing: 0.3 }}>Sightline</div>
            <div style={{ color: C.muted, fontSize: 12 }}>SME credit copilot — explainable by design</div>
          </div>
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 999, color: C.sub, fontSize: 11.5 }} className="px-3 py-1.5 flex items-center gap-1.5">
          <ShieldCheck size={13} style={{ color: C.gold }} /> Explainable · human-in-the-loop · EU AI Act ready
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* --- left: input --- */}
        <div className="lg:col-span-2">
          <Panel title="Loan file" icon={<FileText size={18} />}>
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(SAMPLES).map(([k, s]) => (
                <button key={k} onClick={() => pickSample(k)}
                  style={{
                    fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                    background: sampleKey === k ? C.gold : "transparent",
                    color: sampleKey === k ? C.canvas : C.sub,
                    border: `1px solid ${sampleKey === k ? C.gold : C.line}`,
                  }}>
                  {s.label} <span style={{ opacity: 0.7 }}>· {s.tag}</span>
                </button>
              ))}
            </div>
            <textarea value={docText} onChange={(e) => setDocText(e.target.value)}
              spellCheck={false}
              style={{
                width: "100%", height: 260, resize: "vertical", background: C.canvas, color: C.sub,
                border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontFamily: mono, fontSize: 11.5, lineHeight: 1.5,
              }} />
            <button onClick={run} disabled={phase === "running"}
              style={{
                marginTop: 12, width: "100%", padding: "12px 16px", borderRadius: 10, border: "none",
                background: phase === "running" ? C.raised : C.gold, color: C.canvas, fontWeight: 700, fontSize: 14,
                cursor: phase === "running" ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
              {phase === "running" ? <><Loader2 size={16} className="animate-spin" /> Analysing…</> : <><Sparkles size={16} /> Analyse file</>}
            </button>

            <div className="mt-4 grid grid-cols-2 gap-y-2 gap-x-3" style={{ paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              <StepRow state={steps.extract} label="Extract financials (LLM)" />
              <StepRow state={steps.compute} label="Compute ratios (code)" />
              <StepRow state={steps.decide}  label="Score decision (code)" />
              <StepRow state={steps.memo}    label="Draft memo (LLM)" />
            </div>
          </Panel>

          <div style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.6, padding: "0 4px" }}>
            The model reads the file and writes the memo. Every ratio, red flag, and the decision itself are computed in code —
            so the numbers are exact and the reasoning is auditable. Figures shown are synthetic.
          </div>
        </div>

        {/* --- right: results --- */}
        <div className="lg:col-span-3">
          {!result && phase !== "running" && (
            <div style={{ border: `1px dashed ${C.line}`, borderRadius: 14, color: C.muted }} className="h-full flex flex-col items-center justify-center text-center p-10" >
              <ScrollText size={30} style={{ color: C.line }} />
              <p style={{ fontSize: 14, marginTop: 12, maxWidth: 320 }}>
                Pick a borrower on the left and hit Analyse. You'll get a scored decision, the factors behind it, and a drafted credit memo.
              </p>
            </div>
          )}
          {phase === "running" && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, color: C.muted }} className="h-full flex flex-col items-center justify-center text-center p-10">
              <Loader2 size={26} className="animate-spin" style={{ color: C.gold }} />
              <p style={{ fontSize: 13.5, marginTop: 12 }}>Reading the file, running the numbers, drafting the memo…</p>
            </div>
          )}

          {result && (
            <>
              {/* 1. Decision header */}
              <div style={{ background: C.panel, border: `1px solid ${decisionColor(result.decision)}`, borderRadius: 14 }} className="p-5 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span style={{ color: decisionColor(result.decision) }}><DecisionIcon d={result.decision} size={26} /></span>
                    <div>
                      <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, color: decisionColor(result.decision) }}>
                        {result.decision}
                      </div>
                      <div style={{ color: C.muted, fontSize: 12.5 }}>{result.company} · requests {eur(result.loan_request)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div style={{ fontFamily: mono, fontSize: 30, color: C.ink, lineHeight: 1 }}>{result.score}<span style={{ fontSize: 15, color: C.muted }}>/100</span></div>
                    <div style={{ color: C.muted, fontSize: 11 }}>risk score</div>
                  </div>
                </div>
              </div>

              {/* 2. Explainability */}
              <Panel title="Why — decision factors" icon={<Calculator size={18} />}>
                <div className="flex flex-col gap-2.5">
                  {result.factors.map((f) => (
                    <div key={f.key} className="grid items-center gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <div>
                        <div style={{ color: C.sub, fontSize: 12.5 }}>{f.label}</div>
                        <div style={{ color: C.muted, fontFamily: mono, fontSize: 11.5 }}>{f.value}</div>
                      </div>
                      <FactorBar points={f.points} />
                    </div>
                  ))}
                </div>
                {result.counterfactual && (
                  <div className="mt-4" style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ color: C.goldSoft, fontSize: 12.5, lineHeight: 1.55 }}>{result.counterfactual}</div>
                  </div>
                )}
              </Panel>

              {/* 3. Ratios */}
              <Panel title="Cash flow & ratios" icon={<Calculator size={18} />}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <Ratio label="DSCR" value={x1(result.ratios.dscr)} hint="healthy ≥ 1.25×" emphasize />
                  <Ratio label="Debt / EBITDA" value={x1(result.ratios.debtToEbitda)} hint="lower is safer" />
                  <Ratio label="Current ratio" value={x1(result.ratios.currentRatio)} hint="≥ 1.5× comfortable" />
                  <Ratio label="Net margin" value={pct(result.ratios.netMargin)} hint="profitability" />
                  <Ratio label="Cash conv. cycle" value={days(result.ratios.ccc)} hint={`DSO ${days(result.ratios.dso)} · DPO ${days(result.ratios.dpo)}`} />
                  <Ratio label="Op. cash flow" value={eur(result.ratios.ocf)} hint={result.ratios.ocf >= 0 ? "positive" : "negative"} />
                </div>
              </Panel>

              {/* 4. Flags */}
              <Panel title={`Red flags (${result.flags.length})`} icon={<AlertTriangle size={18} />} accent={result.flags.length ? C.red : C.green}>
                {result.flags.length === 0 ? (
                  <div style={{ color: C.green, fontSize: 13 }} className="flex items-center gap-2"><CheckCircle2 size={15} /> No material flags detected.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {result.flags.map((fl, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span style={{ width: 8, height: 8, borderRadius: 999, marginTop: 6, background: fl.sev === "high" ? C.red : C.amber, flexShrink: 0 }} />
                        <span style={{ color: C.sub, fontSize: 13, lineHeight: 1.5 }}>{fl.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* 5. Memo */}
              <Panel title="Credit memo" icon={<ScrollText size={18} />}>
                <Memo text={result.memo} />
              </Panel>

              {/* 6. Human oversight */}
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14 }} className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={18} style={{ color: C.gold }} />
                  <h3 style={{ fontFamily: serif, color: C.ink, fontSize: 16 }} className="font-semibold">Human oversight</h3>
                </div>
                <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, marginBottom: 12 }}>
                  Under the EU AI Act (Article 14), a credit officer must review and be able to override the model. This is the checkpoint.
                </p>
                {officer ? (
                  <div style={{ color: officer === "approved" ? C.green : C.amber, fontSize: 13 }} className="flex items-center gap-2">
                    <CheckCircle2 size={15} /> {officer === "approved" ? "Decision confirmed by credit officer." : "Officer overrode the recommendation — routed to committee."}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setOfficer("approved")}
                      style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: C.green, color: C.canvas, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      <CheckCircle2 size={15} /> Confirm decision
                    </button>
                    <button onClick={() => setOfficer("overridden")}
                      style={{ padding: "9px 14px", borderRadius: 9, background: "transparent", color: C.sub, border: `1px solid ${C.line}`, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      <ArrowRight size={15} /> Override & escalate
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
