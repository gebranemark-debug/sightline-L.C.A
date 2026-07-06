// Three sample loan files hand-picked to hit each decision band on the
// deterministic scorecard: Meridian → APPROVE, Cascade → DECLINE,
// Aurora → REVIEW. Exact text lives here (not the artifact) so the tabs are
// self-contained and any future edits happen in one place.

export type SampleKey = "meridian" | "cascade" | "aurora";

export type Sample = {
  key: SampleKey;
  label: string;
  tag: string;
  text: string;
};

export const SAMPLES: Sample[] = [
  {
    key: "meridian",
    label: "Meridian",
    tag: "Healthy",
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
Operating cash flow: 450,000

COLLATERAL
Facility is secured on the existing fleet, most recently appraised at EUR 1,800,000.`,
  },
  {
    key: "cascade",
    label: "Cascade",
    tag: "Distressed",
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
  {
    key: "aurora",
    label: "Aurora",
    tag: "Borderline",
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

Order book steady; one automotive client represents 38% of revenue (concentration risk).

COLLATERAL
Facility is secured on the existing machinery and CNC equipment, appraised at EUR 1,600,000.`,
  },
];

export const DEFAULT_SAMPLE_KEY: SampleKey = "cascade";
