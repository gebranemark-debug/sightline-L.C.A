// Panel attribution — surfaces the hybrid architecture in the UI. Every
// result panel labels what actually produced it: the deterministic engine
// or the LLM. A screenshot of the results view should make the "6 code /
// 1 LLM" split undeniable.
//
// Deliberately quiet chrome: mono muted text, no background, no border,
// no gold. Sits in the Panel header opposite the title, or gets embedded
// manually on cards that don't use the Panel primitive (DecisionHeader).

type Props = {
  variant: "code" | "opus";
};

const TEXT = {
  code: "computed · deterministic",
  opus: "drafted · Opus 4.8",
} as const;

export function AttributionBadge({ variant }: Props) {
  return (
    <span className="font-mono text-[11px] text-muted">{TEXT[variant]}</span>
  );
}
