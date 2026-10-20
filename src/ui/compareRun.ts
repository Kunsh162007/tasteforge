import { startRun, type RunState } from "./runState";

/** Run state for the second city: a normal run, but the Taste Proof stage never runs. */
export function startCompare(request: NonNullable<RunState["request"]>): RunState {
  const run = startRun(request);
  return { ...run, stages: { ...run.stages, proof: { status: "skipped", detail: "not needed" } } };
}

/** The city a finished run was about, if any. */
export const cityOf = (state: RunState): string | undefined => state.request?.city ?? state.brief?.whereTheyAre?.city;
