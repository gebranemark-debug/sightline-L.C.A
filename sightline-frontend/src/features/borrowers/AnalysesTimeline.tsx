import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AnalysisResult, AnalysisSummary } from "../../api/client";
import { getAnalysis } from "../../api/client";
import { DecisionChip } from "../../components/DecisionChip";
import { ResultPanels } from "../result/ResultPanels";

type Props = {
  analyses: AnalysisSummary[];
};

// Timeline of past analyses on a borrower. Rows show date + decision chip +
// score; clicking expands the full six-panel result inline via getAnalysis(id).
export function AnalysesTimeline({ analyses }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<AnalysisResult | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedResult(null);
      return;
    }
    setExpandedId(id);
    setExpandedResult(null);
    setLoadingId(id);
    setError(null);
    try {
      setExpandedResult(await getAnalysis(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {analyses.map((a) => {
        const expanded = expandedId === a.id;
        return (
          <div key={a.id}>
            <button
              type="button"
              onClick={() => toggle(a.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel-alt p-3 text-left hover:border-gold"
            >
              <div className="flex min-w-0 items-center gap-2">
                {expanded ? (
                  <ChevronDown size={14} className="text-muted" />
                ) : (
                  <ChevronRight size={14} className="text-muted" />
                )}
                <div className="font-mono text-[11.5px] text-muted">
                  {new Date(a.created_at).toISOString().slice(0, 10)}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span className="font-mono text-sm text-ink">
                  {a.score}
                  <span className="text-[11px] text-muted">/100</span>
                </span>
                <DecisionChip decision={a.decision} />
              </div>
            </button>
            {expanded && (
              <div className="mt-2">
                {loadingId === a.id && (
                  <p className="text-xs text-muted">Loading…</p>
                )}
                {error && (
                  <p className="text-xs text-decision-red">{error}</p>
                )}
                {expandedResult && expandedResult.id === a.id && (
                  <ResultPanels
                    result={expandedResult}
                    onOversightUpdated={setExpandedResult}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
