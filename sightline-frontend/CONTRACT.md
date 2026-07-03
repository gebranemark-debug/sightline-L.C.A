# Sightline Frontend Contract

## Backend
Base URL (production): https://sightline-lca-production.up.railway.app
Base URL (local dev):  http://localhost:8000
OpenAPI spec:          {base}/openapi.json
Interactive docs:      {base}/docs

## API endpoints

### POST /api/analyze
Request: { "text": string }   // required, min length 40
Response 200: AnalysisResult
Response 422: { "detail": string | ValidationErrorList }  // input too short / invalid
Response 502: { "detail": string }                        // LLM call failed

### GET /api/analyses
Response 200: AnalysisSummary[]

### GET /api/analyses/{id}
Response 200: AnalysisResult
Response 404: { "detail": string }

### GET /api/health
Response 200: { "status": "ok" }

## Data shapes (canonical — auto-generated in src/api/types.ts)

AnalysisResult {
  id: string
  created_at: string           // ISO datetime
  company: string
  loan_request: number | null
  decision: "APPROVE" | "REVIEW" | "DECLINE"
  score: number                 // 0..100
  financials: Record<string, number | null>
  ratios: {
    dscr, debtToEbitda, debtToEquity, currentRatio, quickRatio,
    netMargin, revenueGrowth, receivablesGrowth,
    dso, dio, dpo, ccc, ocf: number | null
  }
  flags: Array<{ sev: "high" | "med", text: string }>
  factors: Array<{ key: string, label: string, value: string, points: number }>
  counterfactual: string | null
  memo: string                  // markdown, uses **bold** for section headers
}

AnalysisSummary {
  id, created_at, company, decision, score
}

## Frontend generates types from the spec
npm run gen:types   // runs openapi-typescript against $VITE_API_BASE/openapi.json

## Design tokens (the visual contract)

Palette
  canvas       #0A2E30    // page background
  panel        #0F3B3F    // primary card
  panel-alt    #123F44    // secondary card
  raised       #15474C    // emphasized card
  line         #1E5257    // borders/dividers on dark
  ink          #EAF2F1    // primary text on dark
  sub          #A8C6C6    // secondary text on dark
  muted        #7FA3A3    // tertiary/caption text
  off-white    #F7F9F9    // light surface
  gold         #E0A83A    // ONLY: primary CTA, emphasized DSCR, active state
  gold-soft    #F0D9A8    // gold text on dark
  decision-green  #43B581
  decision-amber  #E0A83A
  decision-red    #E5674E

Typography
  serif        Georgia, "Times New Roman", serif        // headings, decision, memo body
  sans         system-ui, -apple-system, "Segoe UI", Roboto  // body, labels
  mono         ui-monospace, "SF Mono", Menlo, Consolas  // ALL numbers (ratios, scores, currency)

Spacing / layout
  base unit 4px. Panel padding 20px. Between-panel gap 16px.
  Never < 8px between related elements, never > 32px between unrelated.

Motion
  Reserved for the pipeline (Extract → Compute → Decide → Memo) and result reveal.
  No animated backgrounds, gradients, or shimmer.

Rules that are non-negotiable
  - Numbers are always mono, always with a benchmark ("healthy ≥ 1.25×").
  - Gold is a signal color: primary CTA, hero DSCR metric, active state — nothing else.
  - Decision colors are reserved for decisions and flag severities.
  - Serif is authority (headings, memo). Sans is UI. Mono is data.
