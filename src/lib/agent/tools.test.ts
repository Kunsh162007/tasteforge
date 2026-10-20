import { describe, expect, it } from "vitest";
import { createQlooClient } from "@/lib/qloo";
import { EMPTY_LEDGER } from "./ledger";
import { makeDraft } from "./testing";
import { executeTool, TOOL_DEFINITIONS } from "./tools";

const qloo = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });
const ctx = { qloo, ledger: EMPTY_LEDGER, now: () => new Date("2026-10-18T00:00:00Z") };

const run = (name: string, args: Record<string, unknown>, c = ctx) => executeTool({ name, args }, c);

describe("tool definitions", () => {
  it("exposes all eight tools with clean JSON schemas", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      "qloo_search",
      "qloo_find_tags",
      "qloo_insights",
      "qloo_entity_tags",
      "qloo_demographics",
      "qloo_heatmap",
      "qloo_trending",
      "submit_brief",
    ]);
    const json = JSON.stringify(TOOL_DEFINITIONS);
    expect(json).not.toContain("additionalProperties");
    expect(json).not.toContain("$schema");
    expect(TOOL_DEFINITIONS[2].parameters).toMatchObject({ type: "object", required: ["type"] });
  });
});

describe("executeTool", () => {
  it("search returns entities with an evidence id and updates the ledger", async () => {
    const out = await run("qloo_search", { query: "Cafe Lumen", types: ["place"] });
    expect(out.isError).toBe(false);
    expect(out.evidence?.id).toBe("ev_1");
    expect(out.ledger.records).toHaveLength(1);
    const view = JSON.parse(out.content);
    expect(view.evidence_id).toBe("ev_1");
    expect(view.entities[0]).toMatchObject({ id: "MOCK-PLACE-1", name: "Cafe Lumen" });
    expect(ctx.ledger.records).toHaveLength(0);
  });

  it("insights, tags, entity tags, demographics, heatmap and trending all record evidence", async () => {
    let ledger = EMPTY_LEDGER;
    const calls: [string, Record<string, unknown>][] = [
      ["qloo_insights", { type: "place", location: "Brooklyn", tag_ids: ["urn:tag:genre:media:indie"], take: 3 }],
      ["qloo_find_tags", { query: "cozy" }],
      ["qloo_entity_tags", { entity_ids: ["MOCK-PLACE-1"], tag_types: ["urn:tag:decor:qloo"] }],
      ["qloo_demographics", { entity_ids: ["MOCK-ARTIST-1"] }],
      ["qloo_heatmap", { location: "Brooklyn", entity_ids: ["MOCK-ARTIST-1"] }],
      ["qloo_trending", { type: "artist", entity_ids: ["MOCK-ARTIST-1"], days: 14 }],
    ];
    for (const [name, args] of calls) {
      const out = await run(name, args, { ...ctx, ledger });
      expect(out.isError, `${name}: ${out.content}`).toBe(false);
      expect(out.evidence?.summary).not.toMatch(/^No results/);
      ledger = out.ledger;
    }
    expect(ledger.records.map((r) => r.id)).toEqual(["ev_1", "ev_2", "ev_3", "ev_4", "ev_5", "ev_6"]);
    expect(ledger.records[0].params).toMatchObject({ type: "place", take: "3", tag_ids: "urn:tag:genre:media:indie" });
  });

  it("flags empty results so the model widens", async () => {
    const out = await run("qloo_insights", { type: "place", location: "Atlantis" });
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.content).summary).toMatch(/^No results/);
  });

  it("returns a tool error for invalid args without touching the ledger", async () => {
    const out = await run("qloo_search", { query: "", take: 99 });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/Invalid arguments/);
    expect(out.ledger).toBe(EMPTY_LEDGER);
  });

  it("surfaces client-side errors (missing signal) as tool errors", async () => {
    const out = await run("qloo_insights", { type: "artist" });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content).error).toMatch(/signal/);
  });

  it("rejects unknown tools", async () => {
    const out = await run("qloo_hack", {});
    expect(out.isError).toBe(true);
    expect(out.content).toMatch(/Unknown tool/);
  });

  it("accepts a valid brief and rejects a malformed one", async () => {
    const ok = await run("submit_brief", makeDraft(["ev_1"]));
    expect(ok.isError).toBe(false);
    expect(ok.brief?.title).toBe("Brooklyn dream-pop crowd");
    const bad = await run("submit_brief", { title: "x" });
    expect(bad.isError).toBe(true);
    expect(bad.brief).toBeUndefined();
    expect(JSON.parse(bad.content).error).toMatch(/schema/);
  });

  it("falls back to the real clock when none is injected", async () => {
    const out = await executeTool(
      { name: "qloo_trending", args: { type: "artist", entity_ids: ["MOCK-ARTIST-1"] } },
      { qloo, ledger: EMPTY_LEDGER },
    );
    expect(out.isError).toBe(false);
  });
});
