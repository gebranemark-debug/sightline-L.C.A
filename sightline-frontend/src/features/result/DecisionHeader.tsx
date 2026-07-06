import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { AnalysisResult } from "../../api/client";
import { AttributionBadge } from "../../components/AttributionBadge";
import { eur } from "../../lib/format";

const STYLES = {
  APPROVE: {
    border: "border-decision-green",
    text: "text-decision-green",
    Icon: CheckCircle2,
  },
  DECLINE: {
    border: "border-decision-red",
    text: "text-decision-red",
    Icon: XCircle,
  },
  REVIEW: {
    border: "border-decision-amber",
    text: "text-decision-amber",
    Icon: AlertTriangle,
  },
} as const;

export function DecisionHeader({ result }: { result: AnalysisResult }) {
  const { border, text, Icon } = STYLES[result.decision];

  return (
    <div className={`mb-4 rounded-2xl border ${border} bg-panel p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={text}>
            <Icon size={26} />
          </span>
          <div>
            <div className={`font-serif text-2xl font-bold ${text}`}>
              {result.decision}
            </div>
            <div className="text-[12.5px] text-muted">
              {result.company} · requests {eur(result.loan_request)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl leading-none text-ink">
            {result.score}
            <span className="text-[15px] text-muted">/100</span>
          </div>
          <div className="text-[11px] text-muted">risk score</div>
          <div className="mt-1">
            <AttributionBadge variant="code" />
          </div>
        </div>
      </div>
    </div>
  );
}
