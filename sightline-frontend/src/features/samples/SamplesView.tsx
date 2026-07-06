import { useRef, useState } from "react";
import type { AnalysisResult } from "../../api/client";
import { InputPanel } from "../input/InputPanel";
import { ResultPanels } from "../result/ResultPanels";
import { EmptyState, ErrorState, RunningState } from "../result/States";
import { DEMO_RESULT } from "../../lib/demo-result";

// Samples tab — the pre-existing single-page rendering, lifted verbatim out of
// App.tsx. No layout changes vs step 7. The backend auto-attaches APPROVE
// analyses to a borrower automatically; that's invisible from this surface
// (frontend does not add any client-side borrower logic here — see backend
// PR #13 for the rule).

type Runner = () => Promise<AnalysisResult>;

export function SamplesView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(DEMO_RESULT);
  const lastRunner = useRef<Runner | null>(null);

  async function runSubmit(runner: Runner) {
    lastRunner.current = runner;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runner());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function retry() {
    if (lastRunner.current) runSubmit(lastRunner.current);
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  const rightColumn = loading ? (
    <RunningState />
  ) : error ? (
    <ErrorState message={error} onRetry={retry} />
  ) : result ? (
    <ResultPanels result={result} />
  ) : (
    <EmptyState />
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <InputPanel
          onSubmit={runSubmit}
          onReset={reset}
          loading={loading}
          hasResult={result !== null}
        />
      </div>
      <div className="lg:col-span-3">{rightColumn}</div>
    </div>
  );
}
