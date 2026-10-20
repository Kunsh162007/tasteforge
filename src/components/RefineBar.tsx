"use client";

import type { BriefChanges } from "@/ui/briefChanges";
import type { FeedbackCounts } from "@/ui/feedback";
import type { RunState } from "@/ui/runState";
import { Stages } from "./Stages";

type Props = {
  counts: FeedbackCounts;
  canRefine: boolean;
  refine: RunState["refine"];
  stages: RunState["stages"];
  onRefine: () => void;
  onClear: () => void;
};

/** One-line explanation of the controls, shown until the user marks something. */
export function RefineHint() {
  return (
    <p className="refine-hint">
      <strong>Make it yours.</strong> Mark items: <span aria-hidden="true">👍</span> keep and find more like it,{" "}
      <span aria-hidden="true">👎</span> replace it, <span aria-hidden="true">🔒</span> keep exactly as is. Then refine.
    </p>
  );
}

/** Sticky action bar for the refine loop, with its busy and error states. */
export function RefineBar({ counts, canRefine, refine, stages, onRefine, onClear }: Props) {
  if (refine?.status === "running") {
    return (
      <section className="refine refine--busy" role="status" aria-live="polite" aria-label="Refining the brief">
        <p className="refine__title">Refining: re-walking only the sections you marked.</p>
        <Stages stages={stages} />
      </section>
    );
  }
  if (refine?.status === "error") {
    return (
      <section className="refine refine--error" role="alert">
        <p className="refine__title">The refinement did not finish. Your brief is unchanged.</p>
        <p>{refine.message}</p>
        <div className="refine__actions">
          {refine.retryable !== false ? (
            <button type="button" className="btn-primary" onClick={onRefine}>
              Try again
            </button>
          ) : null}
          <button type="button" className="link-quiet" onClick={onClear}>
            Clear my marks
          </button>
        </div>
      </section>
    );
  }
  const total = counts.liked + counts.disliked + counts.locked;
  if (total === 0) return null;
  const parts = [
    counts.disliked > 0 ? `${counts.disliked} to replace` : "",
    counts.liked > 0 ? `${counts.liked} liked` : "",
    counts.locked > 0 ? `${counts.locked} locked` : "",
  ].filter(Boolean);
  return (
    <section className="refine" aria-label="Refine the brief">
      <p className="refine__count" aria-live="polite">
        {parts.join(" · ")}
      </p>
      <div className="refine__actions">
        <button type="button" className="btn-primary" disabled={!canRefine} onClick={onRefine}>
          Refine brief
        </button>
        <button type="button" className="link-quiet" onClick={onClear}>
          Clear marks
        </button>
      </div>
      {!canRefine ? <p className="refine__note">Like or dislike at least one item to refine. Locks only protect items.</p> : null}
    </section>
  );
}

/** Short "what changed" summary after a refine run. */
export function ChangeSummary({ changes, onDismiss }: { changes: BriefChanges; onDismiss: () => void }) {
  return (
    <aside className="changes" role="status" aria-label="What changed">
      <h2 className="changes__title">What changed</h2>
      <p className="changes__text">{changes.summary}</p>
      <button type="button" className="link-quiet" onClick={onDismiss}>
        Dismiss
      </button>
    </aside>
  );
}
