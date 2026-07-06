import type { components } from "./types";

export type AnalysisResult = components["schemas"]["AnalysisResult"];
export type AnalysisSummary = components["schemas"]["AnalysisSummary"];
export type Decision = AnalysisResult["decision"];
export type OfficerAction = "CONFIRMED" | "OVERRIDDEN";
export type BorrowerSummary = components["schemas"]["BorrowerSummary"];
export type BorrowerDetail = components["schemas"]["BorrowerDetail"];
export type BorrowerCreate = components["schemas"]["BorrowerCreate"];
export type FileSummary = components["schemas"]["FileSummary"];

const API_BASE = import.meta.env.VITE_API_BASE.replace(/\/+$/, "");

// ------------------------------- direct analyze -------------------------------

/**
 * POST /api/analyze — the whole pipeline in one call. Sends the loan file text
 * and returns the typed analysis (decision, score, ratios, flags, factors, memo).
 *
 * Surfaces the backend's `detail` message on 422 / 502 so we get a useful error
 * instead of "Request failed 422".
 */
export async function analyze(text: string): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as AnalysisResult;
}

/**
 * POST /api/analyze (multipart) — companion path for PDF uploads. Sends one or
 * more PDF files (native Claude document input on the server) and an optional
 * text supplement, returning the same `AnalysisResult` shape.
 *
 * Deliberately DOES NOT set Content-Type — the browser fills in
 * "multipart/form-data; boundary=…" itself, and hand-setting the header would
 * drop the boundary and break the server-side parser.
 */
export async function analyzeFiles(
  files: File[],
  textSupplement?: string,
): Promise<AnalysisResult> {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  if (textSupplement) form.append("text", textSupplement);

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as AnalysisResult;
}

// -------------------------------- history -------------------------------------

export type ListAnalysesOptions = {
  decision?: Decision;
  unattached?: boolean;
  limit?: number;
};

/** GET /api/analyses with optional filters. Feeds the Under review + Declined queues. */
export async function listAnalyses(
  opts: ListAnalysesOptions = {},
): Promise<AnalysisSummary[]> {
  const qs = new URLSearchParams();
  if (opts.decision) qs.set("decision", opts.decision);
  if (opts.unattached !== undefined) qs.set("unattached", String(opts.unattached));
  if (opts.limit !== undefined) qs.set("limit", String(opts.limit));
  const suffix = qs.toString() ? `?${qs}` : "";

  const res = await fetch(`${API_BASE}/api/analyses${suffix}`);
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as AnalysisSummary[];
}

/** GET /api/analyses/{id} — the full six-panel data. */
export async function getAnalysis(id: string): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyses/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as AnalysisResult;
}

// ------------------------------- borrowers -----------------------------------

/** POST /api/borrowers — create a borrower manually. */
export async function createBorrower(
  payload: BorrowerCreate,
): Promise<BorrowerSummary> {
  const res = await fetch(`${API_BASE}/api/borrowers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as BorrowerSummary;
}

/** GET /api/borrowers — list with rollups (file count, analysis count, latest verdict). */
export async function listBorrowers(): Promise<BorrowerSummary[]> {
  const res = await fetch(`${API_BASE}/api/borrowers`);
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as BorrowerSummary[];
}

/**
 * GET /api/borrowers/{id} — full detail (files + analyses newest-first).
 * Callers should catch `NotFoundError` to render the "borrower not found"
 * fallback state on a stale hash link.
 */
export async function getBorrower(id: string): Promise<BorrowerDetail> {
  const res = await fetch(`${API_BASE}/api/borrowers/${encodeURIComponent(id)}`);
  if (res.status === 404) throw new NotFoundError("Borrower not found.");
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as BorrowerDetail;
}

/** POST /api/borrowers/{id}/files — multipart upload; returns per-file metadata. */
export async function uploadBorrowerFiles(
  borrowerId: string,
  files: File[],
): Promise<FileSummary[]> {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  const res = await fetch(
    `${API_BASE}/api/borrowers/${encodeURIComponent(borrowerId)}/files`,
    { method: "POST", body: form },
  );
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as FileSummary[];
}

/**
 * POST /api/borrowers/{id}/analyze — feeds the selected stored files into the
 * pipeline. `file_ids` order controls the order Claude sees them in the
 * extraction prompt, so the caller should hand these over in a meaningful
 * order (RunAnalysisModal uses uploaded_at ASC — chronological upload order
 * matches natural reading order for most cases).
 */
export async function analyzeBorrower(
  borrowerId: string,
  fileIds: string[],
): Promise<AnalysisResult> {
  const res = await fetch(
    `${API_BASE}/api/borrowers/${encodeURIComponent(borrowerId)}/analyze`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_ids: fileIds }),
    },
  );
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as AnalysisResult;
}

// ------------------------------ oversight -------------------------------------

/**
 * POST /api/analyses/{id}/oversight — records the officer's action
 * (CONFIRMED or OVERRIDDEN) as metadata on the analysis. The scorecard's
 * decision + score are never mutated — this is Article 14 metadata layered
 * on top. Returns the updated AnalysisResult with the three officer_*
 * fields populated, which the caller uses to drive its result state.
 *
 * `note` is required server-side for OVERRIDDEN (422 on empty/whitespace).
 * HumanOversight gates the button client-side too, so this rarely surfaces.
 */
export async function submitOversight(
  analysisId: string,
  action: OfficerAction,
  note?: string,
): Promise<AnalysisResult> {
  const res = await fetch(
    `${API_BASE}/api/analyses/${encodeURIComponent(analysisId)}/oversight`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: note ?? null }),
    },
  );
  if (!res.ok) throw new Error(await extractErrorMessage(res));
  return (await res.json()) as AnalysisResult;
}

// -------------------------------- errors --------------------------------------

/** Thrown by getBorrower when the borrower id doesn't exist — lets BorrowerDetail
 * render its "borrower not found" fallback instead of an ErrorState toast. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const first = body.detail[0] as { msg?: string };
      if (typeof first.msg === "string") return first.msg;
    }
  } catch {
    // fall through
  }
  return `Request failed with status ${res.status}`;
}
