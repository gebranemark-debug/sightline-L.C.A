import { CheckCircle2, CircleDot, Loader2 } from "lucide-react";

export type StepState = "wait" | "run" | "done";

type Props = { state: StepState; label: string };

export function StepRow({ state, label }: Props) {
  const wrapperClass =
    state === "wait" ? "opacity-40" : "";
  const labelClass =
    state === "done" ? "text-sub" : "text-muted";

  return (
    <div className={`flex items-center gap-2 ${wrapperClass}`}>
      {state === "done" ? (
        <CheckCircle2 size={15} className="text-decision-green" />
      ) : state === "run" ? (
        <Loader2 size={15} className="animate-spin text-gold" />
      ) : (
        <CircleDot size={15} className="text-muted" />
      )}
      <span className={`text-[12.5px] ${labelClass}`}>{label}</span>
    </div>
  );
}
