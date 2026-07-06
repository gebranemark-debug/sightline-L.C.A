import { FileText, X } from "lucide-react";

type Props = {
  filename: string;
  sizeBytes: number;
  pageCount: number | null;
  // Optional — omit on read-only surfaces (e.g. borrower detail, where files
  // are already persisted and there's no delete endpoint yet).
  onRemove?: () => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatPages(n: number): string {
  return `${n} ${n === 1 ? "page" : "pages"}`;
}

export function FileChip({ filename, sizeBytes, pageCount, onRemove }: Props) {
  const meta =
    pageCount != null
      ? `${formatSize(sizeBytes)} · ${formatPages(pageCount)}`
      : formatSize(sizeBytes);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-alt px-2.5 py-1.5">
      <FileText size={14} className="shrink-0 text-sub" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-ink">{filename}</div>
        <div className="text-[11px] text-muted">{meta}</div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${filename}`}
          className="shrink-0 rounded-md p-1 text-muted hover:text-decision-red"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
