import { useEffect, useMemo, useState } from "react";
import type { AnalysisResult, AnalysisSummary } from "../../api/client";
import { getAnalysis } from "../../api/client";
import { DecisionChip } from "../../components/DecisionChip";
import { Panel } from "../../components/Panel";
import { FactorsPanel } from "../result/FactorsPanel";

type Factor = AnalysisResult["factors"][number];

type Props = {
  analyses: AnalysisSummary[];
};

// Inline compare pane. Fetches both selected analyses in parallel, matches
// factors by `key`, and hands the delta list to FactorsPanel in variant="delta"
// mode. Missing factors on either side are skipped (don't render).

export function YoYCompare({ analyses }: Props) {
  // Newest-first (backend returns in that order, but re-sort defensively).
  const sorted = useMemo(
    () => [...analyses].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [analyses],
  );

  const [currentId, setCurrentId] = useState<string>(sorted[0]?.id ?? "");
  const [priorId, setPriorId] = useState<string>(sorted[1]?.id ?? "");
  const [current, setCurrent] = useState<AnalysisResult | null>(null);
  const [prior, setPrior] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchBoth() {
      if (!currentId || !priorId || currentId === priorId) {
        setCurrent(null);
        setPrior(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [c, p] = await Promise.all([
          getAnalysis(currentId),
          getAnalysis(priorId),
        ]);
        if (!cancelled) {
          setCurrent(c);
          setPrior(p);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchBoth();
    return () => {
      cancelled = true;
    };
  }, [currentId, priorId]);

  const deltas = useMemo<Factor[]>(() => {
    if (!current || !prior) return [];
    const priorByKey = new Map(prior.factors.map((f) => [f.key, f]));
    return current.factors
      .map<Factor | null>((f) => {
        const p = priorByKey.get(f.key);
        if (!p) return null;
        // Delta inherits the factor's static weight range so the FactorsPanel
        // sort (by total range) treats a delta row the same as an absolute
        // one — bigger-swing factors keep bubbling to the top.
        return {
          key: f.key,
          label: f.label,
          value: f.value,
          points: f.points - p.points,
          max_positive: f.max_positive,
          max_negative: f.max_negative,
        };
      })
      .filter((f): f is Factor => f !== null);
  }, [current, prior]);

  if (analyses.length < 2) return null;

  const priorDate = prior
    ? new Date(prior.created_at).toISOString().slice(0, 10)
    : "—";
  const scoreDelta = current && prior ? current.score - prior.score : 0;
  const sameSelection = currentId === priorId;

  return (
    <div className="mb-4">
      <Panel title="Year-over-year compare">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-sub">
            Prior{" "}
            <select
              value={priorId}
              onChange={(e) => setPriorId(e.target.value)}
              className="ml-1 rounded-md border border-line bg-canvas px-2 py-1 text-xs text-ink"
            >
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.created_at).toISOString().slice(0, 10)} ·{" "}
                  {a.decision} · {a.score}/100
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-sub">
            Current{" "}
            <select
              value={currentId}
              onChange={(e) => setCurrentId(e.target.value)}
              className="ml-1 rounded-md border border-line bg-canvas px-2 py-1 text-xs text-ink"
            >
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.created_at).toISOString().slice(0, 10)} ·{" "}
                  {a.decision} · {a.score}/100
                </option>
              ))}
            </select>
          </label>
        </div>

        {sameSelection && (
          <p className="mb-3 text-[12.5px] text-muted">
            Pick a different prior and current analysis to see the delta.
          </p>
        )}
        {error && (
          <p className="mb-3 text-[12.5px] text-decision-red">{error}</p>
        )}
        {loading && (
          <p className="mb-3 text-[12.5px] text-muted">Loading…</p>
        )}

        {current && prior && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel-alt p-3">
            <div className="flex items-center gap-2">
              <DecisionChip decision={prior.decision} />
              <span className="font-mono text-sm text-ink">
                {prior.score}
                <span className="text-[11px] text-muted">/100</span>
              </span>
            </div>
            <span className="text-muted">→</span>
            <div className="flex items-center gap-2">
              <DecisionChip decision={current.decision} />
              <span className="font-mono text-sm text-ink">
                {current.score}
                <span className="text-[11px] text-muted">/100</span>
              </span>
            </div>
            <span className="ml-auto font-mono text-xs text-muted">
              {scoreDelta > 0 ? "+" : scoreDelta === 0 ? "" : ""}
              {scoreDelta} points
            </span>
          </div>
        )}
      </Panel>

      {current && prior && deltas.length > 0 && (
        <FactorsPanel
          factors={deltas}
          variant="delta"
          title={`Δ vs ${priorDate}`}
        />
      )}
    </div>
  );
}
