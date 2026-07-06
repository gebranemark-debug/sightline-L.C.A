import { useId, useState } from "react";
import { Upload } from "lucide-react";
import { countPdfPages } from "../lib/pdfPageCount";

// Reusable drop zone. Enforces the same limits the backend gates on
// (validate_and_read_pdfs) so we surface a friendly message before we
// round-trip. Returns already-page-counted files to the caller so FileChip
// doesn't need to recount.

export type UploadedFile = { file: File; pageCount: number | null };

type Props = {
  onFiles: (files: UploadedFile[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  maxFiles?: number;
  maxBytesPerFile?: number;
  maxBytesTotal?: number;
  maxPagesPerFile?: number;
  /** Files already staged by the caller — counted against maxFiles / maxBytesTotal. */
  existingCount?: number;
  existingBytes?: number;
};

const DEFAULT_MAX_FILES = 60;
const DEFAULT_MAX_BYTES_PER_FILE = 10 * 1024 * 1024;
const DEFAULT_MAX_BYTES_TOTAL = 100 * 1024 * 1024;
const DEFAULT_MAX_PAGES_PER_FILE = 100;

export function DropZone({
  onFiles,
  onError,
  disabled,
  maxFiles = DEFAULT_MAX_FILES,
  maxBytesPerFile = DEFAULT_MAX_BYTES_PER_FILE,
  maxBytesTotal = DEFAULT_MAX_BYTES_TOTAL,
  maxPagesPerFile = DEFAULT_MAX_PAGES_PER_FILE,
  existingCount = 0,
  existingBytes = 0,
}: Props) {
  const [dragActive, setDragActive] = useState(false);
  const inputId = useId();

  async function stage(incoming: File[]) {
    if (disabled) return;
    if (incoming.length === 0) return;

    if (existingCount + incoming.length > maxFiles) {
      onError(`Up to ${maxFiles} files per analysis.`);
      return;
    }

    const staged: UploadedFile[] = [];
    let runningTotal = existingBytes;
    for (const f of incoming) {
      const isPdf =
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        onError(`${f.name}: only PDF files are supported.`);
        return;
      }
      if (f.size > maxBytesPerFile) {
        onError(
          `${f.name}: ${(f.size / 1_048_576).toFixed(1)} MB exceeds the ${maxBytesPerFile / 1_048_576} MB per-file limit.`,
        );
        return;
      }
      runningTotal += f.size;
      if (runningTotal > maxBytesTotal) {
        onError(
          `Total upload exceeds the ${maxBytesTotal / 1_048_576} MB request limit.`,
        );
        return;
      }
      const pageCount = await countPdfPages(f);
      if (pageCount != null && pageCount > maxPagesPerFile) {
        onError(
          `${f.name}: ${pageCount} pages exceeds the ${maxPagesPerFile}-page-per-file limit.`,
        );
        return;
      }
      staged.push({ file: f, pageCount });
    }

    onFiles(staged);
  }

  const surfaceClass = disabled
    ? "border-line bg-panel-alt/40 opacity-60 cursor-not-allowed"
    : dragActive
      ? "border-gold bg-panel-alt cursor-pointer"
      : "border-line bg-panel-alt/60 hover:border-gold hover:bg-panel-alt cursor-pointer";

  return (
    <label
      htmlFor={inputId}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setDragActive(false);
        if (disabled) return;
        await stage(Array.from(e.dataTransfer.files));
      }}
      className={`flex flex-col items-center rounded-xl border border-dashed p-4 text-center transition-colors ${surfaceClass}`}
    >
      <Upload size={18} className="text-muted" />
      <p className="mt-1 text-[12.5px] text-sub">
        Drop PDFs here or click to upload
      </p>
      <p className="text-[11px] text-muted">
        Up to {maxFiles} files · {maxBytesPerFile / 1_048_576} MB each ·{" "}
        {maxBytesTotal / 1_048_576} MB total · {maxPagesPerFile} pages max
      </p>
      <input
        id={inputId}
        type="file"
        multiple
        accept="application/pdf"
        disabled={disabled}
        className="sr-only"
        onChange={async (e) => {
          const picked = Array.from(e.target.files ?? []);
          await stage(picked);
          // Reset value so re-picking the same file still fires onChange.
          e.target.value = "";
        }}
      />
    </label>
  );
}
