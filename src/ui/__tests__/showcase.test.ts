import { describe, expect, it } from "vitest";
import { sampleBrief, sampleEvidence, sampleProof } from "../fixtures/sampleBrief";
import { isSettled, pollDelay, showcaseToRunState, type ShowcaseItem } from "../showcase";

const base = { id: "a", title: "A", prompt: "p", mode: "know_audience" as const };

describe("showcase polling", () => {
  it("backs off and caps the delay", () => {
    expect(pollDelay(0)).toBe(1500);
    expect(pollDelay(1)).toBeGreaterThan(pollDelay(0));
    expect(pollDelay(20)).toBe(8000);
  });

  it("settles only when nothing is generating or pending", () => {
    const ready: ShowcaseItem = { ...base, status: "ready" };
    expect(isSettled([ready, { ...base, id: "b", status: "failed" }])).toBe(true);
    expect(isSettled([ready, { ...base, id: "c", status: "generating" }])).toBe(false);
    expect(isSettled([{ ...base, status: "queued" }])).toBe(false);
  });
});

describe("showcaseToRunState", () => {
  it("returns null until the item is ready", () => {
    expect(showcaseToRunState({ ...base, status: "generating" })).toBeNull();
  });

  it("replays a ready item as a finished run with its ledger and proof", () => {
    const run = showcaseToRunState({
      ...base,
      status: "ready",
      brief: sampleBrief,
      dropped: [],
      evidence: sampleEvidence,
      proof: sampleProof,
      trail: [{ type: "stage", stage: "walk", status: "done" }],
    });
    expect(run?.phase).toBe("done");
    expect(run?.proof).toEqual(sampleProof);
    expect(Object.keys(run?.evidence ?? {})).toHaveLength(sampleEvidence.length);
    expect(run?.stages.walk.status).toBe("done");
  });
});
