import { describe, expect, it } from "vitest";
import { createQlooClient, createQlooClientFromEnv, QlooError } from "./index";
import { ENTITY_TYPES } from "./types";

const client = createQlooClient({ baseUrl: "https://mock.test", mode: "mock" });

describe("mock mode", () => {
  it("runs without an API key and returns clearly fake artists", async () => {
    const res = await client.insights({ type: ENTITY_TYPES.artist, entities: ["x"], take: 3 });
    expect(res.data).toHaveLength(3);
    expect(res.data[0]?.name).toBe("Velvet Static (band)");
  });

  it("returns places with decor and ambience tags and locations", async () => {
    const res = await client.insights({
      type: ENTITY_TYPES.place,
      tags: ["urn:tag:x"],
      locationQuery: "Brooklyn",
      explainability: true,
    });
    const ids = res.data.flatMap((p) => p.tags?.map((t) => t.id) ?? []);
    expect(ids.some((i) => i.startsWith("urn:tag:decor:qloo:"))).toBe(true);
    expect(ids.some((i) => i.startsWith("urn:tag:ambience:qloo:"))).toBe(true);
    expect(res.data.every((p) => p.location !== undefined)).toBe(true);
  });

  it("honours filter.tags, filter.exclude.tags and price levels", async () => {
    const base = { type: ENTITY_TYPES.place, locationQuery: "Brooklyn" } as const;
    const only = await client.insights({ ...base, filterTags: ["urn:tag:decor:qloo:industrial"] });
    expect(only.data.map((p) => p.name)).toEqual(["Cafe Lumen"]);

    const excl = await client.insights({
      ...base,
      tags: ["urn:tag:x"],
      excludeTags: ["urn:tag:ambience:qloo:lively"],
    });
    expect(excl.data.map((p) => p.name)).not.toContain("Tin Roof Kitchen (restaurant)");

    const cheap = await client.insights({ ...base, tags: ["urn:tag:x"], priceMax: 1 });
    expect(cheap.data.map((p) => p.name)).toEqual(["Quiet Orbit Records (cafe)"]);
  });

  it("returns an empty result with a warning for uncovered locations", async () => {
    const res = await client.insights({
      type: ENTITY_TYPES.place,
      tags: ["urn:tag:x"],
      locationQuery: "Atlantis",
    });
    expect(res.data).toEqual([]);
    expect(res.warning).toBeDefined();
  });

  it("maps unsupported entity types to a 403 error", async () => {
    const err = await client
      .insights({ type: "urn:entity:music" as never, tags: ["t"] })
      .catch((e: unknown) => e);
    expect((err as QlooError).kind).toBe("unsupported_type");
  });

  it("supports search with type filtering", async () => {
    const res = await client.search({ query: "velvet", types: ["urn:entity:artist"] });
    expect(res.data.map((e) => e.name)).toEqual(["Velvet Static (band)"]);
    const none = await client.search({ query: "velvet", types: ["urn:entity:place"] });
    expect(none.warning).toBeDefined();
  });

  it("supports tag search, optionally by tag type", async () => {
    const all = await client.findTags({ query: "cozy" });
    expect(all.data[0]?.id).toBe("urn:tag:ambience:qloo:cozy");
    const wrongType = await client.findTags({ query: "cozy", tagTypes: ["urn:tag:decor:qloo"] });
    expect(wrongType.data).toEqual([]);
  });

  it("returns tag analysis for an entity", async () => {
    const res = await client.entityTags({
      entities: ["MOCK-PLACE-1"],
      tagTypes: ["urn:tag:decor:qloo"],
    });
    expect(res.data.map((t) => t.id)).toEqual([
      "urn:tag:decor:qloo:industrial",
      "urn:tag:decor:qloo:exposed_brick",
    ]);
  });

  it("returns demographics, heatmap cells and trending", async () => {
    const demo = await client.demographics({ entities: ["MOCK-ARTIST-1"] });
    expect(demo.data[0]?.age["25_to_29"]).toBeGreaterThan(0);

    const heat = await client.heatmap({ locationQuery: "Brooklyn", tags: ["urn:tag:x"] });
    expect(heat.data.length).toBeGreaterThanOrEqual(3);
    expect(heat.data[0]?.geohash).toMatch(/^[0-9a-z]+$/);
    const empty = await client.heatmap({ locationQuery: "Atlantis", tags: ["urn:tag:x"] });
    expect(empty.warning).toBeDefined();

    const trend = await client.trending({
      type: ENTITY_TYPES.artist,
      entities: ["MOCK-ARTIST-1"],
      startDate: "2026-09-01",
      endDate: "2026-10-01",
      take: 3,
    });
    expect(trend.data.map((t) => t.date)).toEqual(["2026-10-01", "2026-09-24", "2026-09-17"]);
  });

  it("serves other entity types", async () => {
    const res = await client.insights({ type: ENTITY_TYPES.movie, tags: ["t"] });
    expect(res.data.length).toBeGreaterThan(0);
  });

  it("is the default when created from an empty environment", async () => {
    const c = createQlooClientFromEnv({});
    const res = await c.insights({ type: ENTITY_TYPES.brand, tags: ["t"] });
    expect(res.data[0]?.name).toContain("(brand)");
  });
});
