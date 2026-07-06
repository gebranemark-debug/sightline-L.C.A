import { useEffect, useState } from "react";
import { FileText, Loader2, Sparkles, Upload } from "lucide-react";
import type { AnalysisResult } from "../../api/client";
import { analyze, analyzeFiles } from "../../api/client";
import { FileChip } from "../../components/FileChip";
import { Panel } from "../../components/Panel";
import { StepRow, type StepState } from "../../components/StepRow";
import { DEFAULT_SAMPLE_KEY, SAMPLES, type SampleKey } from "./samples";

type Props = {
  onSubmit: (runner: () => Promise<AnalysisResult>) => void;
  onReset: () => void;
  loading: boolean;
  hasResult: boolean;
};

type PipelineSteps = {
  extract: StepState;
  compute: StepState;
  decide: StepState;
  memo: StepState;
};

type UploadedFile = { file: File; pageCount: number | null };

const ALL_WAIT: PipelineSteps = { extract: "wait", compute: "wait", decide: "wait", memo: "wait" };
const ALL_DONE: PipelineSteps = { extract: "done", compute: "done", decide: "done", memo: "done" };
const STEP_KEYS = ["extract", "compute", "decide", "memo"] as const;
const MIN_TEXT_LENGTH = 40;

// Expected duration for a Railway cold-start end-to-end. Each pipeline step
// gets one quarter of the timeline (~3.75s). The memo step (last) does NOT
// auto-complete: if the API is still pending past 15s, memo stays in "run"
// until the result actually lands and we snap the whole row to done.
const TOTAL_MS = 15000;
const STEP_MS = TOTAL_MS / STEP_KEYS.length;

// Upload limits — mirror backend gates (app/routers/analyses.py) so the user
// sees the friendly message before we round-trip.
const MAX_FILES = 10;
const MAX_BYTES_PER_FILE = 10 * 1024 * 1024;
const MAX_BYTES_TOTAL = 30 * 1024 * 1024;
const MAX_PAGES_PER_FILE = 100;

// Fast page-count sniff without pulling in a full PDF parser. Counts distinct
// `/Type /Page` objects (excluding the `/Type /Pages` tree root) in the raw
// PDF byte stream — accurate for well-formed PDFs, and null on decode failure
// so the chip degrades to just filename · size. The backend is still the
// authoritative gate (100-page cap enforced there via pypdf).
async function countPdfPages(file: File): Promise<number | null> {
  try {
    const buf = await file.arrayBuffer();
    const raw = new TextDecoder("latin1", { fatal: false }).decode(buf);
    const matches = raw.match(/\/Type\s*\/Page(?![s\w])/g);
    return matches?.length ?? null;
  } catch {
    return null;
  }
}

export function InputPanel({ onSubmit, onReset, loading, hasResult }: Props) {
  const defaultSample = SAMPLES.find((s) => s.key === DEFAULT_SAMPLE_KEY)!;
  const [sampleKey, setSampleKey] = useState<SampleKey | null>(defaultSample.key);
  const [text, setText] = useState<string>(defaultSample.text);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [steps, setSteps] = useState<PipelineSteps>(ALL_WAIT);

  const fileInputId = "loan-file-pdf-input";

  useEffect(() => {
    if (loading) {
      setSteps(ALL_WAIT);
      const timers: number[] = [];
      for (let i = 0; i < STEP_KEYS.length; i++) {
        const stepKey = STEP_KEYS[i];
        timers.push(
          window.setTimeout(
            () => setSteps((prev) => ({ ...prev, [stepKey]: "run" })),
            i * STEP_MS,
          ),
        );
        if (i < STEP_KEYS.length - 1) {
          timers.push(
            window.setTimeout(
              () => setSteps((prev) => ({ ...prev, [stepKey]: "done" })),
              (i + 1) * STEP_MS,
            ),
          );
        }
      }
      return () => timers.forEach(clearTimeout);
    }
    setSteps(hasResult ? ALL_DONE : ALL_WAIT);
  }, [loading, hasResult]);

  const pickSample = (key: SampleKey) => {
    if (key === sampleKey && uploadedFiles.length === 0) return;
    setSampleKey(key);
    setText(SAMPLES.find((s) => s.key === key)!.text);
    // Picking a sample means "use this text" — clear any staged files so the
    // Analyse button routes back through the text endpoint unambiguously.
    setUploadedFiles([]);
    setFileError(null);
    onReset();
  };

  async function stageFiles(incoming: File[]) {
    setFileError(null);
    if (incoming.length === 0) return;

    const currentCount = uploadedFiles.length;
    const currentTotal = uploadedFiles.reduce((s, u) => s + u.file.size, 0);
    if (currentCount + incoming.length > MAX_FILES) {
      setFileError(`Up to ${MAX_FILES} files per analysis.`);
      return;
    }

    const staged: UploadedFile[] = [];
    let runningTotal = currentTotal;
    for (const f of incoming) {
      const isPdf =
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setFileError(`${f.name}: only PDF files are supported.`);
        return;
      }
      if (f.size > MAX_BYTES_PER_FILE) {
        setFileError(
          `${f.name}: ${(f.size / 1_048_576).toFixed(1)} MB exceeds the 10 MB per-file limit.`,
        );
        return;
      }
      runningTotal += f.size;
      if (runningTotal > MAX_BYTES_TOTAL) {
        setFileError("Total upload exceeds the 30 MB request limit.");
        return;
      }
      const pageCount = await countPdfPages(f);
      if (pageCount != null && pageCount > MAX_PAGES_PER_FILE) {
        setFileError(
          `${f.name}: ${pageCount} pages exceeds the ${MAX_PAGES_PER_FILE}-page-per-file limit.`,
        );
        return;
      }
      staged.push({ file: f, pageCount });
    }

    setUploadedFiles((prev) => [...prev, ...staged]);
    // Uploading files means the sample tab is no longer the source of truth —
    // deselect it visually, but leave the textarea text where the user left it
    // (per the "textarea text pinned" rule).
    setSampleKey(null);
    onReset();
  }

  function removeFile(index: number) {
    setUploadedFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        // No files left — if the pinned textarea text happens to match a
        // known sample, re-highlight that tab. Otherwise leave it un-selected.
        const matched = SAMPLES.find((s) => s.text === text);
        setSampleKey(matched?.key ?? null);
      }
      return next;
    });
    setFileError(null);
    onReset();
  }

  const filesPresent = uploadedFiles.length > 0;
  const textOnly = !filesPresent;
  const isTextTooShort = text.trim().length < MIN_TEXT_LENGTH;
  const canSubmit = !loading && (filesPresent || !isTextTooShort);

  const buttonSurface = loading
    ? "bg-raised cursor-default"
    : canSubmit
      ? "bg-gold cursor-pointer hover:brightness-105"
      : "bg-gold opacity-40 cursor-not-allowed";

  const buttonLabel = loading
    ? "Analysing…"
    : filesPresent
      ? `Analyse ${uploadedFiles.length} ${uploadedFiles.length === 1 ? "file" : "files"}`
      : "Analyse file";

  function submit() {
    if (!canSubmit) return;
    if (filesPresent) {
      const files = uploadedFiles.map((u) => u.file);
      const supplement = text.trim() || undefined;
      onSubmit(() => analyzeFiles(files, supplement));
    } else {
      onSubmit(() => analyze(text));
    }
  }

  return (
    <>
      <Panel title="Loan file" icon={<FileText size={18} />}>
        <div className="mb-3 flex flex-wrap gap-2">
          {SAMPLES.map((s) => {
            const active = s.key === sampleKey;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => pickSample(s.key)}
                className={
                  active
                    ? "rounded-lg border border-gold bg-gold px-2.5 py-1.5 text-xs text-canvas"
                    : "rounded-lg border border-line bg-transparent px-2.5 py-1.5 text-xs text-sub hover:bg-panel-alt"
                }
              >
                {s.label} <span className="opacity-70">· {s.tag}</span>
              </button>
            );
          })}
        </div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Free-typing invalidates the sample-tab highlight — same rule as
            // dropping files: the tab only shines when the textarea is the
            // verbatim sample.
            if (sampleKey !== null && uploadedFiles.length === 0) {
              const stillMatches = SAMPLES.find(
                (s) => s.key === sampleKey && s.text === e.target.value,
              );
              if (!stillMatches) setSampleKey(null);
            }
          }}
          spellCheck={false}
          className="block h-[220px] w-full resize-y rounded-xl border border-line bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-sub"
        />

        {/* Drop zone — sits below the textarea, both surfaces stay usable
            simultaneously (sample tabs still work). Native HTML5 drag events;
            <label htmlFor> triggers the hidden file input on click, which keeps
            it keyboard-accessible via focus + Enter/Space on the input itself. */}
        <label
          htmlFor={fileInputId}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={async (e) => {
            e.preventDefault();
            setDragActive(false);
            const dropped = Array.from(e.dataTransfer.files);
            await stageFiles(dropped);
          }}
          className={
            "mt-3 flex cursor-pointer flex-col items-center rounded-xl border border-dashed p-4 text-center transition-colors " +
            (dragActive
              ? "border-gold bg-panel-alt"
              : "border-line bg-panel-alt/60 hover:border-gold hover:bg-panel-alt")
          }
        >
          <Upload size={18} className="text-muted" />
          <p className="mt-1 text-[12.5px] text-sub">
            Drop PDFs here or click to upload
          </p>
          <p className="text-[11px] text-muted">
            Up to {MAX_FILES} files · 10 MB each · 30 MB total · 100 pages max
          </p>
          <input
            id={fileInputId}
            type="file"
            multiple
            accept="application/pdf"
            className="sr-only"
            onChange={async (e) => {
              const picked = Array.from(e.target.files ?? []);
              await stageFiles(picked);
              // Reset the input value so re-picking the same file still fires.
              e.target.value = "";
            }}
          />
        </label>

        {uploadedFiles.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {uploadedFiles.map((u, i) => (
              <FileChip
                key={`${u.file.name}-${i}`}
                filename={u.file.name}
                sizeBytes={u.file.size}
                pageCount={u.pageCount}
                onRemove={() => removeFile(i)}
              />
            ))}
          </div>
        )}

        {fileError && (
          <p className="mt-2 text-[11.5px] text-decision-red">{fileError}</p>
        )}

        <button
          type="button"
          onClick={submit}
          aria-disabled={!canSubmit}
          className={
            "peer mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-canvas " +
            buttonSurface
          }
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {buttonLabel}
        </button>
        {/* Text-length caption only applies to the text-only path. When files
            are staged, the button enables regardless of textarea length (the
            text becomes an optional supplement to the PDFs). */}
        {textOnly && isTextTooShort && !loading && (
          <p className="mt-1.5 hidden text-[11.5px] text-muted peer-hover:block peer-focus:block">
            Loan file needs at least {MIN_TEXT_LENGTH} characters, or upload a PDF.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
          <StepRow state={steps.extract} label="Extract financials (LLM)" />
          <StepRow state={steps.compute} label="Compute ratios (code)" />
          <StepRow state={steps.decide} label="Score decision (code)" />
          <StepRow state={steps.memo} label="Draft memo (LLM)" />
        </div>
      </Panel>

      <p className="px-1 text-[11.5px] leading-relaxed text-muted">
        The model reads the file and writes the memo. Every ratio, red flag, and the decision itself are computed in code — so the numbers are exact and the reasoning is auditable. Figures shown are synthetic.
      </p>
    </>
  );
}
