import { describe, expect, it } from "vitest";
import type { LlmProvider } from "@/lib/llm";
import { paletteProblem } from "./palette";
import { requestDraft } from "./pipeline/synthesis";

const swatch = (label: string, hex: string, tags: string[] = ["Cozy"]) => ({ label, hex, evidence: ["ev_1"], tags });

const BEIGES = [swatch("Warm sand", "#D8C9A6"), swatch("Soft ivory", "#E6DCC3"), swatch("Light oat", "#DCCFB0"), swatch("Pale linen", "#E2D6BD")];
const WORKING = [swatch("Stone gray", "#8A8A8A"), swatch("Warm linen", "#D8C5A5"), swatch("Soft sage", "#A3B18A"), swatch("Terracotta ember", "#C65A44")];

describe("paletteProblem", () => {
  it("accepts a palette with neutrals and a clear accent, and an empty palette", () => {
    expect(paletteProblem(WORKING)).toBeUndefined();
    expect(paletteProblem([])).toBeUndefined();
  });

  it("flags near-identical beiges", () => {
    expect(paletteProblem(BEIGES)).toMatch(/too alike/);
  });

  it("flags labels that are just the source tag name", () => {
    expect(paletteProblem([swatch("Immersive", "#6B8E23", ["immersive"]), ...WORKING.slice(0, 3)])).toMatch(/real colour names/);
  });

  it("flags palettes that are too small", () => {
    expect(paletteProblem(WORKING.slice(0, 2))).toMatch(/4 or 5 swatches/);
  });
});

const draft = (palette: unknown[]) => ({
  title: "t",
  audienceProfile: { summary: "s", affinities: [] },
  aesthetic: { palette, lighting: [], materials: [], referencePlaces: [] },
  sound: { direction: "d", artists: [] },
  pairings: [],
  messaging: { tone: "", phrases: [], evidence: [] },
});

function scripted(replies: unknown[]): LlmProvider & { calls: number } {
  const state = { calls: 0 };
  return {
    name: "test",
    get calls() {
      return state.calls;
    },
    async chatJson() {
      return replies[Math.min(state.calls++, replies.length - 1)];
    },
  };
}

describe("requestDraft palette repair", () => {
  const check = (d: { aesthetic: { palette: Parameters<typeof paletteProblem>[0] } }) => paletteProblem(d.aesthetic.palette);

  it("asks once more when the palette is poor and uses the better reply", async () => {
    const llm = scripted([draft(BEIGES), draft(WORKING)]);
    const result = await requestDraft(llm, "s", "p", { qualityProblem: check });
    expect(llm.calls).toBe(2);
    expect(result.aesthetic.palette[3].label).toBe("Terracotta ember");
  });

  it("keeps the first draft when the repair round returns unusable JSON", async () => {
    const llm = scripted([draft(BEIGES), { nonsense: true }]);
    const result = await requestDraft(llm, "s", "p", { qualityProblem: check });
    expect(result.aesthetic.palette[0].label).toBe("Warm sand");
  });

  it("keeps the first draft when the repair call itself fails", async () => {
    let n = 0;
    const llm: LlmProvider = {
      name: "t",
      async chatJson() {
        if (n++ === 0) return draft(BEIGES);
        throw new Error("rate limited");
      },
    };
    const result = await requestDraft(llm, "s", "p", { qualityProblem: check });
    expect(result.aesthetic.palette).toHaveLength(4);
  });

  it("does not ask again when the first palette is fine", async () => {
    const llm = scripted([draft(WORKING)]);
    await requestDraft(llm, "s", "p", { qualityProblem: check });
    expect(llm.calls).toBe(1);
  });
});

describe("refine: disliking a named colour excludes its source Qloo tags", () => {
  it("resolves tags by the swatch's source tag names, not only by its label", async () => {
    const { buildPlan } = await import("./refine/plan");
    const evidence = [{ id: "ev_1", endpoint: "/v2/insights", params: {}, summary: "tags", tags: [{ id: "urn:tag:decor:qloo:brick", name: "Exposed brick" }] }];
    const brief = { ...draft([swatch("Brick ember", "#8B4A3B", ["Exposed brick"])]) };
    const plan = buildPlan(brief as never, evidence, { liked: [], disliked: ["Brick ember"], locked: [] });
    expect(plan.exclusions.tagIds).toEqual(["urn:tag:decor:qloo:brick"]);
  });
});
