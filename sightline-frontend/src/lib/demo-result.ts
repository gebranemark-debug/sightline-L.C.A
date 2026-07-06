import type { AnalysisResult } from "../api/client";

// A frozen snapshot of what the deployed backend returns for the Cascade
// sample. Rendered on first page load so the right column is populated
// before the user has clicked Analyse — the app never lands on an empty
// canvas. Cleared as soon as the user picks a different sample tab, at
// which point a real backend call replaces it when they hit Analyse.

export const DEMO_RESULT: AnalysisResult = {
  id: "demo-cascade",
  created_at: "2026-07-04T08:46:17.012113Z",
  company: "Cascade Home Retail Ltd.",
  loan_request: 300000,
  decision: "DECLINE",
  score: 0,
  financials: {},
  ratios: {
    dscr: 0.5,
    debtToEbitda: 7.5,
    debtToEquity: 3.21,
    currentRatio: 0.95,
    quickRatio: 0.52,
    netMargin: -0.0138,
    revenueGrowth: 0.1837,
    receivablesGrowth: 0.8611,
    dso: 84.3,
    dio: 92.8,
    dpo: 119.6,
    ccc: 57.6,
    ocf: -120000,
    // Cascade is an unsecured working-capital revolver — no collateral,
    // so LTV is null and renders "—" in the grid.
    ltv: null,
  },
  flags: [
    { sev: "high", text: "DSCR of 0.50× — cash flow does not cover debt service" },
    { sev: "high", text: "Operating cash flow is negative" },
    { sev: "high", text: "Net loss for the year" },
    { sev: "high", text: "Leverage of 7.50× Debt/EBITDA is very high" },
    { sev: "med",  text: "Current ratio of 0.95× — short-term liabilities exceed current assets" },
    { sev: "high", text: "Receivables up 86.1% vs revenue 18.4% — possible collection issue or channel stuffing" },
  ],
  factors: [
    { key: "dscr",          label: "Debt service coverage (DSCR)",   value: "0.50×",         points: -25 },
    { key: "lev",           label: "Leverage (Debt/EBITDA)",         value: "7.50×",         points: -20 },
    { key: "liq",           label: "Liquidity (current ratio)",      value: "0.95×",         points: -12 },
    { key: "ccc",           label: "Cash conversion cycle",          value: "58d",           points:   4 },
    { key: "margin",        label: "Net margin",                     value: "-1.4%",         points: -18 },
    { key: "growth",        label: "Growth quality (AR vs revenue)", value: "86.1% / 18.4%", points: -15 },
    { key: "ocf",           label: "Operating cash flow",            value: "Negative",      points: -18 },
    { key: "concentration", label: "Customer concentration",         value: "—",             points:   0 },
    { key: "ltv",           label: "Loan-to-value (Debt/Collateral)", value: "—",            points:   0 },
  ],
  counterfactual:
    "Largest drag: debt service coverage (DSCR). Raising DSCR above 1.25× would add roughly +37 points (to about 37/100).",
  memo:
    "**Recommendation:** DECLINE. Credit score 0/100.\n\n" +
    "**Executive summary:** Cascade Home Retail Ltd. is a growing home retail business posting 18.4% revenue growth but operating at a net loss with negative operating cash flow and severe leverage. Despite topline momentum, the company cannot service existing debt from operations, and the quality of that growth is questionable. On the metrics presented, the application does not meet minimum credit standards.\n\n" +
    "**Cash flow & debt capacity:** DSCR of 0.50× is the decisive constraint. Operating cash flow of €-120,000 means the business consumes cash rather than generating it. The 58-day cash conversion cycle (DSO 84d, DIO 93d, DPO 120d) shows the company is reliant on stretching suppliers to 120 days.\n\n" +
    "**Key risks:** Leverage of 7.50× Debt/EBITDA and Debt/Equity of 3.21× indicate over-gearing. Liquidity is inadequate. Most concerning, receivables grew 86.1% against 18.4% revenue growth — consistent with deteriorating collections or channel stuffing.\n\n" +
    "**Conditions & follow-up questions:**\n" +
    "- What explains receivables growing 86.1% against 18.4% revenue growth, and can management provide an aged receivables ledger?\n" +
    "- Are 120-day supplier terms contractual and sustainable?\n" +
    "- What concrete equity injection or restructuring plan exists to bring DSCR above 1.0×?",
};
