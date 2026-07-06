// Signed points visualization: bar fills right from center for positive
// contributions, left from center for negative. Width scales linearly with
// |points|, capped at 25 which maps to the full half-track width.
//
// variant="delta" is used by YoYCompare — same signed fill, but the numeric
// label reads as a change ("Δ +12") rather than an absolute contribution.

type Props = {
  points: number;
  variant?: "absolute" | "delta";
};

export function FactorBar({ points, variant = "absolute" }: Props) {
  const mag = Math.min(Math.abs(points) / 25, 1) * 50;
  const positive = points >= 0;
  const fillColor = positive ? "bg-decision-green" : "bg-decision-red";
  const labelSide = positive ? "right-2" : "left-2";

  const label =
    variant === "delta"
      ? points === 0
        ? "Δ 0"
        : points > 0
          ? `Δ +${points}`
          : `Δ ${points}`
      : points >= 0
        ? `+${points}`
        : `${points}`;

  return (
    <div className="relative h-[22px] rounded border border-line bg-canvas">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <div
        className={`absolute top-[3px] bottom-[3px] rounded-sm opacity-90 ${fillColor}`}
        style={{
          left: positive ? "50%" : `${50 - mag}%`,
          width: `${mag}%`,
        }}
      />
      <span
        className={`absolute top-[2px] font-mono text-xs text-ink ${labelSide}`}
      >
        {label}
      </span>
    </div>
  );
}
