import { Calculator } from "lucide-react";
import type { AnalysisResult } from "../../api/client";
import { FactorBar } from "../../components/FactorBar";
import { Panel } from "../../components/Panel";

// The explainability panel — the reason the product exists. Every factor shows
// what it contributed (signed points) plus the raw value the scorecard saw, so
// a credit officer can trace the score back to the deterministic engine, not
// a black-box model output. The counterfactual is the actionable "what if".

type Props = {
  factors: AnalysisResult["factors"];
  counterfactual: AnalysisResult["counterfactual"];
};

export function FactorsPanel({ factors, counterfactual }: Props) {
  return (
    <Panel title="Why — decision factors" icon={<Calculator size={18} />}>
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
            <FactorBar points={f.points} />
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
