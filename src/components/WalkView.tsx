"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { NeedsInputOption } from "@/ui/contract";
import { STAGES, trailState, type RunState, type TrailLine } from "@/ui/runState";
import { Stages } from "./Stages";

type Props = {
  state: RunState;
  onChoose: (selections: NeedsInputOption[]) => void;
  onRetry: () => void;
  onReset: () => void;
};

/** Typical range for a live run, shown up front so the wait feels expected rather than stuck. */
const TYPICAL_RANGE = "20 to 60 seconds";
const SLOW_AFTER_S = 90;

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Choices({ state, onChoose }: { state: RunState; onChoose: Props["onChoose"] }) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  const input = state.needsInput;
  if (!input) return null;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="choices" role="group" aria-labelledby="choices-q">
      <p id="choices-q" className="choices__q">
        {input.question}
      </p>
      <ul>
        {input.options.map((o) => (
          <li key={o.qlooId}>
            <button type="button" className="chip" aria-pressed={picked.includes(o.qlooId)} onClick={() => toggle(o.qlooId)}>
              {o.label}
              <span className="chip__kind">{o.kind}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn-primary"
        disabled={picked.length === 0}
        onClick={() => onChoose(input.options.filter((o) => picked.includes(o.qlooId)))}
      >
        {picked.length === 0 ? "Pick at least one" : `Continue with ${picked.length} selected`}
      </button>
    </div>
  );
}

/** Seconds since mount, ticking once a second. Mounted only while a run is in flight. */
function Elapsed({ onSlow }: { onSlow: (slow: boolean) => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const slow = seconds >= SLOW_AFTER_S;
  useEffect(() => onSlow(slow), [slow, onSlow]);
  return <span className="walk__clock">{clock(seconds)} so far</span>;
}

const SR_TEXT = { pending: ", asking", ok: ", answered", skipped: ", left out to stay on time", failed: ", no answer" } as const;

function TrailItem({ line }: { line: TrailLine }) {
  const state = trailState(line);
  return (
    <li className="trail__line" data-state={state}>
      <span className="trail__mark" aria-hidden="true" />
      <span className="trail__text">
        <span className="trail__label">{line.label}</span>
        <span className="sr-only">{SR_TEXT[state]}</span>
        {line.summary ? <span className="trail__summary">{line.summary}</span> : null}
      </span>
      {line.durationMs !== undefined ? <span className="trail__time">{(line.durationMs / 1000).toFixed(1)}s</span> : null}
    </li>
  );
}

/** Where the run is, in plain words: the first active stage, else the next one waiting. */
function currentStep(stages: RunState["stages"]): { index: number; plain: string } {
  const active = STAGES.findIndex((s) => stages[s.key].status === "active");
  const waiting = STAGES.findIndex((s) => stages[s.key].status === "idle");
  const index = active >= 0 ? active : Math.max(0, waiting);
  return { index, plain: STAGES[index]?.plain ?? "" };
}

export function WalkView({ state, onChoose, onRetry, onReset }: Props) {
  const running = state.phase === "running";
  const [slow, setSlow] = useState(false);
  const step = currentStep(state.stages);
  const doneCount = STAGES.filter((s) => state.stages[s.key].status === "done").length;
  const asked = state.trail.length;
  const answered = state.trail.filter((l) => !l.pending && trailState(l) !== "skipped").length;
  const leftOut = state.trail.filter((l) => trailState(l) === "skipped").length;
  const progress = Math.min(1, (doneCount + (running ? 0.4 : 0)) / STAGES.length);
  return (
    <section className="walk" aria-labelledby="walk-h" aria-busy={running}>
      <header className="walk__head">
        <h2 id="walk-h" className="walk__title">
          {state.phase === "needs_input"
            ? "One quick question"
            : state.phase === "error"
              ? "The walk was interrupted"
              : "Walking the taste graph"}
        </h2>
        {running ? (
          <p className="walk__eta">
            Most briefs take {TYPICAL_RANGE}. <Elapsed onSlow={setSlow} />
          </p>
        ) : null}
      </header>

      <div className="walk__sheet" style={{ "--p": progress } as CSSProperties}>
        <Stages stages={state.stages} />
        {running ? (
          <p className="walk__now" role="status">
            <span className="walk__step">
              Step {step.index + 1} of {STAGES.length}
            </span>
            {step.plain}
            {slow ? ". This one is taking longer than usual; the studio may be busy, and it is still working." : ""}
          </p>
        ) : null}
      </div>

      <div className="walk__log">
        {asked > 0 ? (
          <p className="walk__count">
            {answered} of {asked} questions answered by Qloo
            {leftOut > 0 ? `, ${leftOut} left out to stay on time` : ""}
          </p>
        ) : null}
        <ol className="trail" aria-label="What we asked Qloo" aria-live="polite">
          {state.trail.map((line) => (
            <TrailItem key={line.id} line={line} />
          ))}
          {state.trail.length === 0 && running ? (
            <li className="trail__line" data-state="pending">
              <span className="trail__mark" aria-hidden="true" />
              <span className="trail__text muted">Reading your description. The first questions to Qloo appear here.</span>
            </li>
          ) : null}
        </ol>
      </div>

      <Choices key={state.needsInput?.question} state={state} onChoose={onChoose} />

      {state.phase === "error" && state.error ? (
        <div className="calm" role="alert" data-retryable={state.error.retryable}>
          <p className="calm__title">{state.error.retryable ? "The studio is busy, so we paused." : "We could not finish this brief."}</p>
          <p>{state.error.message}</p>
          <div className="calm__actions">
            {state.error.retryable ? (
              <button type="button" className="btn-primary" onClick={onRetry}>
                Try again
              </button>
            ) : null}
            <button type="button" className="link-quiet" onClick={onReset}>
              Edit the request
            </button>
          </div>
        </div>
      ) : null}
      {running ? (
        <button type="button" className="link-quiet walk__cancel" onClick={onReset}>
          Cancel
        </button>
      ) : null}
    </section>
  );
}
