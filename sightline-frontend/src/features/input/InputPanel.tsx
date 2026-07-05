import { useEffect, useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { Panel } from "../../components/Panel";
import { StepRow, type StepState } from "../../components/StepRow";
import { DEFAULT_SAMPLE_KEY, SAMPLES, type SampleKey } from "./samples";

type Props = {
  onAnalyze: (text: string) => void;
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
const STEP_MS = 400;

export function InputPanel({ onAnalyze, onReset, loading, hasResult }: Props) {
  const defaultSample = SAMPLES.find((s) => s.key === DEFAULT_SAMPLE_KEY)!;
  const [sampleKey, setSampleKey] = useState<SampleKey>(defaultSample.key);
  const [text, setText] = useState<string>(defaultSample.text);
  const [steps, setSteps] = useState<PipelineSteps>(ALL_WAIT);

  // Pipeline animation: while loading, roll each step wait→run→done at a
  // fixed cadence — the API is atomic so this is theatre, not real telemetry.
  // When the result lands, snap all steps to done. On error or idle, reset.
  useEffect(() => {
    if (loading) {
      setSteps(ALL_WAIT);
      const timers: number[] = [];
      STEP_KEYS.forEach((s, i) => {
        timers.push(
          window.setTimeout(
            () => setSteps((prev) => ({ ...prev, [s]: "run" })),
            i * STEP_MS,
          ),
        );
        timers.push(
          window.setTimeout(
            () => setSteps((prev) => ({ ...prev, [s]: "done" })),
            (i + 1) * STEP_MS,
          ),
        );
      });
      return () => timers.forEach(clearTimeout);
    }
    setSteps(hasResult ? ALL_DONE : ALL_WAIT);
  }, [loading, hasResult]);

  const pickSample = (key: SampleKey) => {
    if (key === sampleKey) return;
    setSampleKey(key);
    setText(SAMPLES.find((s) => s.key === key)!.text);
    onReset();
  };

  const canSubmit = !loading && text.trim().length >= 40;

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
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="block h-[260px] w-full resize-y rounded-xl border border-line bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-sub"
        />

        <button
          type="button"
          onClick={() => onAnalyze(text)}
          disabled={!canSubmit}
          className={
            "mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-canvas disabled:cursor-default disabled:opacity-60 " +
            (loading ? "bg-raised" : "bg-gold")
          }
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Analysing…
            </>
          ) : (
            <>
              <Sparkles size={16} /> Analyse file
            </>
          )}
        </button>

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
