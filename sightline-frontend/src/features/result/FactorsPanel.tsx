import { Calculator } from "lucide-react";
import type { AnalysisResult } from "../../api/client";
import { AttributionBadge } from "../../components/AttributionBadge";
import { FactorBar } from "../../components/FactorBar";
import { Panel } from "../../components/Panel";

// The explainability panel — the reason the product exists. Every factor shows
// what it contributed (signed points) plus the raw value the scorecard saw, so
// a credit officer can trace the score back to the deterministic engine, not
// a black-box model output. The counterfactual is the actionable "what if".
//
// variant="delta" (used by YoYCompare) reads `points` as a change vs a prior
// analysis. Rendering is identical — same signed bars — but the label shows a
// Δ prefix so the reader knows they're looking at movement, not contribution.

type Props = {
  factors: AnalysisResult["factors"];
  counterfactual?: AnalysisResult["counterfactual"];
  variant?: "absolute" | "delta";
  title?: string;
};

export function FactorsPanel({
  factors,
  counterfactual,
  variant = "absolute",
  title,
}: Props) {
  const resolvedTitle =
    title ?? (variant === "delta" ? "Δ vs prior" : "Why — decision factors");

  return (
    <Panel
      title={resolvedTitle}
      icon={<Calculator size={18} />}
      attribution={<AttributionBadge variant="code" />}
    >
      <div className="flex flex-col gap-2.5">
        {factors.map((f) => (
          <div
            key={f.key}
            className="grid grid-cols-2 items-center gap-3"
          >
            <div>
              <div className="text-[12.5px] text-sub">{f.label}</div>
              <div className="font-mono text-[11.5px] text-muted">{f.value}</div>
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
