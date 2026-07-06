import { QueueList } from "./QueueList";

export function UnderReviewView() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-ink">Under review</h2>
        <p className="text-sm text-muted">
          Analyses that fell into REVIEW and aren't attached to a borrower yet.
          Click a row to expand the full explainability view inline.
        </p>
      </div>
      <QueueList
        decision="REVIEW"
        emptyMessage="No REVIEW analyses in the queue."
      />
    </div>
  );
}
