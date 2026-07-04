import { useState } from "react";
import { analyze, type AnalysisResult } from "./api/client";

// Deliberately minimal styling — this is the "data flows" checkpoint.
// The designed panels (DecisionHeader, RatiosGrid, FlagsList, MemoPanel,
// HumanOversight) land in step 4 against the reference artifact.

export default function App() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function onAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await analyze(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !loading && text.trim().length >= 40;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-serif text-5xl text-ink">Sightline</h1>
      <p className="mt-2 text-sub">
        SME credit copilot — explainable by design.
      </p>

      <label className="mt-8 block text-sub text-sm" htmlFor="loan-file">
        Paste a loan file (min 40 characters):
      </label>
      <textarea
        id="loan-file"
        className="mt-2 block w-full h-64 p-3 rounded border border-line bg-panel text-ink font-mono text-sm"
        placeholder="Company name, revenue, EBITDA, current assets, total debt…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <button
        type="button"
        className="mt-3 px-4 py-2 rounded border border-ink text-ink font-sans disabled:opacity-40"
        onClick={onAnalyze}
        disabled={!canSubmit}
      >
        {loading ? "Loading…" : "Analyze"}
      </button>

      {error && (
        <p className="mt-4 font-mono text-sm text-decision-red">
          Error: {error}
        </p>
      )}

      {result && (
        <pre className="mt-8 p-4 rounded border border-line bg-panel text-ink font-mono text-xs whitespace-pre-wrap overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
