import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  AnalysisResult,
  AnalysisSummary,
  Decision,
} from "../../api/client";
import { getAnalysis, listAnalyses } from "../../api/client";
import { DecisionChip } from "../../components/DecisionChip";
import { ResultPanels } from "../result/ResultPanels";

type Props = {
  decision: Decision;
  emptyMessage: string;
};

// Reusable queue row list. Under review + Declined tabs are the two current
// callers. Row click expands the six-panel result inline via getAnalysis(id) —
// the summary schema doesn't carry the full detail, so the click triggers the
// fetch.
//
// Note on divergence from the reading-B spec: the row shows date + score +
// decision-chip but does NOT show "top flag" or "memo excerpt" because
// AnalysisSummary from the backend doesn't include those fields. Rendering
// them would require either extending AnalysisSummary (small backend change)
// or fetching each row's full detail eagerly (N+1). Flagged in the PR body.

export function QueueList({ decision, emptyMessage }: Props) {
  const [rows, setRows] = useState<AnalysisSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<AnalysisResult | null>(null);
  const [loadingRowId, setLoadingRowId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listAnalyses({
          decision,
          unattached: true,
          limit: 100,
        });
        if (!cancelled) setRows(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [decision]);

  async function toggle(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedResult(null);
      return;
    }
    setExpandedId(id);
    setExpandedResult(null);
    setLoadingRowId(id);
    setError(null);
    try {
      setExpandedResult(await getAnalysis(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRowId(null);
    }
  }

  if (error && !rows) {
    return (
      <div className="rounded-2xl border border-decision-red bg-panel p-5">
        <p className="font-mono text-sm text-muted">{error}</p>
      </div>
    );
  }

  if (rows === null) {
    return <div className="text-sm text-muted">Loading…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line p-10 text-center">
        <p className="text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((a) => {
        const expanded = expandedId === a.id;
        return (
          <div key={a.id}>
            <button
              type="button"
              onClick={() => toggle(a.id)}
              className="flex w-full items-start justify-between gap-3 rounded-xl border border-line bg-panel p-4 text-left transition-colors hover:border-gold"
            >
              <div className="flex min-w-0 items-start gap-2">
                {expanded ? (
                  <ChevronDown size={14} className="mt-1 text-muted" />
                ) : (
                  <ChevronRight size={14} className="mt-1 text-muted" />
                )}
                <div className="min-w-0">
                  <div className="font-serif text-lg text-ink">{a.company}</div>
                  <div className="font-mono text-[11.5px] text-muted">
                    {new Date(a.created_at).toISOString().slice(0, 10)}
                  </div>
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
                {loadingRowId === a.id && (
                  <p className="text-xs text-muted">Loading…</p>
                )}
                {error && expandedId === a.id && (
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
