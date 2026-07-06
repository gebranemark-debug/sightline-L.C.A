import type { components } from "./types";

export type AnalysisResult = components["schemas"]["AnalysisResult"];
export type AnalysisSummary = components["schemas"]["AnalysisSummary"];

const API_BASE = import.meta.env.VITE_API_BASE.replace(/\/+$/, "");

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
