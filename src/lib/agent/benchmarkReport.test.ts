import { describe, expect, it } from "vitest";
import type { PickOutcome } from "./benchmark";
import { patchConsistency, renderBenchmark, type BenchRun } from "./benchmarkReport";

const pick = (name: string, kind: PickOutcome["kind"], status: PickOutcome["status"]): PickOutcome => ({ kind, name, status, affinity: status === "verified" ? 0.5 : null });

const run: BenchRun = {
  id: "london-cafe",
  city: "London",
  type: "cafe",
  seconds: 20,
  grounding: 1,
  baseline: [
    pick("Real Cafe", "place", "verified"),
    pick("Ghost Cafe", "place", "unverified"),
    pick("Far Cafe", "place", "other_city"),
    pick("Radiohead", "artist", "verified"),
    pick("Arundhati Roy", "artist", "wrong_type"),
  ],
  tasteforge: [pick("Local Cafe", "place", "verified"), pick("Mitski", "artist", "verified")],
};

describe("renderBenchmark", () => {
  const md = renderBenchmark({
    runs: [run],
    consistency: [{ id: "london-cafe", baselineOverlap: 0.4, tasteforgeOverlap: 0.9, groundings: [1, 0.95], picks: [16, 12] }],
    prompts: [{ id: "london-cafe", city: "London", type: "cafe", mode: "find_audience", prompt: "A cafe" }],
    models: ["groq:openai/gpt-oss-120b"],
    date: "2026-10-20",
    llmCalls: 12,
    audit: { "place|ghost": { class: "likely_invented" } },
  });

  it("leads with 'couldn't be verified', never with 'invented', and shows the breakdown", () => {
    expect(md).toContain("Picks Qloo could not verify in the requested city");
    expect(md).toContain("60%"); // 3 of 5 baseline picks
    expect(md).toContain("67%"); // 2 of 3 places
    expect(md).toContain("| (a) Likely invented: no evidence it exists | 1 |");
    expect(md).toContain("| (b) Qloo lists the name under another type (mostly real people and companies) | 1 |");
    expect(md).toContain("| (c) Qloo lists a place of that name only in another city (may be a namesake) | 1 |");
    expect(md.toLowerCase()).not.toContain("fabrication benchmark");
  });

  it("lists the failures by name and class, and keeps fit out of the claims", () => {
    expect(md).toContain("Ghost Cafe (place; Likely invented: no evidence it exists)");
    expect(md).toContain("Far Cafe (place; Qloo lists a place of that name only in another city (may be a namesake))");
    expect(md).toContain("normalizes affinity within each query");
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
