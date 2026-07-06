import { useMemo, useState } from "react";
import { Play, X } from "lucide-react";
import type { AnalysisResult, FileSummary } from "../../api/client";
import { analyzeBorrower } from "../../api/client";

type Props = {
  borrowerId: string;
  files: FileSummary[];
  onClose: () => void;
  onDone: (result: AnalysisResult) => void;
};

export function RunAnalysisModal({ borrowerId, files, onClose, onDone }: Props) {
  // Sort files by uploaded_at ASC — backend feeds file_ids into the
  // extraction prompt in the caller's order, and chronological order matches
  // the natural reading order for most cases (application → statements →
  // tax return). All start selected by default.
  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at)),
    [files],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(sortedFiles.map((f) => f.id)),
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run() {
    if (selected.size === 0) {
      setError("Pick at least one file.");
      return;
    }
    // Keep uploaded_at ASC order, filter to selected.
    const fileIds = sortedFiles.filter((f) => selected.has(f.id)).map((f) => f.id);
    setRunning(true);
    setError(null);
    try {
      const result = await analyzeBorrower(borrowerId, fileIds);
      onDone(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-line bg-panel p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg text-ink">Run analysis</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 text-[12.5px] text-muted">
          Pick which stored files to feed into the pipeline. Files are sent in
          upload order (oldest first) so the LLM sees them the same way a
          credit officer would.
        </p>

        <div className="mb-4 flex flex-col gap-1.5">
          {sortedFiles.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-panel-alt p-2.5 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                onChange={() => toggle(f.id)}
                className="h-4 w-4 accent-gold"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-ink">{f.filename}</div>
                <div className="font-mono text-[11px] text-muted">
                  {f.page_count} {f.page_count === 1 ? "page" : "pages"} ·{" "}
                  {(f.size_bytes / 1024).toFixed(0)} KB
                </div>
              </div>
            </label>
          ))}
        </div>

        {error && (
          <p className="mb-3 text-[12.5px] text-decision-red">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="rounded-lg border border-line px-4 py-2 text-sm text-sub hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={running || selected.size === 0}
            className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-canvas hover:brightness-105 disabled:opacity-50"
          >
            <Play size={14} />
            {running
              ? "Analysing…"
              : `Analyse ${selected.size} ${selected.size === 1 ? "file" : "files"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
