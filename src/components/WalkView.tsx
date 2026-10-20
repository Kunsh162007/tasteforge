"use client";

import { useState } from "react";
import type { NeedsInputOption } from "@/ui/contract";
import type { RunState } from "@/ui/runState";
import { Stages } from "./Stages";

type Props = {
  state: RunState;
  onChoose: (selections: NeedsInputOption[]) => void;
  onRetry: () => void;
  onReset: () => void;
};

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

export function WalkView({ state, onChoose, onRetry, onReset }: Props) {
  const running = state.phase === "running";
  return (
    <section className="walk" aria-labelledby="walk-h" aria-busy={running}>
      <h2 id="walk-h" className="walk__title">
        {state.phase === "needs_input"
          ? "One quick question"
          : state.phase === "error"
            ? "The walk was interrupted"
            : "Walking the taste graph"}
      </h2>
      <Stages stages={state.stages} />

      <ol className="trail" aria-label="What we asked Qloo" aria-live="polite">
        {state.trail.map((line) => (
          <li key={line.id} className="trail__line" data-pending={line.pending} data-ok={line.ok}>
            {line.text}
            {line.pending ? "..." : ""}
          </li>
        ))}
        {state.trail.length === 0 && running ? <li className="trail__line muted">Reading your description...</li> : null}
      </ol>

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
        <button type="button" className="link-quiet" onClick={onReset}>
          Cancel
        </button>
      ) : null}
    </section>
  );
}
