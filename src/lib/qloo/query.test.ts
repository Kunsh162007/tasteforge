import { describe, expect, it } from "vitest";
import {
  demographicsQuery,
  entityTagsQuery,
  heatmapQuery,
  insightsQuery,
  searchQuery,
  tagsQuery,
  trendingQuery,
} from "./query";
import { ENTITY_TYPES } from "./types";

const parse = (s: string) => {
  const u = new URL(s, "https://x.test");
  return { path: u.pathname, params: Object.fromEntries(u.searchParams) };
};

describe("searchQuery", () => {
  it("builds /search with query, types and take", () => {
    const { path, params } = parse(
      searchQuery({ query: "Velvet Static", types: ["urn:entity:artist"], take: 5 }),
    );
    expect(path).toBe("/search");
    expect(params).toEqual({ query: "Velvet Static", types: "urn:entity:artist", take: "5" });
  });

  it("rejects an empty query", () => {
    expect(() => searchQuery({ query: "  " })).toThrow(/query/);
  });
});

describe("tagsQuery", () => {
  it("uses filter.query and filter.tag.types", () => {
    const { path, params } = parse(
      tagsQuery({ query: "rooftop", tagTypes: ["urn:tag:ambience:qloo"], take: 10 }),
    );
    expect(path).toBe("/v2/tags");
    expect(params).toEqual({
      "filter.query": "rooftop",
      "filter.tag.types": "urn:tag:ambience:qloo",
      take: "10",
    });
  });

  it("rejects an empty query", () => {
    expect(() => tagsQuery({ query: "" })).toThrow(/query/);
  });
});

describe("insightsQuery", () => {
  it("scores a supplied shortlist with filter.results.entities", () => {
    const { params } = parse(
      insightsQuery({ type: ENTITY_TYPES.brand, entities: ["A1"], tags: ["t1"], resultsEntities: ["X1", "X2"], take: 50 }),
    );
    expect(params["filter.results.entities"]).toBe("X1,X2");
    expect(params["signal.interests.entities"]).toBe("A1");
  });

  it("omits filter.results.entities when the shortlist is empty", () => {
    const { params } = parse(insightsQuery({ type: ENTITY_TYPES.brand, entities: ["A1"], resultsEntities: [] }));
    expect(params["filter.results.entities"]).toBeUndefined();
  });

  it("builds every documented signal and filter name", () => {
    const { path, params } = parse(
      insightsQuery({
        type: ENTITY_TYPES.place,
        entities: ["A1", "B2"],
        tags: ["urn:tag:genre:media:indie"],
        locationQuery: "Brooklyn",
        filterTags: ["urn:tag:decor:qloo:industrial"],
        excludeTags: ["urn:tag:ambience:qloo:loud"],
        priceMin: 1,
        priceMax: 3,
        explainability: true,
        take: 20,
      }),
    );
    expect(path).toBe("/v2/insights");
    expect(params).toEqual({
      "filter.type": "urn:entity:place",
      "signal.interests.entities": "A1,B2",
      "signal.interests.tags": "urn:tag:genre:media:indie",
      "filter.location.query": "Brooklyn",
      "filter.tags": "urn:tag:decor:qloo:industrial",
      "filter.exclude.tags": "urn:tag:ambience:qloo:loud",
      "filter.price_level.min": "1",
      "filter.price_level.max": "3",
      "feature.explainability": "true",
      take: "20",
    });
  });

  it("weights a taste signal toward a place with signal.location.query (verified live 2026-10-21)", () => {
    const { params } = parse(insightsQuery({ type: ENTITY_TYPES.artist, entities: ["A1"], signalLocationQuery: "Indore" }));
    expect(params["signal.location.query"]).toBe("Indore");
    expect(params["filter.location.query"]).toBeUndefined();
    expect(parse(insightsQuery({ type: ENTITY_TYPES.artist, entities: ["A1"] })).params["signal.location.query"]).toBeUndefined();
  });

  it("omits unset optional params and keeps colons readable", () => {
    const q = insightsQuery({ type: ENTITY_TYPES.artist, entities: ["A1"] });
    expect(q).toBe("/v2/insights?filter.type=urn:entity:artist&signal.interests.entities=A1");
  });

  it("encodes spaces and special characters in values", () => {
    const q = insightsQuery({
      type: ENTITY_TYPES.place,
      tags: ["urn:tag:x"],
      locationQuery: "Sao Paulo & Co",
    });
    expect(q).toContain("filter.location.query=Sao%20Paulo%20%26%20Co");
  });

  it("requires at least one signal or filter", () => {
    expect(() => insightsQuery({ type: ENTITY_TYPES.artist })).toThrow(/signal/);
  });

  it("caps take at 50 and rejects invalid price ranges", () => {
    const { params } = parse(
      insightsQuery({ type: ENTITY_TYPES.brand, tags: ["urn:tag:x"], take: 500 }),
    );
    expect(params.take).toBe("50");
    expect(() =>
      insightsQuery({ type: ENTITY_TYPES.place, tags: ["t"], priceMin: 4, priceMax: 2 }),
    ).toThrow(/price/);
    expect(() =>
      insightsQuery({ type: ENTITY_TYPES.place, tags: ["t"], priceMin: 0 }),
    ).toThrow(/price/);
  });

  it("rejects a non-positive take", () => {
    expect(() => insightsQuery({ type: ENTITY_TYPES.brand, tags: ["t"], take: 0 })).toThrow(/take/);
  });
});

describe("demographicsQuery", () => {
  it("sets filter.type=urn:demographics with signals", () => {
    const { params } = parse(demographicsQuery({ entities: ["E1"], tags: ["urn:tag:g"] }));
    expect(params).toEqual({
      "filter.type": "urn:demographics",
      "signal.interests.entities": "E1",
      "signal.interests.tags": "urn:tag:g",
    });
  });

  it("requires an entity or tag", () => {
    expect(() => demographicsQuery({})).toThrow(/entity or tag/);
  });
});

describe("entityTagsQuery", () => {
  it("sets filter.type=urn:tag with entity signal and tag types", () => {
    const { params } = parse(
      entityTagsQuery({
        entities: ["P1"],
        tagTypes: ["urn:tag:decor:qloo", "urn:tag:ambience:qloo"],
        parentTypes: ["urn:entity:place"],
        take: 30,
      }),
    );
    expect(params).toEqual({
      "filter.type": "urn:tag",
      "signal.interests.entities": "P1",
      "filter.tag.types": "urn:tag:decor:qloo,urn:tag:ambience:qloo",
      "filter.parents.types": "urn:entity:place",
      take: "30",
    });
  });

  it("requires entities", () => {
    expect(() => entityTagsQuery({ entities: [] })).toThrow(/entity/);
  });
});

describe("heatmapQuery", () => {
  it("sets filter.type=urn:heatmap with location query and signal", () => {
    const { params } = parse(heatmapQuery({ locationQuery: "NYC", tags: ["urn:tag:x"] }));
    expect(params).toEqual({
      "filter.type": "urn:heatmap",
      "filter.location.query": "NYC",
      "signal.interests.tags": "urn:tag:x",
    });
  });

  it("does not send output.heatmap.boundary (live only accepts urn:geohash or a 30 MB locality list)", () => {
    const { params } = parse(heatmapQuery({ locationQuery: "Indore", tags: ["urn:tag:x"] }));
    expect(params["output.heatmap.boundary"]).toBeUndefined();
  });

  it("requires a location and a signal", () => {
    expect(() => heatmapQuery({ locationQuery: "", tags: ["t"] })).toThrow(/location/);
    expect(() => heatmapQuery({ locationQuery: "NYC" })).toThrow(/signal/);
  });
});

describe("trendingQuery", () => {
  it("builds /v2/trending with dates", () => {
    const { path, params } = parse(
      trendingQuery({
        type: ENTITY_TYPES.artist,
        entities: ["A1"],
        startDate: "2026-09-01",
        endDate: "2026-10-01",
        take: 4,
      }),
    );
    expect(path).toBe("/v2/trending");
    expect(params).toEqual({
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": "A1",
      "filter.start_date": "2026-09-01",
      "filter.end_date": "2026-10-01",
      take: "4",
    });
  });

  it("validates date format and order", () => {
    const base = { type: ENTITY_TYPES.artist, entities: ["A1"] } as const;
    expect(() =>
      trendingQuery({ ...base, startDate: "09/01/2026", endDate: "2026-10-01" }),
    ).toThrow(/date/);
    expect(() =>
      trendingQuery({ ...base, startDate: "2026-10-02", endDate: "2026-10-01" }),
    ).toThrow(/date/);
  });

  it("takes exactly one entity per request", () => {
    expect(() =>
      trendingQuery({ type: ENTITY_TYPES.artist, entities: ["A1", "A2"], startDate: "2026-04-01", endDate: "2026-10-01" }),
    ).toThrow(/exactly one/);
  });

  it("requires an entity", () => {
    expect(() =>
      trendingQuery({
        type: ENTITY_TYPES.artist,
        entities: [],
        startDate: "2026-09-01",
        endDate: "2026-10-01",
      }),
    ).toThrow(/entity/);
  });
});

describe("insightsQuery exclusions", () => {
  it("maps excludeEntities to filter.exclude.entities", () => {
    const { params } = parse(insightsQuery({ type: ENTITY_TYPES.artist, entities: ["E1"], excludeEntities: ["A", "B"] }));
    expect(params["filter.exclude.entities"]).toBe("A,B");
  });
});
