import { QueueList } from "./QueueList";

export function DeclinedView() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-ink">Declined</h2>
        <p className="text-sm text-muted">
          Audit view: analyses that fell into DECLINE and aren't attached to a
          borrower. Click a row to expand the full detail.
        </p>
      </div>
      <QueueList
        decision="DECLINE"
        emptyMessage="No DECLINE analyses in the audit trail."
      />
    </div>
  );
}
