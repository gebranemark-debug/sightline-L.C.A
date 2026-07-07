import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
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

// Knockout pill — decision colours are reserved for decisions + severity per
// CONTRACT.md, so a fired knockout inherits that vocabulary. Hard reads red,
// soft reads amber. Chip only renders when a knockout actually fired.
type Knockout = NonNullable<AnalysisResult["knockout"]>;

function KnockoutPill({ knockout }: { knockout: Knockout }) {
  const surface =
    knockout.type === "hard"
      ? "bg-decision-red"
      : "bg-decision-amber";
  const label = knockout.type === "hard" ? "hard knockout" : "soft knockout";
  return (
    <div
      className={`mt-2 inline-flex items-start gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] leading-tight text-canvas ${surface}`}
    >
      <ShieldAlert size={13} className="mt-px shrink-0" />
      <span className="font-sans">
        <span className="font-semibold uppercase tracking-wider">{label}</span>
        <span className="ml-1">· {knockout.reason}</span>
      </span>
    </div>
  );
}

export function DecisionHeader({ result }: { result: AnalysisResult }) {
  const { border, text, Icon } = STYLES[result.decision];

  return (
    <div className={`mb-4 rounded-2xl border ${border} bg-panel p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
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
          {result.knockout && <KnockoutPill knockout={result.knockout} />}
          <div className="mt-1">
            <AttributionBadge variant="code" />
          </div>
        </div>
      </div>
    </div>
  );
}
