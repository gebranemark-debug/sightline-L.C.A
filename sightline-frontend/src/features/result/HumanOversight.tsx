import { useState } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";

// EU AI Act Article 14: a credit officer must be able to review and override
// the model's recommendation. This is local UI state only — no backend endpoint
// yet; recording the decision to an audit trail lands with the review flow.

type OfficerDecision = "confirmed" | "overridden";

export function HumanOversight() {
  const [officer, setOfficer] = useState<OfficerDecision | null>(null);

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={18} className="text-gold" />
        <h3 className="font-serif text-base font-semibold text-ink">
          Human oversight
        </h3>
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
        Under the EU AI Act (Article 14), a credit officer must review and be
        able to override the model. This is the checkpoint.
      </p>
      {officer ? (
        <div
          className={
            "flex items-center gap-2 text-[13px] " +
            (officer === "confirmed"
              ? "text-decision-green"
              : "text-decision-amber")
          }
        >
          <CheckCircle2 size={15} />{" "}
          {officer === "confirmed"
            ? "Decision confirmed by credit officer."
            : "Officer overrode the recommendation — routed to committee."}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOfficer("confirmed")}
            className="flex items-center gap-1.5 rounded-lg bg-decision-green px-3.5 py-2.5 text-[13px] font-semibold text-canvas"
          >
            <CheckCircle2 size={15} /> Confirm decision
          </button>
          <button
            type="button"
            onClick={() => setOfficer("overridden")}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-transparent px-3.5 py-2.5 text-[13px] font-semibold text-sub"
          >
            <ArrowRight size={15} /> Override & escalate
          </button>
        </div>
      )}
    </div>
  );
}
