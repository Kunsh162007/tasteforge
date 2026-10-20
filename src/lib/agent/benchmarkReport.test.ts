import { describe, expect, it } from "vitest";
import type { PickOutcome } from "./benchmark";
import { renderBenchmark, type BenchRun } from "./benchmarkReport";

const pick = (name: string, kind: PickOutcome["kind"], found: boolean, extra: Partial<PickOutcome> = {}): PickOutcome => ({ kind, name, found, affinity: found ? 0.5 : null, ...extra });

const run: BenchRun = {
  id: "london-cafe",
  city: "London",
  type: "cafe",
  seconds: 20,
  grounding: 1,
  baseline: [pick("Real Cafe", "place", true, { offCity: false }), pick("Ghost Cafe", "place", false), pick("Far Cafe", "place", true, { offCity: true }), pick("Radiohead", "artist", true)],
  tasteforge: [pick("Local Cafe", "place", true, { offCity: false }), pick("Mitski", "artist", true)],
};

describe("renderBenchmark", () => {
  const md = renderBenchmark({
    runs: [run],
    consistency: [{ id: "london-cafe", baselineOverlap: 0.4, tasteforgeOverlap: 0.9, groundings: [1, 0.95], picks: [16, 12] }],
    prompts: [{ id: "london-cafe", city: "London", type: "cafe", mode: "find_audience", prompt: "A cafe" }],
    models: ["groq:openai/gpt-oss-120b"],
    date: "2026-10-20",
    llmCalls: 12,
  });

  it("reports the unverified share of baseline places and lists the failures by name", () => {
    expect(md).toContain("67%"); // 1 not found + 1 off-city of 3 places
    expect(md).toContain("Ghost Cafe (place, not found)");
    expect(md).toContain("Far Cafe (place, other city)");
  });

  it("shows consistency, models and the caveats", () => {
    expect(md).toContain("| london-cafe | 40% | 90% | 16 and 12 | 100% and 95% |");
    expect(md).toContain("groq:openai/gpt-oss-120b");
    expect(md).toContain("Qloo's catalogue is not the world");
  });
});
