import { Fragment, type ReactNode } from "react";
import { ScrollText } from "lucide-react";
import { Panel } from "../../components/Panel";

// The memo comes back as markdown-ish prose: section headers wrapped in
// **bold**, bullet points prefixed with "- ". We render `**seg**` runs as
// serif gold-soft <strong>, and lines starting with "- " as bulleted paras
// with a small gold guillemet.

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, j) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={j} className="font-serif text-gold-soft">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={j}>{p}</Fragment>
    ),
  );
}

export function MemoPanel({ memo }: { memo: string }) {
  const lines = memo.split("\n");

  return (
    <Panel title="Credit memo" icon={<ScrollText size={18} />}>
      <div>
        {lines.map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={i} className="h-2" />;

          const isBullet = trimmed.startsWith("-");
          const body = isBullet ? trimmed.replace(/^-\s*/, "") : line;

          return (
            <p
              key={i}
              className={
                "mb-1 text-[13.5px] leading-relaxed text-sub " +
                (isBullet ? "pl-3.5" : "")
              }
            >
              {isBullet && (
                <span className="-ml-3.5 mr-1.5 text-gold">›</span>
              )}
              {renderInline(body)}
            </p>
          );
        })}
      </div>
    </Panel>
  );
}
