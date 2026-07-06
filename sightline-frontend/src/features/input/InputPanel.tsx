import { useEffect, useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import type { AnalysisResult } from "../../api/client";
import { analyze, analyzeFiles } from "../../api/client";
import { DropZone, type UploadedFile } from "../../components/DropZone";
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

export function InputPanel({ onSubmit, onReset, loading, hasResult }: Props) {
  const defaultSample = SAMPLES.find((s) => s.key === DEFAULT_SAMPLE_KEY)!;
  const [sampleKey, setSampleKey] = useState<SampleKey | null>(defaultSample.key);
  const [text, setText] = useState<string>(defaultSample.text);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [steps, setSteps] = useState<PipelineSteps>(ALL_WAIT);

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
    setUploadedFiles([]);
    setFileError(null);
    onReset();
  };

  function handleFiles(newFiles: UploadedFile[]) {
    setFileError(null);
    setUploadedFiles((prev) => [...prev, ...newFiles]);
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

  const currentBytes = uploadedFiles.reduce((s, u) => s + u.file.size, 0);

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

        <div className="mt-3">
          <DropZone
            onFiles={handleFiles}
            onError={setFileError}
            existingCount={uploadedFiles.length}
            existingBytes={currentBytes}
          />
        </div>

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
