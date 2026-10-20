import { describe, expect, it } from "vitest";
import { cityOf, startCompare } from "../compareRun";
import { demoRunState } from "../demoState";
import { reduceEvent } from "../runState";

describe("startCompare", () => {
  it("starts a running state with the proof stage skipped", () => {
    const run = startCompare({ prompt: "p", mode: "know_audience", city: "London" });
    expect(run.phase).toBe("running");
    expect(run.stages.proof.status).toBe("skipped");
    expect(run.stages.seeds.status).toBe("idle");
    expect(run.request?.city).toBe("London");
  });

  it("finishes with a brief like a normal run", () => {
    const run = startCompare({ prompt: "p", mode: "know_audience", city: "London" });
    const done = reduceEvent(run, { type: "brief", brief: demoRunState.brief!, dropped: [], evidence: [] });
    expect(done.phase).toBe("done");
  });
});

describe("cityOf", () => {
  it("prefers the request city, then the brief's own", () => {
    expect(cityOf({ ...demoRunState, request: { prompt: "p", mode: "know_audience", city: "Indore" } })).toBe("Indore");
    expect(cityOf(demoRunState)).toBe("Brooklyn");
  });
});
