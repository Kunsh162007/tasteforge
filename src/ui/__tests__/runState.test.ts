import { describe, expect, it } from "vitest";
import { reduceEvent, stageNote, startRun, trailState } from "../runState";

describe("trailState and stageNote", () => {
  it("treats a call the server left out to stay on time as skipped, not failed", () => {
    expect(trailState({ pending: false, ok: false, summary: "Left out: no answer within the time budget." })).toBe("skipped");
    expect(trailState({ pending: false, ok: false, summary: "Qloo answered 500" })).toBe("failed");
    expect(trailState({ pending: false, ok: true, summary: "10 places" })).toBe("ok");
    expect(trailState({ pending: true, ok: true })).toBe("pending");
  });

  it("recognises partial walks and a critic skipped for time", () => {
    expect(stageNote("12 evidence records, partial: 2 calls cut off")).toBe("partial");
    expect(stageNote("skipped, out of time")).toBe("skipped");
    expect(stageNote("coverage looks good")).toBeUndefined();
    expect(stageNote(undefined)).toBeUndefined();
  });
});

describe("queue notice", () => {
  it("is shown while the server queues the run and cleared by the next progress event", () => {
    const queued = reduceEvent(startRun(), { type: "queue", waitSeconds: 9 });
    expect(queued.queue).toEqual({ waitSeconds: 9 });
    expect(reduceEvent(queued, { type: "queue", waitSeconds: 5 }).queue).toEqual({ waitSeconds: 5 });
    const resumed = reduceEvent(queued, { type: "stage", stage: "synthesis", status: "start" });
    expect(resumed.queue).toBeUndefined();
    expect(resumed.stages.synthesis.status).toBe("active");
  });

  it("ignores unknown event types from newer servers", () => {
    const state = startRun();
    expect(reduceEvent(state, { type: "something_new" } as never)).toBe(state);
  });
});
