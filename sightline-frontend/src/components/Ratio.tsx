type Props = {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
};

export function Ratio({ label, value, hint, emphasize }: Props) {
  const surface = emphasize
    ? "bg-raised border border-gold"
    : "bg-panel-alt border border-line";
  const valueColor = emphasize ? "text-gold-soft" : "text-ink";

  return (
    <div className={`rounded-lg p-3 ${surface}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className={`mt-1 font-mono text-xl ${valueColor}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
