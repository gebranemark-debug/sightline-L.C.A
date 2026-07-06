import type { Tab } from "../../hooks/useHashRoute";

type TabDef = { id: Tab; label: string; hash: string };

const TABS: TabDef[] = [
  { id: "samples", label: "Sample analysis", hash: "#samples" },
  { id: "borrowers", label: "Borrowers", hash: "#borrowers" },
  { id: "review", label: "Under review", hash: "#review" },
  { id: "declined", label: "Declined", hash: "#declined" },
];

type Props = {
  current: Tab;
  onSelect: (hash: string) => void;
};

// Neutral chrome per CONTRACT.md — no decision colours on tab labels.
// Active state uses the gold underline (gold reserved for active + CTAs).
export function TabBar({ current, onSelect }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Workspace"
      className="flex flex-wrap gap-1 border-b border-line"
    >
      {TABS.map((t) => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(t.hash)}
            className={
              "-mb-px border-b-2 px-4 py-2 text-sm font-sans " +
              (active
                ? "border-gold text-ink"
                : "border-transparent text-sub hover:text-ink")
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
