import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import type { BorrowerSummary } from "../../api/client";
import { listBorrowers } from "../../api/client";
import { DecisionChip } from "../../components/DecisionChip";
import { BorrowerCreateModal } from "./BorrowerCreateModal";

type Props = {
  onOpen: (id: string) => void;
};

export function BorrowersList({ onOpen }: Props) {
  const [borrowers, setBorrowers] = useState<BorrowerSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function refresh() {
    try {
      setBorrowers(await listBorrowers());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-ink">Borrowers</h2>
          <p className="text-sm text-muted">
            An APPROVE analysis attaches automatically. Create a borrower here to
            set up the relationship before the first analysis lands.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-canvas hover:brightness-105"
        >
          <Plus size={16} /> New borrower
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-decision-red bg-panel p-4 text-sm text-decision-red">
          {error}
        </div>
      )}

      {borrowers === null && !error ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : borrowers && borrowers.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line p-10 text-center">
          <Users size={30} className="text-muted" />
          <p className="mt-3 max-w-sm text-sm text-muted">
            No borrowers yet — an APPROVE analysis creates one automatically, or
            click <span className="text-ink">+ New borrower</span>.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {borrowers?.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onOpen(b.id)}
              className="rounded-xl border border-line bg-panel p-4 text-left transition-colors hover:border-gold"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-serif text-lg text-ink">{b.name}</div>
                  {b.sector && (
                    <div className="text-xs text-muted">{b.sector}</div>
                  )}
                </div>
                {b.latest_decision && (
                  <DecisionChip decision={b.latest_decision} />
                )}
              </div>
              <div className="mt-2 font-mono text-[11.5px] text-muted">
                {b.file_count} {b.file_count === 1 ? "file" : "files"} ·{" "}
                {b.analysis_count}{" "}
                {b.analysis_count === 1 ? "analysis" : "analyses"}
                {b.latest_score !== undefined && b.latest_score !== null && (
                  <> · latest {b.latest_score}/100</>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {modalOpen && (
        <BorrowerCreateModal
          onClose={() => setModalOpen(false)}
          onCreated={(created) => {
            setModalOpen(false);
            refresh();
            onOpen(created.id);
          }}
        />
      )}
    </div>
  );
}
