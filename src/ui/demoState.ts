import { INITIAL_RUN, type RunState } from "./runState";
import { sampleBrief, sampleDropped, sampleEvidence, sampleProof } from "./fixtures/sampleBrief";

/** A finished run built from the synthetic fixture, rendered by ?demo=1. */
export const demoRunState: RunState = {
  ...INITIAL_RUN,
  phase: "done",
  ended: true,
  brief: sampleBrief,
  dropped: sampleDropped,
  proof: sampleProof,
  evidence: Object.fromEntries(sampleEvidence.map((e) => [e.id, e])),
};
