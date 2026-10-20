import { describe, expect, it } from "vitest";
import type { UiEvent } from "../contract";
import { sampleBrief } from "../fixtures/sampleBrief";
import { INITIAL_RUN, reduceEvent, startRun, type RunState } from "../runState";

const fold = (events: UiEvent[], from: RunState = startRun()): RunState => events.reduce(reduceEvent, from);

describe("live walk state", () => {
  it("keeps the question and the answer apart so the UI can show names arriving", () => {
    const state = fold([
      { type: "tool_call", id: "t1", name: "qloo_search", args: { query: "Radiohead" } },
      { type: "tool_result", id: "t1", name: "qloo_search", ok: true, summary: "1 match: Radiohead" },
    ]);
    expect(state.trail[0]).toMatchObject({ label: 'Looked up "Radiohead" in Qloo', summary: "1 match: Radiohead", pending: false, ok: true });
  });

  it("reads the optional durationMs and ignores nonsense values", () => {
    const call = { type: "tool_call", id: "t1", name: "qloo_trending", args: {} } as const;
    const withMs = fold([call, { type: "tool_result", id: "t1", name: "qloo_trending", ok: true, summary: "ok", durationMs: 1234 } as UiEvent]);
    expect(withMs.trail[0].durationMs).toBe(1234);
    const bad = fold([call, { type: "tool_result", id: "t1", name: "qloo_trending", ok: true, summary: "ok", durationMs: "slow" } as unknown as UiEvent]);
    expect(bad.trail[0].durationMs).toBeUndefined();
    const absent = fold([call, { type: "tool_result", id: "t1", name: "qloo_trending", ok: true, summary: "ok" }]);
    expect(absent.trail[0]).not.toHaveProperty("durationMs");
  });

  it("accepts a brief that arrives before its proof, and marks the stream ended only on done", () => {
    const afterBrief = fold([{ type: "brief", brief: sampleBrief, dropped: [], evidence: [] }]);
    expect(afterBrief.phase).toBe("done");
    expect(afterBrief.proof).toBeUndefined();
    expect(afterBrief.ended).toBeUndefined();
    const afterDone = reduceEvent(afterBrief, { type: "done", ok: true });
    expect(afterDone.ended).toBe(true);
  });

  it("starts a run un-ended", () => {
    expect(INITIAL_RUN.ended).toBeUndefined();
    expect(startRun().ended).toBeUndefined();
  });
});
