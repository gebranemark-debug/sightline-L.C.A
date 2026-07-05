import type { ReactNode } from "react";

type Props = {
  title: string;
  icon?: ReactNode;
  accentClass?: string;
  id?: string;
  children: ReactNode;
};

export function Panel({ title, icon, accentClass = "text-gold", id, children }: Props) {
  return (
    <div
      id={id}
      className="mb-4 rounded-2xl border border-line bg-panel p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        {icon && <span className={accentClass}>{icon}</span>}
        <h3 className="font-serif text-base font-semibold tracking-wide text-ink">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}
