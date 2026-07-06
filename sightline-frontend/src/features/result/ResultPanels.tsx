import type { AnalysisResult } from "../../api/client";
import { DecisionHeader } from "./DecisionHeader";
import { FactorsPanel } from "./FactorsPanel";
import { RatiosGrid } from "./RatiosGrid";
import { FlagsList } from "./FlagsList";
import { MemoPanel } from "./MemoPanel";
import { HumanOversight } from "./HumanOversight";

// The six-panel result block, extracted from App.tsx so SamplesView, the
// queue tabs (inline expand), and BorrowerDetail's analyses timeline can
// all render the same output shape without duplicating the composition.
//
// The `key` on HumanOversight ensures the widget remounts (fresh local
// state) when we switch to a different analysis. When the SAME analysis
// re-renders with updated officer_* fields (after a successful oversight
// POST → parent updates its result state), the id stays the same so no
// remount happens — the widget just re-reads result.officer_action and
// stays on the flipped state without any Awaiting flash.

type Props = {
  result: AnalysisResult;
  /** Called with the fresh AnalysisResult after a successful oversight POST.
   *  Callers thread their setResult here so the widget's next render reads
   *  the persisted state. Omit for read-only surfaces. */
  onOversightUpdated?: (updated: AnalysisResult) => void;
};

export function ResultPanels({ result, onOversightUpdated }: Props) {
  return (
    <>
      <DecisionHeader result={result} />
      <FactorsPanel
        factors={result.factors}
        counterfactual={result.counterfactual}
      />
      <RatiosGrid ratios={result.ratios} />
      <FlagsList flags={result.flags} />
      <MemoPanel memo={result.memo} />
      <HumanOversight
        key={result.id}
        result={result}
        onUpdated={onOversightUpdated}
      />
    </>
  );
}
