import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { BorrowerSummary } from "../../api/client";
import { createBorrower } from "../../api/client";

type Props = {
  onClose: () => void;
  onCreated: (created: BorrowerSummary) => void;
};

// Inline overlay modal — no new dependency. Clicking the backdrop closes;
// stopPropagation on the card so clicks inside stay put.
export function BorrowerCreateModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createBorrower({
        name: name.trim(),
        sector: sector.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-line bg-panel p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg text-ink">New borrower</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-1 block text-xs text-sub" htmlFor="borrower-name">
          Name <span className="text-decision-red">*</span>
        </label>
        <input
          id="borrower-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          className="mb-3 block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
        />

        <label className="mb-1 block text-xs text-sub" htmlFor="borrower-sector">
          Sector
        </label>
        <input
          id="borrower-sector"
          type="text"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          placeholder="e.g., Precision manufacturing"
          className="mb-3 block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted"
        />

        <label className="mb-1 block text-xs text-sub" htmlFor="borrower-notes">
          Notes
        </label>
        <textarea
          id="borrower-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Free-form context, follow-up questions, etc."
          className="mb-4 block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted"
        />

        {error && (
          <p className="mb-3 text-[12.5px] text-decision-red">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm text-sub hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-canvas hover:brightness-105 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
