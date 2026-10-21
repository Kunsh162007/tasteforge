import { describe, expect, it } from "vitest";
import { createMockLlm } from "@/lib/llm";
import type { Evidence } from "../ledger";
import { toLlmView } from "../ledger";
import { createAliases, leanView, restoreIds } from "./promptView";
import { buildSynthesisPrompt, replySchema, synthesizeBrief, usableRecords } from "./synthesis";
import { goodDraftReply, longId, richLedger } from "./synthesis.fixtures";

describe("lean evidence view", () => {
  const places: Evidence = {
    id: "ev_3",
    endpoint: "/v2/insights",
    params: { type: "place" },
    summary: "10 results; top: A, B",
    entities: [
      { id: longId(1), name: "Cafe A", affinity: 0.91, note: "12 Main St | $$ | 4.5/5 | " + "x".repeat(200), lat: 1.2345, lon: 5.4321 },
      { id: longId(2), name: "Cafe B", affinity: 0.8 },
    ],
  };

  it("drops coordinates, affinities, summaries that repeat the list and long notes, and shortens ids", () => {
    const aliases = createAliases([places]);
    const view = leanView(places, aliases) as { entities: { id: string; name: string; note?: string; affinity?: number; lat?: number }[]; summary?: string };
    expect(view.summary).toBeUndefined();
    expect(view.entities[0]).toEqual({ id: "q1", name: "Cafe A", note: expect.stringMatching(/^12 Main St/) });
    expect(view.entities[0].note?.length).toBeLessThanOrEqual(110);
    expect(view.entities[1].id).toBe("q2");
    expect(JSON.stringify(leanView(places, aliases)).length).toBeLessThan(JSON.stringify(toLlmView(places)).length / 2);
  });

  it("keeps the summary where it is the content, and affinities and notes for hotspots", () => {
    const demographics: Evidence = { id: "ev_4", endpoint: "/v2/insights (urn:demographics)", params: {}, summary: "Audience over-indexes on age 25-34" };
    expect(leanView(demographics, createAliases([]))).toEqual({ evidence_id: "ev_4", summary: "Audience over-indexes on age 25-34" });
    const heat: Evidence = {
      id: "ev_5",
      endpoint: "/v2/insights (urn:heatmap)",
      params: {},
      summary: "5 heatmap hotspots in Indore",
      entities: [{ id: "tsq0ab", name: "Area near 22.7, 75.8", affinity: 0.7, note: "north-east of the centre", lat: 22.7, lon: 75.8 }],
    };
    expect(leanView(heat, createAliases([heat]))).toEqual({
      evidence_id: "ev_5",
      summary: "5 heatmap hotspots in Indore",
      entities: [{ id: "tsq0ab", name: "Area near 22.7, 75.8", note: "north-east of the centre", affinity: 0.7 }],
    });
  });

  it("groups style tags into decor and ambience and shows names only", () => {
    const tags: Evidence = {
      id: "ev_6",
      endpoint: "/v2/insights (urn:tag)",
      params: {},
      summary: "x",
      tags: [
        { id: "urn:tag:decor:qloo:vintage", name: "Vintage", score: 0.6 },
        { id: "urn:tag:ambience:qloo:cozy", name: "Cozy", score: 0.4 },
        { id: "urn:tag:decor:qloo:industrial", name: "Industrial" },
      ],
    };
    expect(leanView(tags, createAliases([tags]))).toEqual({ evidence_id: "ev_6", decor: ["Vintage", "Industrial"], ambience: ["Cozy"] });
  });
});

describe("aliases", () => {
  it("leaves short ids alone and maps aliases back to Qloo ids, dropping ones that were never issued", () => {
    const aliases = createAliases([{ id: "ev_1", endpoint: "/search", params: {}, summary: "", entities: [{ id: longId(7), name: "N" }, { id: "MOCK-ARTIST-1", name: "M" }] }]);
    expect(aliases.toAlias.has("MOCK-ARTIST-1")).toBe(false);
    const restored = restoreIds({ a: [{ label: "x", qlooId: "q1" }, { label: "y", qlooId: "q99" }, { label: "z", qlooId: "MOCK-ARTIST-1" }] }, aliases);
    expect(restored).toEqual({ a: [{ label: "x", qlooId: longId(7) }, { label: "y" }, { label: "z", qlooId: "MOCK-ARTIST-1" }] });
  });
});

describe("synthesis prompt and reply", () => {
  const input = (llm = createMockLlm()) => ({ llm, prompt: "A cafe", mode: "know_audience" as const, city: "Indore", signals: { entityIds: [], tagIds: [], entityNames: [], tagNames: [] }, ledger: richLedger() });

  it("lists the code-chosen swatches and uses short ids and lean records", () => {
    const prompt = buildSynthesisPrompt(input(), []);
    expect(prompt).not.toContain(longId(1));
    expect(prompt).not.toMatch(/"lat"|"lon"/);
    expect(usableRecords(richLedger()).length).toBeGreaterThan(0);
  });

  it("asks for a palette of bare names and no description texts", () => {
    const schema = JSON.stringify(replySchema());
    expect(schema).not.toContain("description");
    const palette = (replySchema() as { properties: { aesthetic: { properties: { palette: { items: { properties: object } } } } } }).properties.aesthetic.properties.palette;
    expect(Object.keys(palette.items.properties).sort()).toEqual(["hex", "label"]);
  });

  it("builds the palette from the brief's own tags, takes names from the model, and restores Qloo ids", async () => {
    const llm = createMockLlm([goodDraftReply()]);
    const draft = await synthesizeBrief(input(llm));
    const palette = draft.aesthetic.palette;
    expect(palette.length).toBeGreaterThanOrEqual(4);
    expect(palette[0].label).toBe("Ivory whisper");
    for (const s of palette) {
      expect(s.tags?.length).toBeGreaterThan(0);
      expect(s.evidence.length).toBeGreaterThan(0);
    }
    expect(palette.some((s) => s.role === "accent")).toBe(true);
    expect(draft.sound.artists[0].qlooId).toBe(longId(1));
    expect(llm.jsonRequests[0].prompt).toContain("Palette swatches");
    expect(llm.jsonRequests[0].prompt).toMatch(/\n1\. #[0-9A-F]{6} base; tags: /);
  });

  it("gives different palettes to briefs with different decor tags, and the same palette twice", async () => {
    const run = async (decor: string[]) => (await synthesizeBrief({ ...input(createMockLlm([goodDraftReply()])), ledger: richLedger(decor) })).aesthetic.palette.map((s) => s.hex).join();
    const a = await run(["Vintage", "Retro", "Nostalgic"]);
    const b = await run(["Minimalist", "Sleek", "Modern"]);
    expect(a).not.toBe(b);
    expect(await run(["Vintage", "Retro", "Nostalgic"])).toBe(a);
  });
});
