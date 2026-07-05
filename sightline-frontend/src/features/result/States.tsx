import { Loader2, ScrollText, XCircle } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-line p-10 text-center text-muted">
      <ScrollText size={30} className="text-line" />
      <p className="mt-3 max-w-xs text-sm">
        Pick a borrower on the left and hit Analyse. You'll get a scored decision, the factors behind it, and a drafted credit memo.
      </p>
    </div>
  );
}

export function RunningState() {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-line p-10 text-center text-muted">
      <Loader2 size={26} className="animate-spin text-gold" />
      <p className="mt-3 text-[13.5px]">
        Reading the file, running the numbers, drafting the memo…
      </p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-decision-red bg-panel p-5">
      <div className="mb-2 flex items-center gap-2 text-decision-red">
        <XCircle size={18} />
        <h3 className="font-serif text-base font-semibold">Analysis failed</h3>
      </div>
      <p className="font-mono text-sm text-sub">{message}</p>
    </div>
  );
}
