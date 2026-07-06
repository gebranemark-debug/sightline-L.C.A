import type { ReactNode } from "react";

type Props = {
  title: string;
  icon?: ReactNode;
  accentClass?: string;
  id?: string;
  /**
   * Right-aligned slot in the header row. Meant for AttributionBadge —
   * surfaces which subsystem (code vs LLM) produced the panel content.
   * Non-breaking: existing callers without this prop render as before.
   */
  attribution?: ReactNode;
  children: ReactNode;
};

export function Panel({
  title,
  icon,
  accentClass = "text-gold",
  id,
  attribution,
  children,
}: Props) {
  return (
    <div
      id={id}
      className="mb-4 rounded-2xl border border-line bg-panel p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon && <span className={accentClass}>{icon}</span>}
          <h3 className="font-serif text-base font-semibold tracking-wide text-ink">
            {title}
          </h3>
        </div>
        {attribution && (
          <div className="flex flex-shrink-0 items-center">{attribution}</div>
        )}
      </div>
      {children}
    </div>
  );
}
