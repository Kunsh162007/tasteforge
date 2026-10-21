import { describe, expect, it } from "vitest";
import { demographicsDraft, heatmapDraft, trendingDraft } from "./summaries";

const base = { endpoint: "/x", params: {} };
const none = { data: [], warning: "nothing here" };

describe("summaries", () => {
  it("describes empty results with the client warning, or a default hint", () => {
    expect(demographicsDraft(base, none).summary).toBe("No results. nothing here");
    expect(heatmapDraft(base, { data: [] }, "Paris").summary).toMatch(/^No results\. Try broader/);
    expect(trendingDraft(base, none).summary).toMatch(/^No results/);
  });

  it("summarises demographics, heatmap hotspots and trend direction", () => {
    const demo = demographicsDraft(base, {
      data: [{ entityId: "e", age: { "25-34": 0.5, "35-44": 0.2 }, gender: { female: 0.6, male: 0.4 } }],
    });
    expect(demo.summary).toBe("Audience over-indexes (vs general population) on age: 25-34 +50%, 35-44 +20%; gender: female +60%, male +40%");

    const heat = heatmapDraft(
      base,
      { data: [{ geohash: "a", latitude: 1, longitude: 2, affinity: 0.2 }, { geohash: "b", latitude: 3, longitude: 4, affinity: 0.9 }] },
      "Paris",
    );
    expect(heat.entities?.[0]).toMatchObject({ id: "b", name: "Area near 3.000, 4.000", affinity: 0.9, lat: 3, lon: 4 });

    const named = heatmapDraft(base, { data: [{ geohash: "a", name: "Vijay Nagar", latitude: 22.75, longitude: 75.89, affinity: 0.9 }] }, "Indore");
    expect(named.entities?.[0].name).toBe("Vijay Nagar");
    expect(named.summary).toContain("hottest: Vijay Nagar");

    const skew = demographicsDraft(base, { data: [{ entityId: "e", age: { "25-34": -0.3 }, gender: { male: 0.1 } }] });
    expect(skew.summary).toContain("age: no clear skew; gender: male +10%");

    // Qloo ranks popularity (1 is best), so a falling rank number is a rising artist.
    const point = (date: string, populationRank: number) => ({ date, populationRank });
    expect(trendingDraft(base, { data: [point("2026-02-01", 40), point("2026-01-01", 90)] }).summary).toMatch(/rising, now rank 40/);
    expect(trendingDraft(base, { data: [point("2026-02-01", 90), point("2026-01-01", 40)] }).summary).toMatch(/falling/);
    expect(trendingDraft(base, { data: [{ date: "2026-01-01" }] }).summary).toMatch(/flat/);
  });
});

describe("heatmapDraft with a city centre", () => {
  const base = { endpoint: "/v2/insights (urn:heatmap)", params: {} };
  const NYC = { lat: 40.7128, lon: -74.006, radiusKm: 22 };
  const cell = (geohash: string, latitude: number, longitude: number, affinity: number) => ({ geohash, latitude, longitude, affinity });

  it("keeps cells within the city's reach and drops Rochester, however strong", () => {
    const draft = heatmapDraft(
      base,
      { data: [cell("rochester", 43.1566, -77.6088, 1), cell("buffalo", 42.8864, -78.8784, 0.99), cell("les", 40.715, -73.985, 0.9), cell("bk", 40.69, -73.95, 0.8)] },
      "New York",
      NYC,
    );
    expect(draft.entities?.map((e) => e.id)).toEqual(["les", "bk"]);
    expect(draft.summary).toContain("2 heatmap hotspots in New York");
  });

  it("describes direction from the city centre, not from the mean of the cells", () => {
    const draft = heatmapDraft(base, { data: [cell("north", 40.8, -74.006, 0.9)] }, "New York", NYC);
    expect(draft.entities?.[0].note).toBe("north of the New York centre, about 10 km out");
  });

  it("says why nothing is left when every cell lies outside the reach", () => {
    const draft = heatmapDraft(base, { data: [cell("rochester", 43.1566, -77.6088, 1)] }, "New York", NYC);
    expect(draft.summary).toMatch(/^No results\. Every hotspot Qloo returned lies more than 22 km from the New York centre/);
  });

  it("leaves the cells alone when the city centre is unknown", () => {
    const draft = heatmapDraft(base, { data: [cell("a", 43.1566, -77.6088, 1)] }, "Springfield");
    expect(draft.entities).toHaveLength(1);
  });
});
