import { describe, expect, it } from "vitest";
import type { PickOutcome } from "./benchmark";
import { patchConsistency, renderBenchmark, type BenchRun } from "./benchmarkReport";

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

describe("patchConsistency", () => {
  const original = renderBenchmark({
    runs: [run],
    consistency: [{ id: "london-cafe", baselineOverlap: 0.4, tasteforgeOverlap: 0.2, groundings: [1, 1], picks: [0, 10] }],
    prompts: [{ id: "london-cafe", city: "London", type: "cafe", mode: "find_audience", prompt: "A cafe" }],
    models: ["m"],
    date: "2026-10-20",
    llmCalls: 1,
  });
  const patch = { date: "2026-10-21", notes: "Seeds cached.", beforeLabel: "2026-10-20" };
  const rows = [{ id: "london-cafe", baselineOverlap: 0.3, tasteforgeOverlap: 0.8, groundings: [1, 1] as const, picks: [12, 12] as const }];

  it("shows the new numbers, keeps the old ones as a Before table and updates the headline", () => {
    const md = patchConsistency(original, rows, patch);
    expect(md).toContain("### After (2026-10-21)");
    expect(md).toContain("| london-cafe | 30% | 80% | 12 and 12 | 100% and 100% |");
    expect(md).toContain("### Before (2026-10-20)");
    expect(md).toContain("| london-cafe | 40% | 20% | 0 and 10 | 100% and 100% |");
    expect(md).toContain("picks overlap 30% for the plain LLM and 80% for TasteForge");
    expect(md).toContain("## Method");
  });

  it("keeps the first Before table when patched again", () => {
    const once = patchConsistency(original, rows, patch);
    const twice = patchConsistency(once, [{ ...rows[0], tasteforgeOverlap: 0.9 }], { ...patch, date: "2026-10-22" });
    expect(twice).toContain("| london-cafe | 40% | 20% | 0 and 10 | 100% and 100% |");
    expect(twice).toContain("| london-cafe | 30% | 90% | 12 and 12 | 100% and 100% |");
    expect(twice.match(/### Before/g)).toHaveLength(1);
  });
});
