import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import type { AnalysisResult, OfficerAction } from "../../api/client";
import { submitOversight } from "../../api/client";

// EU AI Act Article 14 — the officer's checkpoint. Three states:
//   Awaiting    — result.officer_action is null; both buttons visible.
//   Confirmed   — result.officer_action === "CONFIRMED"; green left border.
//   Overridden  — result.officer_action === "OVERRIDDEN"; amber left border,
//                 note surfaced as a quoted block.
//
// The click flow is optimistic + rollback: on Confirm/Override click we
// flip the pending state immediately, then POST. If the POST fails, we
// revert to Awaiting AND surface the error (a silent stay-in-flipped-state
// would be a bug — the button would appear "stuck acted-on" when the
// server never received the action).
//
// `onUpdated` is how the parent hears about a successful POST: it hands
// back the fresh AnalysisResult with the three officer_* fields populated,
// and the parent replaces its result state. This is what keeps the widget
// consistent when the same analysis is re-rendered — the widget reads
// result.officer_action, so once the parent updates its state, this
// widget's next render sees the persisted server state without any
// Awaiting flash between the pending optimistic state and the confirmed
// server state.
//
// `key={result.id}` on the caller side ensures the widget remounts on a
// different analysis (fresh local state); prop change on the SAME analysis
// just re-renders and useEffect clears any leftover pending state.

type Props = {
  result: AnalysisResult;
  onUpdated?: (updated: AnalysisResult) => void;
};

type Pending = { action: OfficerAction; note: string | null };

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function HumanOversight({ result, onUpdated }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // When the parent hands us an updated result with officer_action populated,
  // the server has confirmed our action — clear the local optimistic state.
  // effectiveAction below then reads from result.officer_action, and the UI
  // stays on the flipped state without any Awaiting flash.
  useEffect(() => {
    if (result.officer_action) {
      setPending(null);
      setShowNoteEditor(false);
      setNoteText("");
      setError(null);
    }
  }, [result.officer_action, result.officer_note, result.officer_action_at]);

  const effectiveAction: OfficerAction | null =
    (result.officer_action as OfficerAction | null | undefined) ??
    pending?.action ??
    null;
  const effectiveNote = result.officer_note ?? pending?.note ?? null;
  const effectiveAt = result.officer_action_at ?? null;

  async function submit(action: OfficerAction, note: string | null) {
    setError(null);
    setSubmitting(true);
    setPending({ action, note });
    setShowNoteEditor(false);
    try {
      const updated = await submitOversight(
        result.id,
        action,
        note ?? undefined,
      );
      onUpdated?.(updated);
      // If the parent didn't provide onUpdated, the pending state stays
      // as the visible truth. Effective action still reads correctly.
    } catch (e) {
      // Rollback: unset the optimistic flip, surface the error, and
      // reopen the note editor with the text preserved so the officer
      // can retry without re-typing.
      setPending(null);
      setError(e instanceof Error ? e.message : String(e));
      if (action === "OVERRIDDEN") {
        setShowNoteEditor(true);
        setNoteText(note ?? "");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const trimmedNote = noteText.trim();
  const canSubmitOverride = trimmedNote.length > 0 && !submitting;

  // Decision colour lives on the left edge only — matches CONTRACT.md
  // (decision-* tokens for decision-driven state, gold reserved for CTA).
  const surfaceClass =
    effectiveAction === "CONFIRMED"
      ? "border border-line border-l-4 border-l-decision-green"
      : effectiveAction === "OVERRIDDEN"
        ? "border border-line border-l-4 border-l-decision-amber"
        : "border border-line";

  return (
    <div className={`rounded-2xl bg-panel p-5 ${surfaceClass}`}>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={18} className="text-gold" />
        <h3 className="font-serif text-base font-semibold text-ink">
          Human oversight
        </h3>
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
        Under the EU AI Act (Article 14), a credit officer must review and be
        able to override the model. This is the checkpoint.
      </p>

      {/* CONFIRMED state */}
      {effectiveAction === "CONFIRMED" && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-decision-green">
          <CheckCircle2 size={15} /> Confirmed
          {effectiveAt && (
            <span className="font-mono text-[11.5px] text-muted">
              · {formatDate(effectiveAt)}
            </span>
          )}
        </div>
      )}

      {/* OVERRIDDEN state */}
      {effectiveAction === "OVERRIDDEN" && (
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-decision-amber">
            <AlertTriangle size={15} /> Overridden — routed to committee
            {effectiveAt && (
              <span className="font-mono text-[11.5px] text-muted">
                · {formatDate(effectiveAt)}
              </span>
            )}
          </div>
          {effectiveNote && (
            <blockquote className="mt-2 rounded-lg border border-line bg-panel-alt px-3 py-2 text-[13px] leading-relaxed text-sub">
              {effectiveNote}
            </blockquote>
          )}
        </div>
      )}

      {/* AWAITING — buttons or note editor */}
      {effectiveAction === null && !showNoteEditor && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => submit("CONFIRMED", null)}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-lg bg-decision-green px-3.5 py-2.5 text-[13px] font-semibold text-canvas disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 size={15} /> Confirm decision
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowNoteEditor(true);
            }}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-transparent px-3.5 py-2.5 text-[13px] font-semibold text-sub disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowRight size={15} /> Override & escalate
          </button>
        </div>
      )}

      {effectiveAction === null && showNoteEditor && (
        <div>
          <label className="mb-1 block text-xs text-sub" htmlFor="oversight-note">
            Reason for override <span className="text-decision-red">*</span>
          </label>
          <textarea
            id="oversight-note"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g., Concentration risk outweighs the DSCR — routing to committee."
            className="mb-3 block w-full rounded-lg border border-line bg-canvas p-3 text-sm text-ink placeholder:text-muted"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => submit("OVERRIDDEN", trimmedNote)}
              disabled={!canSubmitOverride}
              className="flex items-center gap-1.5 rounded-lg bg-decision-amber px-3.5 py-2 text-[13px] font-semibold text-canvas disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowRight size={15} /> Confirm override
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNoteEditor(false);
                setNoteText("");
                setError(null);
              }}
              disabled={submitting}
              className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold text-sub disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-[12.5px] text-decision-red">{error}</p>
      )}
    </div>
  );
}
