import { Loader2, RotateCw, ScrollText, XCircle } from "lucide-react";

// Shown when the user has cleared the current result (e.g. by switching sample
// tabs) but hasn't kicked off a new analysis yet. A quiet hint in muted tone.
export function EmptyState() {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-line p-10 text-center">
      <ScrollText size={28} className="text-muted" />
      <p className="mt-3 text-sm text-muted">Pick a borrower and hit Analyse.</p>
    </div>
  );
}

// Skeleton placeholders while the request is in flight. Kept intentionally
// generic — the exact incoming shape is unknown, so we hint at "three chunky
// panels" rather than reproducing the real layout pixel-for-pixel. The
// pipeline indicator on the left is where the animated step-by-step lives.
export function RunningState() {
  return (
    <div className="rounded-2xl border border-line bg-panel p-6">
      <div className="flex items-center gap-3">
        <Loader2 size={22} className="animate-spin text-gold" />
        <div>
          <div className="font-serif text-lg font-semibold text-ink">
            Analysing…
          </div>
          <div className="text-[12.5px] text-muted">
            Reading the file, running the numbers, drafting the memo.
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="h-14 animate-pulse rounded-xl bg-panel-alt" />
        <div className="h-24 animate-pulse rounded-xl bg-panel-alt" />
        <div className="h-16 animate-pulse rounded-xl bg-panel-alt" />
      </div>

      <p className="mt-4 text-[11.5px] text-muted">
        The Railway backend may cold-start on the first request — this can take
        ~15 seconds.
      </p>
    </div>
  );
}

type ErrorProps = {
  message: string;
  onRetry: () => void;
};

// Shown when analyze() throws or the API returns non-2xx. `message` is the
// technical detail (usually the FastAPI `detail` field the client already
// extracted); the friendly headline stays constant so nothing raw ever reads
// like a stack trace above the fold.
export function ErrorState({ message, onRetry }: ErrorProps) {
  return (
    <div className="rounded-2xl border border-decision-red bg-panel p-5">
      <div className="mb-3 flex items-start gap-2 text-decision-red">
        <XCircle size={20} className="mt-0.5 shrink-0" />
        <h3 className="font-serif text-base font-semibold leading-tight">
          Analysis failed — the backend couldn't process this file
        </h3>
      </div>
      <p className="mb-4 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-muted">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-lg border border-line bg-panel-alt px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-raised"
      >
        <RotateCw size={14} /> Retry
      </button>
    </div>
  );
}
