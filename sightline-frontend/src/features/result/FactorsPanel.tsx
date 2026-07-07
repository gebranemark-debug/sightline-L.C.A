import { useMemo } from "react";
import { Calculator } from "lucide-react";
import type { AnalysisResult } from "../../api/client";
import { AttributionBadge } from "../../components/AttributionBadge";
import { FactorBar } from "../../components/FactorBar";
import { Panel } from "../../components/Panel";

// The explainability panel — the reason the product exists. Every factor shows
// what it contributed (signed points), the raw value the scorecard saw, AND
// the theoretical impact range (e.g. "-25 / +20" for DSCR). Reading order is
// sorted by total range descending — the higher-weight factors bubble to the
// top so the composite's weighting is visible at a glance rather than buried
// in the scoring bands.
//
// variant="delta" (used by YoYCompare) reads `points` as a change vs a prior
// analysis. Rendering is identical — same signed bars — but the label shows a
// Δ prefix so the reader knows they're looking at movement, not contribution.

type Factor = AnalysisResult["factors"][number];

type Props = {
  factors: Factor[];
  counterfactual?: AnalysisResult["counterfactual"];
  variant?: "absolute" | "delta";
  title?: string;
};

function formatImpactRange(f: Factor): string {
  // "-25 / +20", or "-15 / 0" for asymmetric factors like concentration.
  const neg = f.max_negative;
  const pos = f.max_positive;
  const posLabel = pos > 0 ? `+${pos}` : `${pos}`;
  return `${neg} / ${posLabel}`;
}

export function FactorsPanel({
  factors,
  counterfactual,
  variant = "absolute",
  title,
}: Props) {
  const resolvedTitle =
    title ?? (variant === "delta" ? "Δ vs prior" : "Why — decision factors");

  // Sort by total impact range descending. Stable — factors with the same
  // range keep their backend-supplied order.
  const sorted = useMemo(() => {
    const withRange = factors.map((f, i) => ({
      f,
      i,
      range: f.max_positive + Math.abs(f.max_negative),
    }));
    withRange.sort((a, b) => b.range - a.range || a.i - b.i);
    return withRange.map((x) => x.f);
  }, [factors]);

  return (
    <Panel
      title={resolvedTitle}
      icon={<Calculator size={18} />}
      attribution={<AttributionBadge variant="code" />}
    >
      <div className="flex flex-col gap-2.5">
        {sorted.map((f) => (
          <div
            key={f.key}
            className="grid grid-cols-2 items-center gap-3"
          >
            <div>
              <div className="text-[12.5px] text-sub">{f.label}</div>
              <div className="font-mono text-[11.5px] text-muted">{f.value}</div>
              <div className="font-mono text-[10.5px] text-muted">
                impact {formatImpactRange(f)}
              </div>
            </div>
            <FactorBar points={f.points} variant={variant} />
          </div>
        ))}
      </div>
      {counterfactual && (
        <div className="mt-4 rounded-lg border border-line bg-panel-alt px-3 py-2.5">
          <div className="text-[12.5px] leading-relaxed text-gold-soft">
            {counterfactual}
          </div>
        </div>
      )}
    </Panel>
  );
}
