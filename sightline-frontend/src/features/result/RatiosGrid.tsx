import { Calculator } from "lucide-react";
import type { AnalysisResult } from "../../api/client";
import { Panel } from "../../components/Panel";
import { Ratio } from "../../components/Ratio";
import { days, eur, pct, x1 } from "../../lib/format";

export function RatiosGrid({ ratios }: { ratios: AnalysisResult["ratios"] }) {
  const ocfHint =
    ratios.ocf == null
      ? undefined
      : ratios.ocf >= 0
        ? "positive"
        : "negative";

  return (
    <Panel title="Cash flow & ratios" icon={<Calculator size={18} />}>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Ratio
          label="DSCR"
          value={x1(ratios.dscr)}
          hint="healthy ≥ 1.25×"
          emphasize
        />
        <Ratio
          label="Debt / EBITDA"
          value={x1(ratios.debtToEbitda)}
          hint="lower is safer"
        />
        <Ratio
          label="Current ratio"
          value={x1(ratios.currentRatio)}
          hint="≥ 1.5× comfortable"
        />
        <Ratio
          label="Net margin"
          value={pct(ratios.netMargin)}
          hint="profitability"
        />
        <Ratio
          label="Cash conv. cycle"
          value={days(ratios.ccc)}
          hint={`DSO ${days(ratios.dso)} · DPO ${days(ratios.dpo)}`}
        />
        <Ratio label="Op. cash flow" value={eur(ratios.ocf)} hint={ocfHint} />
      </div>
    </Panel>
  );
}
