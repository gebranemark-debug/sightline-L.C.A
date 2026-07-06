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
// The `key` on HumanOversight ensures the officer's confirm/override state
// resets each time we switch to a different analysis.

export function ResultPanels({ result }: { result: AnalysisResult }) {
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
      <HumanOversight key={result.id} />
    </>
  );
}
