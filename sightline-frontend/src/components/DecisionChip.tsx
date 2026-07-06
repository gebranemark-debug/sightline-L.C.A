import type { Decision } from "../api/client";

// Small pill for a decision. Uses the decision-* @theme tokens; the chip is
// the ONLY place tab-adjacent UI is allowed to carry decision colour (tab
// labels themselves stay neutral chrome per CONTRACT.md).

type Props = {
  decision: Decision;
  size?: "sm" | "md";
};

const SURFACE = {
  APPROVE: "bg-decision-green",
  REVIEW: "bg-decision-amber",
  DECLINE: "bg-decision-red",
} as const;

export function DecisionChip({ decision, size = "sm" }: Props) {
  const surface = SURFACE[decision];
  const dim =
    size === "md"
      ? "px-2.5 py-1 text-[11px]"
      : "px-2 py-0.5 text-[10.5px]";
  return (
    <span
      className={`inline-flex items-center rounded-full font-sans font-semibold uppercase tracking-wider text-canvas ${surface} ${dim}`}
    >
      {decision}
    </span>
  );
}
