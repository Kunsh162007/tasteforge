import { describe, expect, it } from "vitest";
import { createQlooClient } from "./client";
import { queryTokens, tagMatchScore } from "./fixtures/synonyms";
import { ENTITY_TYPES } from "./types";

const client = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });
const names = async (query: string) => (await client.findTags({ query, take: 20 })).data.map((t) => t.name);

describe("mock tag search (substrings and synonyms)", () => {
  it.each([
    ["indie", "Indie"],
    ["cozy", "Cozy"],
    ["cosy brick cafes", "Exposed Brick"],
    ["minimalist", "Minimalist"],
    ["vintage", "Vintage"],
    ["coffee", "Coffee"],
    ["jazz", "Jazz"],
    ["japanese", "Japanese"],
    ["ceramics", "Ceramic"],
    ["slow living", "Slow Living"],
    ["vietnamese food", "Vietnamese"],
    ["A24 films", "Arthouse"],
  ])("finds a tag for %s", async (query, expected) => {
    expect(await names(query)).toContain(expected);
  });

  it("ranks stronger matches first and returns nothing for gibberish", async () => {
    expect((await names("slow living"))[0]).toBe("Slow Living");
    expect((await client.findTags({ query: "zzzzqq" })).data).toEqual([]);
  });

  it("tokenises, singularises and drops stopwords", () => {
    expect(queryTokens("The cosy cafes and boss")).toEqual(["cosy", "cafe", "boss"]);
    expect(tagMatchScore({ id: "urn:tag:x:wabi_sabi", name: "Wabi-Sabi" }, "wabi sabi")).toBeGreaterThan(0);
  });
});

describe("mock filter.results.entities", () => {
  const signals = { entities: ["MOCK-ARTIST-1"], tags: ["t"] };

  it("scores exactly the supplied shortlist for the requested type", async () => {
    const res = await client.insights({
      type: ENTITY_TYPES.brand,
      ...signals,
      resultsEntities: ["MOCK-BRAND-1", "MOCK-MAIN-BRAND-1", "MOCK-ARTIST-1", "NOPE"],
    });
    expect(res.data.map((e) => e.id)).toEqual(["MOCK-BRAND-1", "MOCK-MAIN-BRAND-1"]);
    const [tasteforge, mainstream] = res.data;
    expect(tasteforge.affinity).toBeGreaterThan(0.8);
    expect(mainstream.affinity).toBeLessThan(0.5);
  });

  it("finds mainstream names by search but never lists them in ordinary insights", async () => {
    const found = await client.search({ query: "Starbucks", types: [ENTITY_TYPES.brand] });
    expect(found.data[0]?.id).toBe("MOCK-MAIN-BRAND-1");
    const list = await client.insights({ type: ENTITY_TYPES.brand, tags: ["t"], take: 50 });
    expect(list.data.some((e) => e.id.startsWith("MOCK-MAIN"))).toBe(false);
  });
});

describe("mock heatmap by city", () => {
  const client = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });

  it("returns Indore-area coordinates with area names", async () => {
    const plain = await client.heatmap({ locationQuery: "Indore", tags: ["urn:tag:x"] });
    expect(plain.data.every((c) => c.latitude > 22 && c.latitude < 23.2 && c.longitude > 75 && c.longitude < 76.5)).toBe(true);
    expect(plain.data.map((c) => c.name)).toContain("Vijay Nagar");
  });

  it("keeps Brooklyn data for other covered cities and honours filter.exclude.entities", async () => {
    const ny = await client.heatmap({ locationQuery: "Brooklyn", tags: ["urn:tag:x"] });
    expect(ny.data[0]?.name).toBe("Williamsburg");
    const all = await client.insights({ type: "urn:entity:artist", tags: ["urn:tag:x"], take: 10 });
    const without = await client.insights({ type: "urn:entity:artist", tags: ["urn:tag:x"], excludeEntities: [all.data[0].id], take: 10 });
    expect(without.data.map((e) => e.id)).not.toContain(all.data[0].id);
  });
});
