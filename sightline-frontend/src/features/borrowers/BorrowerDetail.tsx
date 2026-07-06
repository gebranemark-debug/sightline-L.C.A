import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, GitCompare, Play } from "lucide-react";
import type {
  BorrowerDetail as BorrowerDetailType,
} from "../../api/client";
import { getBorrower, NotFoundError, uploadBorrowerFiles } from "../../api/client";
import { DropZone, type UploadedFile } from "../../components/DropZone";
import { FileChip } from "../../components/FileChip";
import { Panel } from "../../components/Panel";
import { AnalysesTimeline } from "./AnalysesTimeline";
import { RunAnalysisModal } from "./RunAnalysisModal";
import { YoYCompare } from "./YoYCompare";

type Props = {
  id: string;
  onBack: () => void;
};

export function BorrowerDetail({ id, onBack }: Props) {
  const [borrower, setBorrower] = useState<BorrowerDetailType | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const b = await getBorrower(id);
      setBorrower(b);
      setNotFound(false);
      setError(null);
    } catch (e) {
      if (e instanceof NotFoundError) {
        setNotFound(true);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, [id]);

  useEffect(() => {
    setBorrower(null);
    setNotFound(false);
    setError(null);
    refresh();
  }, [id, refresh]);

  async function handleUpload(files: UploadedFile[]) {
    setUploading(true);
    setUploadError(null);
    try {
      await uploadBorrowerFiles(id, files.map((f) => f.file));
      await refresh();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line p-10 text-center">
        <p className="text-sm text-muted">Borrower not found.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 flex items-center gap-1.5 text-sm text-gold hover:brightness-105"
        >
          <ArrowLeft size={14} /> Back to borrowers
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-decision-red bg-panel p-5">
        <div className="mb-2 font-serif text-decision-red">
          Couldn't load borrower
        </div>
        <p className="font-mono text-sm text-muted">{error}</p>
      </div>
    );
  }

  if (!borrower) {
    return <div className="text-sm text-muted">Loading…</div>;
  }

  const canCompare = borrower.analyses.length >= 2;
  const existingBytes = borrower.files.reduce((s, f) => s + f.size_bytes, 0);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-xs text-sub hover:text-ink"
      >
        <ArrowLeft size={12} /> Back to borrowers
      </button>

      <div className="mb-4 rounded-2xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-2xl text-ink">{borrower.name}</h2>
            {borrower.sector && (
              <div className="text-sm text-muted">{borrower.sector}</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canCompare && (
              <button
                type="button"
                onClick={() => setCompareOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-sub hover:text-ink"
              >
                <GitCompare size={14} />
                {compareOpen ? "Hide compare" : "Compare"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setRunOpen(true)}
              disabled={borrower.files.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-sm font-bold text-canvas hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={14} /> Run analysis
            </button>
          </div>
        </div>
        {borrower.notes && (
          <p className="mt-3 text-[13px] leading-relaxed text-sub">
            {borrower.notes}
          </p>
        )}
      </div>

      {compareOpen && canCompare && (
        <YoYCompare analyses={borrower.analyses} />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title={`Files (${borrower.files.length})`}
          icon={<FileText size={16} />}
        >
          {borrower.files.length === 0 ? (
            <p className="mb-3 text-[12.5px] text-muted">
              No files yet. Upload PDFs to run an analysis.
            </p>
          ) : (
            <div className="mb-3 flex flex-col gap-1.5">
              {borrower.files.map((f) => (
                <FileChip
                  key={f.id}
                  filename={f.filename}
                  sizeBytes={f.size_bytes}
                  pageCount={f.page_count}
                />
              ))}
            </div>
          )}
          <DropZone
            onFiles={handleUpload}
            onError={setUploadError}
            disabled={uploading}
            existingCount={borrower.files.length}
            existingBytes={existingBytes}
          />
          {uploadError && (
            <p className="mt-2 text-[11.5px] text-decision-red">{uploadError}</p>
          )}
          {uploading && (
            <p className="mt-2 text-[11.5px] text-sub">Uploading…</p>
          )}
        </Panel>

        <Panel title={`Analyses (${borrower.analyses.length})`}>
          {borrower.analyses.length === 0 ? (
            <p className="text-[12.5px] text-muted">
              No analyses yet. Upload files and click Run analysis.
            </p>
          ) : (
            <AnalysesTimeline analyses={borrower.analyses} />
          )}
        </Panel>
      </div>

      {runOpen && (
        <RunAnalysisModal
          borrowerId={id}
          files={borrower.files}
          onClose={() => setRunOpen(false)}
          onDone={() => {
            setRunOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
