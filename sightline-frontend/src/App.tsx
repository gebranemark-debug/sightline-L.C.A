import { useState } from "react";
import { ScrollText, ShieldCheck } from "lucide-react";
import { analyze, type AnalysisResult } from "./api/client";
import { InputPanel } from "./features/input/InputPanel";
import { DecisionHeader } from "./features/result/DecisionHeader";
import { FactorsPanel } from "./features/result/FactorsPanel";
import { RatiosGrid } from "./features/result/RatiosGrid";
import { FlagsList } from "./features/result/FlagsList";
import { MemoPanel } from "./features/result/MemoPanel";
import { HumanOversight } from "./features/result/HumanOversight";
import { EmptyState, ErrorState, RunningState } from "./features/result/States";

// Thin shell. All layout, state, and orchestration live here; every visual
// atom is in features/ or components/.

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function handleAnalyze(text: string) {
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

  function reset() {
    setResult(null);
    setError(null);
  }

  return (
    <div className="min-h-dvh bg-canvas p-4 font-sans text-ink sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold">
            <ScrollText size={22} className="text-canvas" />
          </div>
          <div>
            <div className="font-serif text-[22px] font-semibold tracking-wide">
              Sightline
            </div>
            <div className="text-xs text-muted">
              SME credit copilot — explainable by design
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11.5px] text-sub">
          <ShieldCheck size={13} className="text-gold" />
          Explainable · human-in-the-loop · EU AI Act ready
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <InputPanel
            onAnalyze={handleAnalyze}
            onReset={reset}
            loading={loading}
            hasResult={result !== null}
          />
        </div>

        <div className="lg:col-span-3">
          {!result && !loading && !error && <EmptyState />}
          {loading && <RunningState />}
          {error && !loading && <ErrorState message={error} />}
          {result && (
            <>
              <DecisionHeader result={result} />
              <FactorsPanel
                factors={result.factors}
                counterfactual={result.counterfactual}
              />
              <RatiosGrid ratios={result.ratios} />
              <FlagsList flags={result.flags} />
              <MemoPanel memo={result.memo} />
              <HumanOversight key={result.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
