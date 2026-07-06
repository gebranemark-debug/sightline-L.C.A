import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AnalysisResult } from "../../api/client";
import { AttributionBadge } from "../../components/AttributionBadge";
import { Panel } from "../../components/Panel";

export function FlagsList({ flags }: { flags: AnalysisResult["flags"] }) {
  const accentClass =
    flags.length > 0 ? "text-decision-red" : "text-decision-green";

  return (
    <Panel
      title={`Red flags (${flags.length})`}
      icon={<AlertTriangle size={18} />}
      accentClass={accentClass}
      attribution={<AttributionBadge variant="code" />}
    >
      {flags.length === 0 ? (
        <div className="flex items-center gap-2 text-[13px] text-decision-green">
          <CheckCircle2 size={15} /> No material flags detected.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {flags.map((fl, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span
                className={
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full " +
                  (fl.sev === "high" ? "bg-decision-red" : "bg-decision-amber")
                }
              />
              <span className="text-[13px] leading-relaxed text-sub">
                {fl.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
