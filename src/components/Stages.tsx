import { STAGES, stageNote, type RunState, type StageStatus } from "@/ui/runState";

const STATUS_TEXT: Record<StageStatus, string> = {
  idle: ", waiting",
  active: ", in progress",
  done: ", done",
  failed: ", failed",
  skipped: ", skipped",
};

/** Progress strip for the pipeline stages. A failure marks the failing stage and skips the ones after it. */
export function Stages({ stages }: { stages: RunState["stages"] }) {
  return (
    <ol className="stages" aria-label="Progress">
      {STAGES.map((s) => {
        const st = stages[s.key];
        return (
          <li key={s.key} className="stage" data-status={st.status} aria-current={st.status === "active" ? "step" : undefined}>
            <span className="stage__dot" aria-hidden="true" />
            <span className="stage__label">{s.label}</span>
            <span className="sr-only">{STATUS_TEXT[st.status]}</span>
            {st.detail ? (
              <span className="stage__detail" data-note={stageNote(st.detail)}>
                {st.detail}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
